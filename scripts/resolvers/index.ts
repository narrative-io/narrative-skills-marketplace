import { generateSkillId } from './skill-id';
import { generateSnippet } from './snippet';
import type { ResolverFn } from './types';

/**
 * Resolver registry. Keys are the UPPERCASE_NAME used inside
 * {{NAME}} or {{NAME:arg}} placeholders in SKILL.md.tmpl files.
 *
 * Add a new resolver by:
 *   1. Writing the resolver function in scripts/resolvers/<name>.ts.
 *   2. Registering it here.
 *   3. Using {{NAME}} or {{NAME:arg}} in any SKILL.md.tmpl.
 *
 * Mirrors ai-tools/scripts/resolvers/index.ts.
 */
export const RESOLVERS: Record<string, ResolverFn> = {
  SNIPPET: generateSnippet,
  SKILL_ID: generateSkillId,
};
