/**
 * Shared helper: enumerate every skill on disk and parse its
 * SKILL.md frontmatter into a typed record.
 *
 * Used by:
 *   - gen-mcp-config.ts  — emit portable mcp.json files
 *   - gen-skills-index.ts — emit a harness-agnostic skills.json
 *   - check-spec.ts      — validate against the agentskills.io spec
 *
 * Reads the rendered SKILL.md (not the .tmpl), since downstream
 * consumers always see the rendered output.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

interface CompatibilityRequirements {
  tools?: string[];
  'mcp-servers'?: string[];
  'mcp-tools'?: string[];
}

export interface SkillCompatibility {
  requires?: CompatibilityRequirements;
  recommends?: CompatibilityRequirements;
}

export interface SkillFrontmatter {
  name?: string;
  version?: string;
  description?: string;
  license?: string;
  metadata?: Record<string, unknown>;
  'allowed-tools'?: string[];
  compatibility?: SkillCompatibility;
}

export interface SkillRecord {
  /** Plugin name (matches `plugins/<plugin>/`). */
  plugin: string;
  /** Skill name (matches `plugins/<plugin>/skills/<skill>/`). */
  dir: string;
  /** Absolute path to the rendered SKILL.md. */
  skillMdPath: string;
  /** Repo-relative path to the rendered SKILL.md. */
  relPath: string;
  /** Parsed frontmatter. */
  frontmatter: SkillFrontmatter;
}

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: { name?: string };
  mcpServers?: Record<string, McpServerConfig>;
}

export interface McpServerConfig {
  type?: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function readPluginManifest(root: string, plugin: string): PluginManifest | null {
  const p = join(root, 'plugins', plugin, '.claude-plugin', 'plugin.json');
  if (!existsSync(p)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as PluginManifest;
  } catch {
    return null;
  }
}

export function listPlugins(root: string): string[] {
  const pluginsDir = join(root, 'plugins');
  if (!isDir(pluginsDir)) {
    return [];
  }
  return readdirSync(pluginsDir)
    .filter((d) => !(d.startsWith('.') || d.startsWith('_')) && isDir(join(pluginsDir, d)))
    .sort();
}

function readSkillFromDir(plugin: string, skillsDir: string, dir: string): SkillRecord | null {
  if (dir.startsWith('.') || dir.startsWith('_')) {
    return null;
  }
  const skillDir = join(skillsDir, dir);
  if (!isDir(skillDir)) {
    return null;
  }
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    return null;
  }
  const text = readFileSync(skillMdPath, 'utf-8');
  const { data } = matter(text) as { data: SkillFrontmatter };
  return {
    plugin,
    dir,
    skillMdPath,
    relPath: `plugins/${plugin}/skills/${dir}/SKILL.md`,
    frontmatter: data ?? {},
  };
}

export function listSkills(root: string): SkillRecord[] {
  const out: SkillRecord[] = [];
  for (const plugin of listPlugins(root)) {
    const skillsDir = join(root, 'plugins', plugin, 'skills');
    if (!isDir(skillsDir)) {
      continue;
    }
    for (const dir of readdirSync(skillsDir).sort()) {
      const record = readSkillFromDir(plugin, skillsDir, dir);
      if (record) {
        out.push(record);
      }
    }
  }
  return out;
}
