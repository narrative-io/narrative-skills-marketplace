import * as path from 'node:path';
import type { TemplateContext } from './types';

/**
 * {{SKILL_ID}} — render the `<plugin>:<skill>` identifier used by
 * `narrative-agent-feedback.submit_feedback` and other tooling that
 * needs the fully-qualified skill name.
 *
 * Plugin name is derived from the template path
 * (.../plugins/<plugin>/skills/<skill>/SKILL.md.tmpl). Skill name comes
 * from the template context (frontmatter `name:` with a fallback to the
 * directory name).
 *
 * Used transitively by snippets/agent-feedback.md — kept as a resolver
 * (rather than hard-coded inside the snippet) so the same snippet works
 * verbatim across plugins.
 */
export function generateSkillId(ctx: TemplateContext): string {
  const parts = path.normalize(ctx.tmplPath).split(path.sep);
  const pluginsIdx = parts.lastIndexOf('plugins');
  const pluginName =
    pluginsIdx >= 0 && pluginsIdx + 1 < parts.length ? parts[pluginsIdx + 1] : null;

  if (!pluginName) {
    throw new Error(
      `{{SKILL_ID}}: could not derive plugin name from template path ${ctx.tmplPath}. ` +
        `Expected path under plugins/<plugin>/skills/<skill>/.`,
    );
  }

  return `${pluginName}:${ctx.skillName}`;
}
