#!/usr/bin/env bun
/**
 * Build a portable distribution that any agentskills.io-compliant
 * harness can consume — no Claude Code CLI required.
 *
 * Layout produced under dist/:
 *
 *   dist/
 *   ├── skills/
 *   │   └── <skill>/              # flat (no plugin nesting)
 *   │       ├── SKILL.md
 *   │       ├── references/ ...   # copied if present
 *   │       ├── scripts/ ...      # copied if present
 *   │       └── assets/ ...       # copied if present
 *   ├── mcp/
 *   │   ├── <plugin>.mcp.json
 *   │   └── all.mcp.json
 *   └── skills.json               # mirror of the repo-root discovery index
 *
 * Why flat skills/ — most non-Claude-Code skill loaders scan a single
 * directory of skill folders (`~/Library/Application Support/Claude/skills/`,
 * `.cursor/rules/`, project-level `.agents/skills/`, etc.). Plugin
 * nesting is a Claude Code marketplace concept.
 *
 * Idempotent: rewrites dist/ on each run. Caller is expected to have
 * already run `bun run gen:all` so the source files are fresh; this
 * script doesn't render templates.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { listSkills } from './read-skills';

const ROOT = resolve(import.meta.dir, '..');
const DIST = join(ROOT, 'dist');
const DIST_SKILLS = join(DIST, 'skills');
const DIST_MCP = join(DIST, 'mcp');

if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true });
}
mkdirSync(DIST_SKILLS, { recursive: true });
mkdirSync(DIST_MCP, { recursive: true });

let skillCount = 0;
const nameCollisions = new Set<string>();
const seenNames = new Set<string>();

for (const skill of listSkills(ROOT)) {
  const src = dirname(skill.skillMdPath);
  const target = join(DIST_SKILLS, skill.dir);

  if (seenNames.has(skill.dir)) {
    nameCollisions.add(skill.dir);
  }
  seenNames.add(skill.dir);

  cpSync(src, target, {
    recursive: true,
    filter: (s) => !s.endsWith('.tmpl'),
  });

  skillCount++;
  console.log(`  skills/${skill.dir}/  ← ${relative(ROOT, src)}`);
}

if (nameCollisions.size > 0) {
  console.error(
    `error: skill name collisions across plugins prevent flat distribution: ${[...nameCollisions].join(', ')}.`,
  );
  console.error('Rename one side or namespace it before shipping a portable build.');
  process.exit(1);
}

// Mirror mcp/ and skills.json (gen:all already produced these).
const mcpSrc = join(ROOT, 'mcp');
if (existsSync(mcpSrc)) {
  cpSync(mcpSrc, DIST_MCP, { recursive: true });
}

const skillsIndex = join(ROOT, 'skills.json');
if (existsSync(skillsIndex)) {
  writeFileSync(join(DIST, 'skills.json'), readFileSync(skillsIndex));
}

console.log('');
console.log(`Portable build ready: ${relative(ROOT, DIST)}/`);
console.log(
  `  ${skillCount} skills, ${Object.keys(JSON.parse(readFileSync(skillsIndex, 'utf-8')).plugins).length} plugins`,
);
console.log('');
console.log('Next steps (pick the section for your harness):');
console.log('');
console.log('  Claude.ai (web Skills UI):');
console.log('    zip each dist/skills/<skill>/ directory, then upload at');
console.log('    https://claude.ai/settings/capabilities → Skills → Upload.');
console.log('');
console.log('  Claude Desktop (Mac/Windows):');
console.log('    cp -R dist/skills/* "$HOME/Library/Application Support/Claude/skills/"   # macOS');
console.log(
  '    cp -R dist/skills/* "$APPDATA/Claude/skills/"                              # Windows',
);
console.log(
  '    then merge dist/mcp/all.mcp.json into ~/Library/Application Support/Claude/claude_desktop_config.json',
);
console.log('');
console.log('  Generic agentskills.io-compliant harness:');
console.log('    point the harness at dist/skills/ as a skills root, and');
console.log('    register the MCP servers in dist/mcp/all.mcp.json.');
