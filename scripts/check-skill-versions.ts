#!/usr/bin/env bun
/**
 * Enforce that any modified `plugins/**\/SKILL.md.tmpl` has its
 * frontmatter `version:` strictly bumped (semver MAJOR.MINOR.PATCH).
 *
 * Runs in two contexts:
 *   - Local pre-commit (via lefthook), passed staged file paths.
 *   - CI on pull requests, compared against the PR base branch.
 *
 * Usage:
 *   bun run scripts/check-skill-versions.ts [--base=<ref>] [path ...]
 *
 * Flags:
 *   --base=<ref>   Git ref to compare against. Defaults to HEAD (covers
 *                  the pre-commit case). CI passes the PR base, e.g.
 *                  --base=origin/main.
 *
 * Args:
 *   path ...       Optional. Files to check. Non-tmpl paths are ignored
 *                  silently so lefthook can pass mixed staged files.
 *                  If no paths are given, every SKILL.md.tmpl on disk is
 *                  checked.
 *
 * Skip rules:
 *   - New files (not present at the base ref) — no prior version to bump.
 *   - Unchanged files (working-tree bytes match the base ref).
 *
 * Failure conditions:
 *   - `version:` missing or not of the form `\d+\.\d+\.\d+` in the
 *     current file.
 *   - Current version not strictly greater than the base version.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { discoverTemplates } from './discover-skills.ts';
import { extractVersion } from './frontmatter.ts';

const ROOT = resolve(import.meta.dir, '..');
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

interface Args {
  base: string;
  paths: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = { base: 'HEAD', paths: [] };
  for (const a of argv) {
    if (a.startsWith('--base=')) {
      args.base = a.slice('--base='.length);
    } else if (a.startsWith('--')) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      args.paths.push(a);
    }
  }
  return args;
}

function gitShow(ref: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function parseSemver(v: string): [number, number, number] | null {
  const m = v.match(SEMVER_RE);
  if (!m) {
    return null;
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isStrictlyGreater(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    const ai = a[i] as number;
    const bi = b[i] as number;
    if (ai !== bi) {
      return ai > bi;
    }
  }
  return false;
}

const TMPL_RE = /^plugins\/[^/]+\/skills\/[^/]+\/SKILL\.md\.tmpl$/;

function isTmpl(relPath: string): boolean {
  return TMPL_RE.test(relPath);
}

const args = parseArgs(process.argv.slice(2));

let candidates: string[];
if (args.paths.length > 0) {
  candidates = args.paths.map((p) => relative(ROOT, resolve(ROOT, p))).filter((p) => isTmpl(p));
} else {
  candidates = discoverTemplates(ROOT).map((t) => t.tmpl);
}

const errors: string[] = [];

for (const relPath of candidates) {
  const absPath = resolve(ROOT, relPath);

  if (!existsSync(absPath)) {
    continue;
  }

  const baseContent = gitShow(args.base, relPath);
  if (baseContent === null) {
    continue;
  }

  const currentContent = readFileSync(absPath, 'utf-8');
  if (currentContent === baseContent) {
    continue;
  }

  const currentVersion = extractVersion(currentContent);
  if (!currentVersion) {
    errors.push(`${relPath}: missing frontmatter "version:" field`);
    continue;
  }
  const currentSemver = parseSemver(currentVersion);
  if (!currentSemver) {
    errors.push(`${relPath}: version "${currentVersion}" is not MAJOR.MINOR.PATCH (e.g. 0.2.0)`);
    continue;
  }

  const baseVersion = extractVersion(baseContent);
  if (!baseVersion) {
    continue;
  }
  const baseSemver = parseSemver(baseVersion);
  if (!baseSemver) {
    continue;
  }

  if (!isStrictlyGreater(currentSemver, baseSemver)) {
    errors.push(
      `${relPath}: content changed but version is still ${currentVersion} ` +
        `(base ${args.base} is ${baseVersion}). Bump the version in the frontmatter.`,
    );
  }
}

if (errors.length > 0) {
  console.error('Skill version check failed:');
  for (const e of errors) {
    console.error(`  ✗ ${e}`);
  }
  process.exit(1);
}

console.log(`Skill versions OK (base ${args.base}).`);
