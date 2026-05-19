export interface TemplateContext {
  /** The skill name (frontmatter `name:` or directory name). */
  skillName: string;
  /** Absolute path to the .tmpl file being rendered. */
  tmplPath: string;
  /** Absolute path to the repo root (where /snippets and /plugins live). */
  root: string;
}

export type ResolverFn = (ctx: TemplateContext, args?: string[]) => string;
