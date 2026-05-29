#!/usr/bin/env bun
/**
 * Emit a top-level skills.json — a harness-agnostic discovery index
 * that lists every skill on disk with its frontmatter essentials and
 * the path to its rendered SKILL.md.
 *
 * Output (committed):
 *   skills.json
 *
 * Consumers point at the raw GitHub URL to enumerate available skills
 * without parsing Claude Code's marketplace.json. The agentskills.io
 * spec is the upstream shape we want to align with as it stabilizes;
 * additional fields (`requires`, `recommends`, `plugin`) are extensions.
 *
 * --dry-run: render to memory; exit 1 if skills.json is stale.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  listPlugins,
  listSkills,
  readPluginManifest,
  type SkillArg,
  type SkillCompatibility,
  skillArgs,
  skillRequirements,
  skillVersion,
} from './read-skills';

const ROOT = resolve(import.meta.dir, '..');
const DRY_RUN = process.argv.includes('--dry-run');
const OUT = join(ROOT, 'skills.json');

interface IndexedPlugin {
  name: string;
  version: string;
  description: string;
  /** MCP server names this plugin declares (config is in mcp/<plugin>.mcp.json). */
  mcpServers: string[];
}

interface IndexedSkill {
  name: string;
  version: string;
  description: string;
  plugin: string;
  /** Repo-relative path to the rendered SKILL.md. */
  path: string;
  /** Spec-conforming free-text environment summary. */
  compatibility?: string;
  /** Structured requirements, from the namespaced metadata.narrative. */
  requirements?: SkillCompatibility;
  /** Documented slash-command arguments, from metadata.args. */
  args?: SkillArg[];
}

interface SkillsIndex {
  $schema: string;
  generated_by: string;
  plugins: IndexedPlugin[];
  skills: IndexedSkill[];
}

const plugins: IndexedPlugin[] = [];
for (const plugin of listPlugins(ROOT)) {
  const manifest = readPluginManifest(ROOT, plugin);
  if (!manifest) {
    continue;
  }
  plugins.push({
    name: manifest.name,
    version: manifest.version,
    description: manifest.description ?? '',
    mcpServers: Object.keys(manifest.mcpServers ?? {}).sort(),
  });
}

const skills: IndexedSkill[] = listSkills(ROOT).map((s) => {
  const fm = s.frontmatter;
  const entry: IndexedSkill = {
    name: fm.name ?? s.dir,
    version: skillVersion(fm),
    description: (fm.description ?? '').trim(),
    plugin: s.plugin,
    path: s.relPath,
  };
  const compatibility = (fm.compatibility ?? '').trim();
  if (compatibility) {
    entry.compatibility = compatibility;
  }
  const requirements = skillRequirements(fm);
  if (requirements) {
    entry.requirements = requirements;
  }
  const args = skillArgs(fm);
  if (args) {
    entry.args = args;
  }
  return entry;
});

const index: SkillsIndex = {
  $schema: 'https://agentskills.io/schemas/skills-index.v0.json',
  generated_by: 'scripts/gen-skills-index.ts',
  plugins,
  skills,
};

const content = `${JSON.stringify(index, null, 2)}\n`;

if (DRY_RUN) {
  const existing = existsSync(OUT) ? readFileSync(OUT, 'utf-8') : '';
  if (existing === content) {
    console.log(`FRESH: ${relative(ROOT, OUT)}`);
  } else {
    console.error(`STALE: ${relative(ROOT, OUT)}`);
    console.error('\nskills.json is stale. Run: bun run gen:skills-index');
    process.exit(1);
  }
} else {
  writeFileSync(OUT, content);
  console.log(
    `GENERATED: ${relative(ROOT, OUT)} (${skills.length} skills, ${plugins.length} plugins)`,
  );
}
