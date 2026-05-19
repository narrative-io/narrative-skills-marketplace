/**
 * Discover SKILL.md.tmpl files across all plugins.
 *
 * Structure:
 *   plugins/{plugin-name}/skills/{skill-name}/SKILL.md.tmpl
 *
 * Mirrors ai-tools/scripts/discover-skills.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const SKIP = new Set([
  'node_modules', '.git', 'dist', 'scripts', 'bin',
  '.claude-plugin', 'commands', 'test', 'references', 'snippets',
]);

function subdirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && !SKIP.has(d.name))
    .map(d => d.name);
}

export function discoverTemplates(root: string): Array<{ tmpl: string; output: string }> {
  const pluginsDir = path.join(root, 'plugins');
  const results: Array<{ tmpl: string; output: string }> = [];

  for (const plugin of subdirs(pluginsDir)) {
    const skillsDir = path.join(pluginsDir, plugin, 'skills');
    for (const skill of subdirs(skillsDir)) {
      const rel = `plugins/${plugin}/skills/${skill}/SKILL.md.tmpl`;
      if (fs.existsSync(path.join(root, rel))) {
        results.push({ tmpl: rel, output: rel.replace(/\.tmpl$/, '') });
      }
    }
  }

  return results;
}
