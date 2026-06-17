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
  /**
   * Fully-qualified ids (`<plugin>:<skill>`) of other skills this skill
   * depends on. `requires.skills` is load-bearing (the body invokes the
   * dependency mid-flow); `recommends.skills` is a suggested companion.
   * Validated against the discovered skill set by check-manifests.ts.
   */
  skills?: string[];
}

export interface SkillCompatibility {
  requires?: CompatibilityRequirements;
  recommends?: CompatibilityRequirements;
}

/**
 * The `metadata.narrative` namespace: the structured requirements
 * (`requires`/`recommends`) plus local extensions homed alongside them
 * — currently the documented slash-command `args`. See
 * docs/authoring-skills.md §11.
 */
export interface NarrativeMetadata extends SkillCompatibility {
  /** Documented slash-command arguments (local extension). */
  args?: SkillArg[];
}

/** One documented slash-command argument, from `metadata.narrative.args`. */
export interface SkillArg {
  /** Flag or placeholder, e.g. `--dataset` or `<free-text tail>`. */
  name: string;
  /** Value placeholder for flags that take one, e.g. `<id|name>`. */
  value?: string;
  /** Whether the argument must be supplied (vs. prompted or optional). */
  required?: boolean;
  /** Default applied when the argument is omitted, if any. */
  default?: unknown;
  /** What the argument does and how to use it. */
  description?: string;
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  license?: string;
  /** Spec-conforming free-text environment summary (≤ 500 chars). */
  compatibility?: string;
  'allowed-tools'?: string[];
  /**
   * The spec's designated extension point. `version` lives here (per the
   * spec's own example); everything Narrative-specific — the structured
   * requirements and the documented `args` — lives under the namespaced
   * `narrative` key. See docs/authoring-skills.md §11.
   */
  metadata?: {
    version?: string;
    narrative?: NarrativeMetadata;
    [key: string]: unknown;
  };
}

/** The skill's version, homed under `metadata.version` (spec-conforming). */
export function skillVersion(fm: SkillFrontmatter): string {
  return String(fm.metadata?.version ?? '').trim();
}

/**
 * Structured requirements, homed under the namespaced `metadata.narrative`.
 * Returns only `requires`/`recommends`; the sibling `args` extension is
 * surfaced separately via `skillArgs`.
 */
export function skillRequirements(fm: SkillFrontmatter): SkillCompatibility | undefined {
  const narrative = fm.metadata?.narrative;
  if (!narrative) {
    return undefined;
  }
  const { requires, recommends } = narrative;
  if (requires === undefined && recommends === undefined) {
    return undefined;
  }
  const out: SkillCompatibility = {};
  if (requires !== undefined) {
    out.requires = requires;
  }
  if (recommends !== undefined) {
    out.recommends = recommends;
  }
  return out;
}

/** Documented slash-command arguments, homed under `metadata.narrative.args`. */
export function skillArgs(fm: SkillFrontmatter): SkillArg[] | undefined {
  const args = fm.metadata?.narrative?.args;
  return Array.isArray(args) ? args : undefined;
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
