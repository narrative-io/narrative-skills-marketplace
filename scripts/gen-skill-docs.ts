#!/usr/bin/env bun
/**
 * Generate rendered files from `*.tmpl` templates across all plugins.
 *
 * Pipeline:
 *   discover plugins/**\/*.tmpl → resolve {{PLACEHOLDERS}} → write sibling
 *
 * The historical case is `SKILL.md.tmpl → SKILL.md` (with frontmatter
 * validation and an HTML banner inserted after the closing `---`). The
 * generalized case is any `*.tmpl` file under a skill directory, with
 * the banner format chosen by extension and frontmatter checks gated
 * on whether the file actually starts with frontmatter.
 *
 * Templates may opt out of rendering entirely by placing a marker as
 * their first non-blank line:
 *   markdown:  <!-- narrative-skills:no-render -->
 *   yaml/etc:  # narrative-skills:no-render
 * This is for templates that use a `.tmpl` extension to signal
 * *runtime* macro substitution by an agent rather than build-time
 * snippet expansion (e.g. workflow YAMLs with `<RUN_SLUG_KEBAB>` macros).
 *
 * Supports --dry-run: render to memory, exit 1 if any output differs
 * from the committed file. Used in CI to catch stale generated files.
 *
 * Adapted from ai-tools/scripts/gen-skill-docs.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverTemplates } from './discover-skills';
import { extractNameAndDescription } from './frontmatter';
import { RESOLVERS } from './resolvers/index';
import type { TemplateContext } from './resolvers/types';

const DEFAULT_ROOT = path.resolve(import.meta.dir, '..');

// Claude Code's skill loader caps per-skill descriptions at 1024 chars.
// Anything longer is silently truncated, breaking trigger-phrase
// discovery and the `(plugin-name)` tail. Enforced at build time.
const DESCRIPTION_MAX_CHARS = 1024;

// Per-extension banner syntax. Extensions absent from this map render
// without a banner (with a stderr warning), since there's no safe
// language-level way to prefix metadata into the file.
type BannerStyle = { open: string; close: string };
const BANNER_BY_EXT: Record<string, BannerStyle> = {
  '.md': { open: '<!--', close: '-->' },
  '.yaml': { open: '#', close: '' },
  '.yml': { open: '#', close: '' },
};

export const OPT_OUT_MARKER = 'narrative-skills:no-render';

// Placeholder syntax: {{NAME}} or {{NAME:arg1:arg2}}
// Resolver name is UPPERCASE_WITH_UNDERSCORES, args are colon-separated.
const PLACEHOLDER_RE = /\{\{([A-Z_]+(?::[^}]+)?)\}\}/g;

function renderPlaceholders(content: string, ctx: TemplateContext, relTmplPath: string): string {
  return content.replace(PLACEHOLDER_RE, (_match, fullKey: string) => {
    const [resolverName, ...args] = fullKey.split(':');
    if (!resolverName) {
      throw new Error(`Empty placeholder in ${relTmplPath}`);
    }
    const resolver = RESOLVERS[resolverName];
    if (!resolver) {
      throw new Error(`Unknown placeholder {{${resolverName}}} in ${relTmplPath}`);
    }
    return args.length > 0 ? resolver(ctx, args) : resolver(ctx);
  });
}

function hasFrontmatter(content: string): boolean {
  return content.startsWith('---\n') || content.startsWith('---\r\n');
}

function firstNonBlankLine(content: string): string {
  for (const line of content.split('\n')) {
    if (line.trim() !== '') {
      return line.trim();
    }
  }
  return '';
}

export function isOptOut(content: string): boolean {
  const line = firstNonBlankLine(content);
  // Match `# narrative-skills:no-render` (YAML) or
  // `<!-- narrative-skills:no-render -->` (markdown) after stripping
  // leading comment punctuation.
  const stripped = line
    .replace(/^<!--\s*/, '')
    .replace(/\s*-->$/, '')
    .replace(/^#\s*/, '')
    .trim();
  return stripped === OPT_OUT_MARKER;
}

export function bannerFor(outputPath: string, sourceBasename: string): string | null {
  const ext = path.extname(outputPath);
  const style = BANNER_BY_EXT[ext];
  if (!style) {
    return null;
  }
  const lines = [
    `AUTO-GENERATED from ${sourceBasename} — do not edit directly`,
    'Regenerate: bun run gen:skill-docs',
  ];
  if (style.close) {
    return `${lines.map((l) => `${style.open} ${l} ${style.close}`).join('\n')}\n`;
  }
  return `${lines.map((l) => `${style.open} ${l}`).join('\n')}\n`;
}

export type ProcessResult =
  | { kind: 'rendered'; outputPath: string; content: string }
  | { kind: 'skipped'; reason: string };

export function processTemplate(tmplPath: string, root: string = DEFAULT_ROOT): ProcessResult {
  const tmplContent = fs.readFileSync(tmplPath, 'utf-8');
  const relTmplPath = path.relative(root, tmplPath);
  const outputPath = tmplPath.replace(/\.tmpl$/, '');

  if (isOptOut(tmplContent)) {
    return { kind: 'skipped', reason: 'opt-out marker' };
  }

  const isSkillTemplate = path.basename(tmplPath) === 'SKILL.md.tmpl';
  const fm = isSkillTemplate
    ? extractNameAndDescription(tmplContent)
    : { name: '', description: '' };
  const skillName = fm.name || path.basename(path.dirname(tmplPath));

  if (isSkillTemplate && fm.description.length > DESCRIPTION_MAX_CHARS) {
    throw new Error(
      `Description for skill "${skillName}" is ${fm.description.length} chars, ` +
        `exceeds ${DESCRIPTION_MAX_CHARS}-char cap (in ${relTmplPath}). ` +
        `Trim by collapsing redundant clauses, dropping low-value Use-when triggers, ` +
        `or shortening enumerated lists. Target ≤1000 chars for safety buffer.`,
    );
  }

  const ctx: TemplateContext = { skillName, tmplPath, root };

  // Resolve placeholders. Re-run up to 5 times to allow snippets that
  // themselves contain {{...}} placeholders to resolve transitively. A
  // small fixed bound is plenty and catches accidental infinite loops.
  let content = tmplContent;
  for (let i = 0; i < 5; i++) {
    const before = content;
    content = renderPlaceholders(content, ctx, relTmplPath);
    if (content === before) {
      break;
    }
  }

  const remaining = content.match(PLACEHOLDER_RE);
  if (remaining) {
    throw new Error(`Unresolved placeholders in ${relTmplPath}: ${remaining.join(', ')}`);
  }

  // Insert the AUTO-GENERATED banner. For SKILL.md.tmpl (which has
  // YAML frontmatter), it goes immediately after the closing `---` so
  // the rendered file still parses cleanly. For files without
  // frontmatter, it goes at the very top. For extensions with no
  // known comment syntax (.json etc.), skip the banner and warn.
  const banner = bannerFor(outputPath, path.basename(tmplPath));
  if (banner === null) {
    console.warn(
      `WARN: no banner written to ${path.relative(root, outputPath)} ` +
        `(${path.extname(outputPath)} has no known comment syntax)`,
    );
  } else if (hasFrontmatter(content)) {
    const fmEnd = content.indexOf('---', content.indexOf('---') + 3);
    if (fmEnd === -1) {
      content = banner + content;
    } else {
      const insertAt = content.indexOf('\n', fmEnd) + 1;
      content = content.slice(0, insertAt) + banner + content.slice(insertAt);
    }
  } else {
    content = banner + content;
  }

  return { kind: 'rendered', outputPath, content };
}

// ─── Main ───────────────────────────────────────────────────

if (import.meta.main) {
  const dryRun = process.argv.includes('--dry-run');
  const templates = discoverTemplates(DEFAULT_ROOT);

  if (templates.length === 0) {
    console.log('No .tmpl files found.');
    process.exit(0);
  }

  let hasChanges = false;

  for (const { tmpl } of templates) {
    const tmplPath = path.join(DEFAULT_ROOT, tmpl);
    const result = processTemplate(tmplPath, DEFAULT_ROOT);

    if (result.kind === 'skipped') {
      console.log(`SKIP: ${tmpl} (${result.reason})`);
      continue;
    }

    const { outputPath, content } = result;
    const relOutput = path.relative(DEFAULT_ROOT, outputPath);

    if (dryRun) {
      const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';
      if (existing === content) {
        console.log(`FRESH: ${relOutput}`);
      } else {
        console.log(`STALE: ${relOutput}`);
        hasChanges = true;
      }
    } else {
      fs.writeFileSync(outputPath, content);
      const lines = content.split('\n').length;
      const tokens = Math.round(content.length / 4);
      console.log(`GENERATED: ${relOutput} (${lines} lines, ~${tokens} tokens)`);
    }
  }

  if (dryRun && hasChanges) {
    console.error('\nGenerated files are stale. Run: bun run gen:skill-docs');
    process.exit(1);
  }
}
