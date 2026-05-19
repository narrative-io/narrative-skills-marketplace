#!/usr/bin/env bun
/**
 * Validate marketplace.json, every plugin.json, and every SKILL.md
 * frontmatter against the minimum schema this marketplace requires.
 *
 * Catches the kinds of mistakes that won't show up until a user actually
 * tries to install the plugin in Claude Code:
 *   - missing or unknown plugin in marketplace.json
 *   - plugin.json missing `name` / `version`
 *   - skill `name` not matching its directory
 *   - skill frontmatter missing required fields
 *   - description over the 1024-char cap (also enforced by gen-skill-docs)
 *
 * Exits non-zero on any failure so CI can gate on it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { extractNameAndDescription } from './frontmatter.ts';

const ROOT = resolve(import.meta.dir, '..');
const DESCRIPTION_MAX_CHARS = 1024;

interface MarketplacePlugin {
  name: string;
  description?: string;
  version?: string;
  source?: string;
}

interface Marketplace {
  name: string;
  owner?: { name?: string; email?: string };
  plugins: MarketplacePlugin[];
}

interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: { name?: string };
}

const errors: string[] = [];

function fail(file: string, msg: string): void {
  errors.push(`${relative(ROOT, file)}: ${msg}`);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as T;
  } catch (err) {
    fail(file, `invalid JSON — ${(err as Error).message}`);
    return null;
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// ─── Marketplace ─────────────────────────────────────────────

const marketplacePath = join(ROOT, '.claude-plugin', 'marketplace.json');
if (!existsSync(marketplacePath)) {
  fail(marketplacePath, 'missing — every marketplace must have .claude-plugin/marketplace.json');
  console.error(errors.join('\n'));
  process.exit(1);
}

const marketplace = readJson<Marketplace>(marketplacePath);
if (!marketplace) {
  console.error(errors.join('\n'));
  process.exit(1);
}

if (!marketplace.name) {
  fail(marketplacePath, 'missing top-level "name"');
}
if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
  fail(marketplacePath, 'missing or empty "plugins" array');
}

const declaredPlugins = new Set<string>();
for (const entry of marketplace.plugins ?? []) {
  if (!entry.name) {
    fail(marketplacePath, 'a plugins[] entry is missing "name"');
    continue;
  }
  declaredPlugins.add(entry.name);
  if (!entry.source) {
    fail(marketplacePath, `plugin "${entry.name}" is missing "source"`);
  } else if (!entry.source.startsWith('./plugins/')) {
    fail(
      marketplacePath,
      `plugin "${entry.name}" source "${entry.source}" should start with "./plugins/"`,
    );
  }
  if (!entry.version) {
    fail(marketplacePath, `plugin "${entry.name}" is missing "version"`);
  }
}

// ─── Per-plugin manifests + skills ───────────────────────────

const pluginsDir = join(ROOT, 'plugins');
const onDiskPlugins = isDir(pluginsDir)
  ? readdirSync(pluginsDir).filter((d) => isDir(join(pluginsDir, d)) && !d.startsWith('.'))
  : [];

for (const pluginName of onDiskPlugins) {
  if (!declaredPlugins.has(pluginName)) {
    fail(
      marketplacePath,
      `plugins/${pluginName}/ exists on disk but is not declared in marketplace.json`,
    );
  }
}

for (const pluginName of declaredPlugins) {
  const pluginDir = join(pluginsDir, pluginName);
  if (!isDir(pluginDir)) {
    fail(
      marketplacePath,
      `declared plugin "${pluginName}" has no plugins/${pluginName}/ directory`,
    );
    continue;
  }

  const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) {
    fail(manifestPath, 'missing plugin.json');
    continue;
  }
  const manifest = readJson<PluginManifest>(manifestPath);
  if (!manifest) {
    continue;
  }

  if (!manifest.name) {
    fail(manifestPath, 'missing "name"');
  } else if (manifest.name !== pluginName) {
    fail(manifestPath, `name "${manifest.name}" does not match directory "${pluginName}"`);
  }
  if (!manifest.version) {
    fail(manifestPath, 'missing "version"');
  }
  if (!manifest.description) {
    fail(manifestPath, 'missing "description"');
  }

  // Skills
  const skillsDir = join(pluginDir, 'skills');
  if (!isDir(skillsDir)) {
    continue;
  }
  for (const skillEntry of readdirSync(skillsDir)) {
    const skillDir = join(skillsDir, skillEntry);
    if (!isDir(skillDir) || skillEntry.startsWith('.')) {
      continue;
    }
    const skillMd = join(skillDir, 'SKILL.md');
    if (!existsSync(skillMd)) {
      fail(skillDir, 'missing SKILL.md');
      continue;
    }
    const text = readFileSync(skillMd, 'utf-8');
    const { name, description } = extractNameAndDescription(text);
    if (!name) {
      fail(skillMd, 'frontmatter missing "name"');
    } else if (name !== skillEntry) {
      fail(skillMd, `frontmatter name "${name}" does not match directory "${skillEntry}"`);
    }
    if (!description) {
      fail(skillMd, 'frontmatter missing "description"');
    } else if (description.length > DESCRIPTION_MAX_CHARS) {
      fail(
        skillMd,
        `description is ${description.length} chars, exceeds ${DESCRIPTION_MAX_CHARS}-char cap`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Manifest validation failed:');
  for (const e of errors) {
    console.error(`  ✗ ${e}`);
  }
  process.exit(1);
}

console.log('Manifests OK.');
