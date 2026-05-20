#!/usr/bin/env bun
/**
 * Cut a CalVer release of the marketplace, via a PR-based flow.
 *
 * Versions look like `YYYY.MM.PATCH` (e.g. `2026.05.0`), tagged as
 * `vYYYY.MM.PATCH`. Same-month follow-ups bump the patch; a new month
 * resets the patch to 0.
 *
 * Modes:
 *   bun run release                     Preview the next release.
 *                                       No filesystem or git changes.
 *
 *   bun run release:apply               Open a release PR:
 *                                       1. Compute next version from tags.
 *                                       2. Generate the CHANGELOG.md entry.
 *                                       3. Branch off main as
 *                                          `chore/release-v<version>`.
 *                                       4. Commit, push, open the PR
 *                                          via `gh pr create`.
 *                                       After the PR squash-merges,
 *                                       `auto-release.yml` tags the
 *                                       commit and publishes the GitHub
 *                                       Release automatically — no
 *                                       client-side follow-up needed.
 *
 *   bun run release:tag                 Escape-hatch: manually tag the
 *                                       merged release commit if the
 *                                       auto-release workflow didn't
 *                                       fire. Pulls main, verifies HEAD
 *                                       is a release commit, tags +
 *                                       pushes. Falls through to
 *                                       `release.yml` (tag-triggered).
 *
 *   --release-as=YYYY.MM.PATCH          Override the computed version
 *                                       (applies to --apply only).
 *
 * Requires `gh` (GitHub CLI) on PATH for the --apply mode.
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
const RELEASE_COMMIT_PATTERN = /^chore\(release\):\s+v(\d{4}\.\d{2}\.\d+)(?:\s+\(#\d+\))?\s*$/;

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

function shInherit(cmd: string): void {
  execSync(cmd, { cwd: REPO_ROOT, stdio: 'inherit' });
}

function parseArgs(argv: string[]) {
  const args = {
    apply: false,
    tag: false,
    releaseAs: null as string | null,
  };
  for (const a of argv) {
    if (a === '--apply') {
      args.apply = true;
    } else if (a === '--tag') {
      args.tag = true;
    } else if (a.startsWith('--release-as=')) {
      args.releaseAs = a.slice('--release-as='.length);
    }
  }
  if (args.apply && args.tag) {
    throw new Error('--apply and --tag are mutually exclusive');
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
  // List tags directly rather than `git describe`, which only finds tags
  // reachable from HEAD. A release tag placed on the pre-squash branch tip
  // ends up orphaned from main's history, but should still anchor the
  // changelog range for the next release.
  const tags = sh(`git tag --list "${TAG_PREFIX}[0-9]*"`)
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
  const parsed = tags
    .map((tag) => {
      const m = tag.match(/^v(\d{4})\.(\d{2})\.(\d+)$/);
      if (!m?.[1] || !m[2] || !m[3]) return null;
      return { tag, year: Number(m[1]), month: Number(m[2]), patch: Number(m[3]) };
    })
    .filter((x): x is { tag: string; year: number; month: number; patch: number } => x !== null);
  if (parsed.length === 0) {
    return null;
  }
  parsed.sort((a, b) => b.year - a.year || b.month - a.month || b.patch - a.patch);
  return parsed[0]?.tag ?? null;
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

function insertEntry(entry: string): void {
  const existing = readFileSync(CHANGELOG_PATH, 'utf-8');
  const idx = existing.indexOf(RELEASES_MARKER);
  if (idx === -1) {
    throw new Error(`CHANGELOG.md is missing the "${RELEASES_MARKER}" marker`);
  }
  const insertAt = idx + RELEASES_MARKER.length;
  const updated = `${existing.slice(0, insertAt)}\n\n${entry}\n${existing.slice(insertAt)}`;
  writeFileSync(CHANGELOG_PATH, updated);
}

function assertGhAvailable(): void {
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch {
    throw new Error('`gh` (GitHub CLI) is required for --apply. Install: https://cli.github.com');
  }
}

function preview(version: string, commits: Commit[], since: string | null): string {
  const tag = `${TAG_PREFIX}${version}`;
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
  return entry;
}

function openReleasePR(version: string, entry: string): void {
  assertGhAvailable();
  if (!workingTreeClean()) {
    throw new Error('working tree is dirty. Commit or stash changes before --apply.');
  }
  if (currentBranch() !== 'main') {
    throw new Error(`must be on main for --apply (current: ${currentBranch()}).`);
  }

  const tag = `${TAG_PREFIX}${version}`;
  const branch = `chore/release-${tag}`;

  shInherit('git fetch origin');
  shInherit('git pull --ff-only origin main');
  shInherit(`git checkout -b ${branch}`);
  insertEntry(entry);
  shInherit('git add CHANGELOG.md');
  shInherit(`git commit -m "chore(release): ${tag}"`);
  shInherit(`git push -u origin ${branch}`);

  const body = [
    `## Summary`,
    ``,
    `Cuts release **${tag}**. Adds the \`CHANGELOG.md\` entry generated from conventional commit subjects since the previous tag.`,
    ``,
    `## What happens after merge`,
    ``,
    `1. This PR squash-merges to \`main\` with subject \`chore(release): ${tag} (#NN)\`.`,
    `2. The \`auto-release.yml\` workflow detects the release-commit subject, tags the commit with \`${tag}\`, and creates the public GitHub Release with auto-generated notes. No client-side step needed.`,
    ``,
    `## Test plan`,
    ``,
    `- [ ] CI passes on this PR`,
    `- [ ] After merge, \`auto-release.yml\` runs to success and \`${tag}\` appears under [Releases](https://github.com/narrative-io/narrative-skills-marketplace/releases)`,
    ``,
    `🤖 Generated by \`scripts/release.ts\`.`,
  ].join('\n');

  shInherit(`gh pr create --title "chore(release): ${tag}" --body ${JSON.stringify(body)}`);

  shInherit('git checkout main');
  console.log('');
  console.log('Release PR opened. After it squash-merges, auto-release.yml');
  console.log('will tag the commit and publish the GitHub Release automatically.');
}

function tagMergedRelease(): void {
  if (!workingTreeClean()) {
    throw new Error('working tree is dirty. Commit or stash changes before --tag.');
  }
  if (currentBranch() !== 'main') {
    throw new Error(`must be on main for --tag (current: ${currentBranch()}).`);
  }
  shInherit('git fetch origin');
  shInherit('git pull --ff-only origin main');

  const headSubject = sh('git log -1 --pretty=%s');
  const match = headSubject.match(RELEASE_COMMIT_PATTERN);
  if (!match?.[1]) {
    throw new Error(
      `HEAD is not a release commit. Expected subject "chore(release): v<YYYY.MM.PATCH>", got: "${headSubject}". ` +
        `Make sure the release PR has been squash-merged into main and you've pulled.`,
    );
  }
  const version = match[1];
  const tag = `${TAG_PREFIX}${version}`;

  const existing = sh(`git tag --list "${tag}"`);
  if (existing) {
    throw new Error(
      `Tag ${tag} already exists locally. If a previous attempt got partway, delete the local tag with ` +
        `\`git tag -d ${tag}\` and try again — but first verify the remote state with \`git ls-remote --tags origin ${tag}\`.`,
    );
  }

  shInherit(`git tag -a ${tag} -m "Release ${tag}"`);
  shInherit(`git push origin ${tag}`);
  console.log('');
  console.log(
    `Pushed ${tag}. The release.yml workflow should now run and publish the GitHub Release.`,
  );
  console.log(`Watch: gh run watch (or check the Actions tab)`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.tag) {
    tagMergedRelease();
    return;
  }

  const version = nextVersion(args.releaseAs);
  const since = lastTag();
  const commits = commitLog(since);

  if (commits.length === 0) {
    console.error(`No commits since ${since ?? 'the beginning'} — nothing to release.`);
    process.exit(1);
  }

  const entry = preview(version, commits, since);

  if (!args.apply) {
    console.log('Preview only. Re-run with --apply to open a release PR.');
    return;
  }

  openReleasePR(version, entry);
}

main();
