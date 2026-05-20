#!/usr/bin/env bun
/**
 * Regenerate the Plugins section of README.md from plugin/skill manifests.
 *
 * Walks every plugin listed in `.claude-plugin/marketplace.json`, reads its
 * `plugin.json` for the description, and lists every skill under
 * `plugins/<plugin>/skills/<skill>/SKILL.md` with the "Use when:" trigger
 * phrases pulled from the skill's frontmatter description.
 *
 * Content is written between the `<!-- BEGIN PLUGINS -->` and
 * `<!-- END PLUGINS -->` markers in README.md.
 *
 * --dry-run: render to memory; exit 1 if README.md is stale.
 */
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { extractNameAndDescription } from './frontmatter.ts';

const BEGIN = '<!-- BEGIN PLUGINS -->';
const END = '<!-- END PLUGINS -->';

interface PluginManifest {
  description?: string;
}

interface MarketplaceEntry {
  name: string;
}

interface Marketplace {
  plugins?: MarketplaceEntry[];
}

function extractUseWhen(description: string): string {
  const m = description.match(/Use when:\s*([\s\S]+?)(?:\n\n|\n\(|$)/);
  if (!m?.[1]) {
    return '';
  }
  return m[1].replace(/\s+/g, ' ').trim();
}

async function renderPlugins(root: string): Promise<string> {
  const marketplace = (await Bun.file(
    join(root, '.claude-plugin/marketplace.json'),
  ).json()) as Marketplace;
  const out: string[] = ['## Plugins', ''];
  for (const plugin of marketplace.plugins ?? []) {
    const name = plugin.name;
    const pluginDir = join(root, 'plugins', name);
    const manifest = (await Bun.file(
      join(pluginDir, '.claude-plugin/plugin.json'),
    ).json()) as PluginManifest;
    out.push(`### \`${name}\``);
    out.push('');
    out.push((manifest.description ?? '').trim());
    out.push('');

    const skillsDir = join(pluginDir, 'skills');
    const rows: string[] = [];
    let entries: string[] = [];
    try {
      entries = readdirSync(skillsDir).sort();
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      const skillMd = Bun.file(join(skillsDir, entry, 'SKILL.md'));
      if (!(await skillMd.exists())) {
        continue;
      }
      const { name: skillName, description } = extractNameAndDescription(await skillMd.text());
      const useWhen = extractUseWhen(description);
      rows.push(`| \`/${skillName || entry}\` | ${useWhen.replace(/\|/g, '\\|')} |`);
    }
    if (rows.length > 0) {
      out.push('| Skill | Use when |');
      out.push('|-------|----------|');
      out.push(...rows);
      out.push('');
    }
  }
  return `${out.join('\n').replace(/\s+$/, '')}\n`;
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const positional = args.find((a) => !a.startsWith('--'));
const root = resolve(positional ?? join(import.meta.dir, '..'));
const readmePath = join(root, 'README.md');
const text = await Bun.file(readmePath).text();
const block = `${BEGIN}\n${await renderPlugins(root)}\n${END}`;
const pattern = /<!-- BEGIN PLUGINS -->[\s\S]*?<!-- END PLUGINS -->/;
const updated = pattern.test(text)
  ? text.replace(pattern, block)
  : `${text.replace(/\s+$/, '')}\n\n${block}\n`;

if (DRY_RUN) {
  if (updated === text) {
    console.log(`FRESH: ${relative(root, readmePath)}`);
  } else {
    console.error(`STALE: ${relative(root, readmePath)}`);
    console.error('\nREADME.md plugin catalog is stale. Run: bun run gen:readme');
    process.exit(1);
  }
} else if (updated === text) {
  console.log(`  ${relative(root, readmePath)} already up to date`);
} else {
  await Bun.write(readmePath, updated);
  console.log(`  regenerated ${relative(root, readmePath)}`);
}
