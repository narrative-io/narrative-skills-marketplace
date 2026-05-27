/**
 * Discover `*.tmpl` template files across all plugins.
 *
 * Structure:
 *   plugins/{plugin-name}/skills/{skill-name}/**\/*.tmpl
 *
 * Templates can live anywhere under a skill directory — `SKILL.md.tmpl`
 * at the root, `references/*.md.tmpl` for shared reference prose,
 * `assets/*.tmpl` for snippet-templated assets, etc. Each renders to a
 * sibling without the `.tmpl` suffix (e.g. `references/X.md.tmpl` →
 * `references/X.md`).
 *
 * Callers that only care about `SKILL.md.tmpl` (e.g. the version
 * checker) should filter the return value.
 *
 * Mirrors ai-tools/scripts/discover-skills.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'scripts',
  'bin',
  '.claude-plugin',
  'commands',
  'test',
  'snippets',
]);

function subdirs(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !SKIP.has(d.name))
    .map((d) => d.name);
}

function walkTmpls(dir: string, results: string[]): void {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) {
        walkTmpls(full, results);
      }
    } else if (entry.isFile() && entry.name.endsWith('.tmpl')) {
      results.push(full);
    }
  }
}

export function discoverTemplates(root: string): Array<{ tmpl: string; output: string }> {
  const pluginsDir = path.join(root, 'plugins');
  const absResults: string[] = [];

  for (const plugin of subdirs(pluginsDir)) {
    const skillsDir = path.join(pluginsDir, plugin, 'skills');
    for (const skill of subdirs(skillsDir)) {
      walkTmpls(path.join(skillsDir, skill), absResults);
    }
  }

  return absResults
    .map((abs) => path.relative(root, abs))
    .sort()
    .map((rel) => ({ tmpl: rel, output: rel.replace(/\.tmpl$/, '') }));
}
