#!/usr/bin/env bun
/**
 * Cut a CalVer release of the marketplace.
 *
 * Versions look like `YYYY.MM.PATCH` (e.g. `2026.05.0`), tagged as `vYYYY.MM.PATCH`.
 * Same-month follow-ups bump the patch; a new month resets the patch to 0.
 *
 * Modes:
 *   bun run release                    Preview only (default).
 *   bun run release --apply            Write CHANGELOG, commit, tag locally.
 *   bun run release --apply --push     Same, then `git push --follow-tags`.
 *   bun run release --release-as=X.Y.Z Override the computed version.
 *
 * After --apply (without --push) you still need to run:
 *   git push origin main --follow-tags
 *
 * See RELEASING.md for the full process.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Commit = {
  sha: string;
  type: string;
  scope: string | null;
  breaking: boolean;
  subject: string;
};

const REPO_ROOT = resolve(import.meta.dir, '..');
const CHANGELOG_PATH = resolve(REPO_ROOT, 'CHANGELOG.md');
const RELEASES_MARKER = '<!-- RELEASES BELOW -->';

const TAG_PREFIX = 'v';

const TYPE_HEADERS: Record<string, string> = {
  feat: '### ✨ Features',
  fix: '### 🐛 Bug Fixes',
  perf: '### ⚡ Performance',
  refactor: '### ♻️ Refactor',
  docs: '### 📚 Documentation',
  ci: '### 🤖 CI / Tooling',
  build: '### 📦 Build',
  chore: '### 🧹 Maintenance',
  test: '### ✅ Tests',
  other: '### Other',
};

const TYPE_ORDER = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'ci',
  'build',
  'chore',
  'test',
  'other',
];

function sh(cmd: string): string {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
}

function parseArgs(argv: string[]) {
  const args = {
    apply: false,
    push: false,
    releaseAs: null as string | null,
  };
  for (const a of argv) {
    if (a === '--apply') {
      args.apply = true;
    } else if (a === '--push') {
      args.push = true;
    } else if (a.startsWith('--release-as=')) {
      args.releaseAs = a.slice('--release-as='.length);
    }
  }
  if (args.push && !args.apply) {
    throw new Error('--push requires --apply');
  }
  return args;
}

function currentCalverPrefix(): { year: number; month: string; prefix: string } {
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return { year, month, prefix: `${TAG_PREFIX}${year}.${month}.` };
}

function nextVersion(override: string | null): string {
  if (override) {
    if (!/^\d{4}\.\d{2}\.\d+$/.test(override)) {
      throw new Error(`--release-as must be YYYY.MM.PATCH, got: ${override}`);
    }
    return override;
  }
  const { year, month, prefix } = currentCalverPrefix();
  const tags = sh(`git tag --list "${prefix}*"`)
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
  const patches = tags
    .map((t) => Number(t.slice(prefix.length)))
    .filter((n) => Number.isInteger(n) && n >= 0);
  const nextPatch = patches.length === 0 ? 0 : Math.max(...patches) + 1;
  return `${year}.${month}.${nextPatch}`;
}

function lastTag(): string | null {
  try {
    return execSync(`git describe --tags --abbrev=0 --match "${TAG_PREFIX}[0-9]*"`, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function commitLog(since: string | null): Commit[] {
  const range = since ? `${since}..HEAD` : 'HEAD';
  let raw: string;
  try {
    raw = sh(`git log ${range} --pretty=format:%H%x09%s --no-merges`);
  } catch {
    return [];
  }
  if (!raw) {
    return [];
  }
  return raw.split('\n').map((line) => {
    const tab = line.indexOf('\t');
    const sha = line.slice(0, tab);
    const subject = line.slice(tab + 1);
    const short = sha.slice(0, 7);
    const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
    if (match?.[1] && match[4]) {
      return {
        sha: short,
        type: match[1],
        scope: match[2] ?? null,
        breaking: Boolean(match[3]),
        subject: match[4],
      };
    }
    return { sha: short, type: 'other', scope: null, breaking: false, subject };
  });
}

function formatLine(c: Commit): string {
  const scope = c.scope ? `**${c.scope}:** ` : '';
  return `- ${scope}${c.subject} (${c.sha})`;
}

function groupCommits(commits: Commit[]): {
  breaking: string[];
  byType: Record<string, string[]>;
} {
  const breaking: string[] = [];
  const byType: Record<string, string[]> = {};
  for (const c of commits) {
    const line = formatLine(c);
    if (c.breaking) {
      breaking.push(line);
    }
    const key = c.type in TYPE_HEADERS ? c.type : 'other';
    const bucket = byType[key] ?? [];
    bucket.push(line);
    byType[key] = bucket;
  }
  return { breaking, byType };
}

function renderEntry(version: string, commits: Commit[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const { breaking, byType } = groupCommits(commits);
  const sections: string[] = [];
  if (breaking.length > 0) {
    sections.push(`### ⚠️ Breaking Changes\n\n${breaking.join('\n')}\n`);
  }
  for (const t of TYPE_ORDER) {
    const lines = byType[t];
    if (lines && lines.length > 0) {
      sections.push(`${TYPE_HEADERS[t]}\n\n${lines.join('\n')}\n`);
    }
  }
  return `## [${version}] - ${today}\n\n${sections.join('\n')}`.trim();
}

function workingTreeClean(): boolean {
  return sh('git status --porcelain') === '';
}

function currentBranch(): string {
  return sh('git rev-parse --abbrev-ref HEAD');
}

function insertEntry(entry: string) {
  const existing = readFileSync(CHANGELOG_PATH, 'utf-8');
  const idx = existing.indexOf(RELEASES_MARKER);
  if (idx === -1) {
    throw new Error(`CHANGELOG.md is missing the "${RELEASES_MARKER}" marker`);
  }
  const insertAt = idx + RELEASES_MARKER.length;
  const updated = `${existing.slice(0, insertAt)}\n\n${entry}\n${existing.slice(insertAt)}`;
  writeFileSync(CHANGELOG_PATH, updated);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = nextVersion(args.releaseAs);
  const tag = `${TAG_PREFIX}${version}`;
  const since = lastTag();
  const commits = commitLog(since);

  if (commits.length === 0) {
    console.error(`No commits since ${since ?? 'the beginning'} — nothing to release.`);
    process.exit(1);
  }

  const entry = renderEntry(version, commits);

  console.log(`Next version: ${version}`);
  console.log(`Tag:          ${tag}`);
  console.log(`Since:        ${since ?? '(no prior tag)'}`);
  console.log(`Commits:      ${commits.length}`);
  console.log('');
  console.log('--- CHANGELOG.md entry ---');
  console.log(entry);
  console.log('--- end ---');
  console.log('');

  if (!args.apply) {
    console.log('Preview only. Re-run with --apply to write CHANGELOG.md, commit, and tag.');
    return;
  }

  if (!workingTreeClean()) {
    console.error('error: working tree is dirty. Commit or stash changes before --apply.');
    process.exit(1);
  }
  const branch = currentBranch();
  if (branch !== 'main') {
    console.error(`error: must be on main to release (current: ${branch}).`);
    process.exit(1);
  }

  insertEntry(entry);
  sh('git add CHANGELOG.md');
  sh(`git commit -m "chore(release): ${tag}"`);
  sh(`git tag -a ${tag} -m "Release ${tag}"`);
  console.log(`Committed CHANGELOG.md and created tag ${tag}.`);

  if (args.push) {
    sh(`git push origin ${branch} --follow-tags`);
    console.log(`Pushed ${branch} and ${tag} to origin.`);
  } else {
    console.log('');
    console.log('To publish, run:');
    console.log(`  git push origin ${branch} --follow-tags`);
  }
}

main();
