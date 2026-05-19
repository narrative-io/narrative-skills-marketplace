#!/usr/bin/env bun
/**
 * Generate SKILL.md files from SKILL.md.tmpl templates.
 *
 * Pipeline:
 *   read .tmpl → resolve {{PLACEHOLDERS}} → write SKILL.md
 *
 * Supports --dry-run: render to memory, exit 1 if any output differs from
 * the committed SKILL.md. Use this in CI to catch stale generated files.
 *
 * Adapted from ai-tools/scripts/gen-skill-docs.ts. Simpler resolver set —
 * we only ship SNIPPET to start.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverTemplates } from './discover-skills';
import { extractNameAndDescription } from './frontmatter';
import { RESOLVERS } from './resolvers/index';
import type { TemplateContext } from './resolvers/types';

const ROOT = path.resolve(import.meta.dir, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// Claude Code's skill loader caps per-skill descriptions at 1024 chars.
// Anything longer is silently truncated, breaking trigger-phrase
// discovery and the `(plugin-name)` tail. Enforced at build time.
const DESCRIPTION_MAX_CHARS = 1024;

const GENERATED_HEADER =
  `<!-- AUTO-GENERATED from {{SOURCE}} — do not edit directly -->\n` +
  `<!-- Regenerate: bun run gen:skill-docs -->\n`;

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

function processTemplate(tmplPath: string): { outputPath: string; content: string } {
  const tmplContent = fs.readFileSync(tmplPath, 'utf-8');
  const relTmplPath = path.relative(ROOT, tmplPath);
  const outputPath = tmplPath.replace(/\.tmpl$/, '');

  const { name: extractedName, description } = extractNameAndDescription(tmplContent);
  const skillName = extractedName || path.basename(path.dirname(tmplPath));

  if (description.length > DESCRIPTION_MAX_CHARS) {
    throw new Error(
      `Description for skill "${skillName}" is ${description.length} chars, ` +
        `exceeds ${DESCRIPTION_MAX_CHARS}-char cap (in ${relTmplPath}). ` +
        `Trim by collapsing redundant clauses, dropping low-value Use-when triggers, ` +
        `or shortening enumerated lists. Target ≤1000 chars for safety buffer.`,
    );
  }

  const ctx: TemplateContext = { skillName, tmplPath, root: ROOT };

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

  // Insert the AUTO-GENERATED banner immediately after the frontmatter
  // closing `---`. This makes the generated file obvious to anyone who
  // opens it directly, and survives a clean diff against the template.
  const header = GENERATED_HEADER.replace('{{SOURCE}}', path.basename(tmplPath));
  const fmEnd = content.indexOf('---', content.indexOf('---') + 3);
  if (fmEnd === -1) {
    content = header + content;
  } else {
    const insertAt = content.indexOf('\n', fmEnd) + 1;
    content = content.slice(0, insertAt) + header + content.slice(insertAt);
  }

  return { outputPath, content };
}

// ─── Main ───────────────────────────────────────────────────

const templates = discoverTemplates(ROOT);

if (templates.length === 0) {
  console.log('No SKILL.md.tmpl files found.');
  process.exit(0);
}

let hasChanges = false;

for (const { tmpl } of templates) {
  const tmplPath = path.join(ROOT, tmpl);
  const { outputPath, content } = processTemplate(tmplPath);
  const relOutput = path.relative(ROOT, outputPath);

  if (DRY_RUN) {
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

if (DRY_RUN && hasChanges) {
  console.error('\nGenerated SKILL.md files are stale. Run: bun run gen:skill-docs');
  process.exit(1);
}
