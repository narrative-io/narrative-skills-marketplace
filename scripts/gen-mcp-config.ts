#!/usr/bin/env bun
/**
 * Emit portable mcp.json files derived from each plugin's
 * .claude-plugin/plugin.json mcpServers block.
 *
 * Outputs (committed; consumed via raw GitHub URL by other harnesses):
 *   mcp/<plugin>.mcp.json   — per-plugin server config
 *   mcp/all.mcp.json        — every plugin's servers merged
 *
 * The `{ mcpServers: { ... } }` shape is the lingua franca across
 * Claude Code, Claude Desktop, Cursor, Cline, and most other
 * MCP-aware harnesses, so this file can be copy-pasted into whichever
 * client config the user already manages.
 *
 * --dry-run: render to memory; exit 1 if mcp/ is stale. Used by CI.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { listPlugins, type McpServerConfig, readPluginManifest } from './read-skills';

const ROOT = resolve(import.meta.dir, '..');
const DRY_RUN = process.argv.includes('--dry-run');
const OUT_DIR = join(ROOT, 'mcp');

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

function ensureDir(p: string): void {
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true });
  }
}

function format(config: McpConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function writeOrCheck(file: string, content: string): boolean {
  if (DRY_RUN) {
    if (!existsSync(file)) {
      console.error(`STALE: ${relative(ROOT, file)} (missing)`);
      return false;
    }
    const existing = readFileSync(file, 'utf-8');
    if (existing !== content) {
      console.error(`STALE: ${relative(ROOT, file)}`);
      return false;
    }
    console.log(`FRESH: ${relative(ROOT, file)}`);
    return true;
  }
  ensureDir(dirname(file));
  writeFileSync(file, content);
  console.log(`GENERATED: ${relative(ROOT, file)}`);
  return true;
}

let allFresh = true;
const merged: Record<string, McpServerConfig> = {};

for (const plugin of listPlugins(ROOT)) {
  const manifest = readPluginManifest(ROOT, plugin);
  if (!manifest?.mcpServers) {
    continue;
  }
  const perPlugin: McpConfig = { mcpServers: manifest.mcpServers };
  const target = join(OUT_DIR, `${plugin}.mcp.json`);
  if (!writeOrCheck(target, format(perPlugin))) {
    allFresh = false;
  }
  for (const [name, config] of Object.entries(manifest.mcpServers)) {
    const existing = merged[name];
    if (existing && JSON.stringify(existing) !== JSON.stringify(config)) {
      console.error(
        `error: MCP server "${name}" is declared by multiple plugins with ` +
          `conflicting configurations.`,
      );
      process.exit(1);
    }
    merged[name] = config;
  }
}

const aggregateTarget = join(OUT_DIR, 'all.mcp.json');
if (!writeOrCheck(aggregateTarget, format({ mcpServers: merged }))) {
  allFresh = false;
}

if (DRY_RUN && !allFresh) {
  console.error('\nmcp.json files are stale. Run: bun run gen:mcp');
  process.exit(1);
}
