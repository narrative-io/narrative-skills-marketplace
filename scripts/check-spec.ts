#!/usr/bin/env bun
/**
 * Validate every rendered SKILL.md against the public Agent Skills
 * specification (https://agentskills.io). Catches drift that
 * `check-manifests.ts` doesn't — that file enforces our local marketplace
 * conventions; this one enforces the portable spec other harnesses rely on.
 *
 * Spec rules enforced:
 *   - `name` matches ^[a-z0-9]+(-[a-z0-9]+)*$ and is ≤ 64 chars.
 *   - `description` is present and ≤ 1024 chars.
 *   - `compatibility`, if present, is a free-text string ≤ 500 chars
 *     (the spec type — a structured object here is a conformance break).
 *   - `metadata.version` is present and parses as MAJOR.MINOR.PATCH.
 *   - SKILL.md filename uses the canonical uppercase form.
 *   - Frontmatter is valid YAML and starts at line 1.
 *   - `metadata.narrative`, if present, uses only the documented sub-keys.
 *
 * Local-extension rules (warnings, not failures):
 *   - The structured requirements object lives under the namespaced
 *     `metadata.narrative` key (the spec's designated extension point),
 *     keeping the top-level `compatibility` field spec-conforming. Other
 *     harnesses ignore the namespace and still run the base skill.
 *
 * Exits non-zero on any failure so CI can gate on it.
 */
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import matter from 'gray-matter';
import { listSkills, type SkillCompatibility, type SkillFrontmatter } from './read-skills';

const ROOT = resolve(import.meta.dir, '..');

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
const COMPATIBILITY_MAX = 500;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const KNOWN_COMPAT_BUCKETS = new Set(['requires', 'recommends']);
const KNOWN_COMPAT_KEYS = new Set(['tools', 'mcp-servers', 'mcp-tools']);

const errors: string[] = [];
const warnings: string[] = [];

function fail(file: string, msg: string): void {
  errors.push(`${relative(ROOT, file)}: ${msg}`);
}

function warn(file: string, msg: string): void {
  warnings.push(`${relative(ROOT, file)}: ${msg}`);
}

function checkCompatibility(skillMd: string, compat: SkillCompatibility): void {
  for (const [bucket, contents] of Object.entries(compat)) {
    if (!KNOWN_COMPAT_BUCKETS.has(bucket)) {
      warn(
        skillMd,
        `compatibility.${bucket} is not a known bucket (expected: requires, recommends)`,
      );
      continue;
    }
    if (contents == null || typeof contents !== 'object') {
      fail(skillMd, `compatibility.${bucket} must be an object`);
      continue;
    }
    for (const key of Object.keys(contents)) {
      if (!KNOWN_COMPAT_KEYS.has(key)) {
        warn(
          skillMd,
          `compatibility.${bucket}.${key} is not a known key (expected: tools, mcp-servers, mcp-tools)`,
        );
      }
    }
  }
}

for (const skill of listSkills(ROOT)) {
  const text = readFileSync(skill.skillMdPath, 'utf-8');
  if (!text.startsWith('---')) {
    fail(skill.skillMdPath, 'SKILL.md must begin with YAML frontmatter (---)');
    continue;
  }

  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(text);
  } catch (err) {
    fail(skill.skillMdPath, `invalid YAML frontmatter — ${(err as Error).message}`);
    continue;
  }

  const data = parsed.data as SkillFrontmatter;

  const name = typeof data.name === 'string' ? data.name : '';
  if (name) {
    if (!NAME_RE.test(name)) {
      fail(
        skill.skillMdPath,
        `name "${name}" must match ${NAME_RE} (lowercase, digits, hyphens; no leading/trailing/double hyphens)`,
      );
    }
    if (name.length > NAME_MAX) {
      fail(skill.skillMdPath, `name "${name}" is ${name.length} chars; spec cap is ${NAME_MAX}`);
    }
    if (name !== skill.dir) {
      fail(skill.skillMdPath, `name "${name}" does not match directory "${skill.dir}"`);
    }
  } else {
    fail(skill.skillMdPath, 'frontmatter "name" is required');
  }

  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (!description) {
    fail(skill.skillMdPath, 'frontmatter "description" is required');
  } else if (description.length > DESCRIPTION_MAX) {
    fail(
      skill.skillMdPath,
      `description is ${description.length} chars; spec cap is ${DESCRIPTION_MAX}`,
    );
  }

  const version = typeof data.metadata?.version === 'string' ? data.metadata.version : '';
  if (!version) {
    fail(
      skill.skillMdPath,
      'frontmatter "metadata.version" is required (local convention; bumped on every change)',
    );
  } else if (!SEMVER_RE.test(version)) {
    fail(
      skill.skillMdPath,
      `metadata.version "${version}" is not valid semver (MAJOR.MINOR.PATCH)`,
    );
  }

  if (!skill.skillMdPath.endsWith('/SKILL.md')) {
    fail(skill.skillMdPath, 'SKILL.md filename must use the canonical uppercase form');
  }

  if (data.compatibility !== undefined) {
    if (typeof data.compatibility !== 'string') {
      fail(
        skill.skillMdPath,
        'compatibility must be a free-text string (spec type); move structured requirements to metadata.narrative',
      );
    } else if (data.compatibility.length > COMPATIBILITY_MAX) {
      fail(
        skill.skillMdPath,
        `compatibility is ${data.compatibility.length} chars; spec cap is ${COMPATIBILITY_MAX}`,
      );
    }
  }

  const narrative = data.metadata?.narrative;
  if (narrative && typeof narrative === 'object') {
    checkCompatibility(skill.skillMdPath, narrative);
  }
}

if (warnings.length > 0) {
  console.warn('Spec warnings (non-fatal):');
  for (const w of warnings) {
    console.warn(`  ! ${w}`);
  }
}

if (errors.length > 0) {
  console.error('Spec validation failed:');
  for (const e of errors) {
    console.error(`  ✗ ${e}`);
  }
  process.exit(1);
}

console.log('Spec OK.');
