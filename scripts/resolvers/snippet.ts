import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TemplateContext } from './types';

/**
 * {{SNIPPET:<name>}} — inline a shared markdown snippet.
 *
 * Resolution order:
 *   1. Plugin-local: plugins/<plugin>/_snippets/<name>.md
 *   2. Repo-shared:  snippets/<name>.md
 *
 * The snippet file's contents are inlined verbatim. Trailing newlines on
 * the snippet are stripped so the placeholder slot doesn't introduce
 * stray blank lines into the rendered SKILL.md.
 *
 * Nested {{SNIPPET:...}} calls inside a snippet are resolved recursively
 * by the main renderer, not here.
 */
export function generateSnippet(ctx: TemplateContext, args?: string[]): string {
  if (!args || args.length === 0 || !args[0]) {
    throw new Error(
      `{{SNIPPET:...}} requires a snippet name (e.g. {{SNIPPET:pin-company-context}}).`,
    );
  }

  const name = args[0];

  // Extract plugin name from tmplPath: .../plugins/<plugin>/skills/<skill>/SKILL.md.tmpl
  const parts = path.normalize(ctx.tmplPath).split(path.sep);
  const pluginsIdx = parts.lastIndexOf('plugins');
  const pluginName =
    pluginsIdx >= 0 && pluginsIdx + 1 < parts.length ? parts[pluginsIdx + 1] : null;

  const candidates: string[] = [];
  if (pluginName) {
    candidates.push(path.join(ctx.root, 'plugins', pluginName, '_snippets', `${name}.md`));
  }
  candidates.push(path.join(ctx.root, 'snippets', `${name}.md`));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf-8').replace(/\s+$/, '');
    }
  }

  throw new Error(
    `{{SNIPPET:${name}}}: no snippet file found. Looked in:\n  ` +
      candidates.map((c) => path.relative(ctx.root, c)).join('\n  '),
  );
}
