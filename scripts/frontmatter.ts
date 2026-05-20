/**
 * Extract frontmatter fields from a SKILL.md.tmpl block. Used by
 * gen-skill-docs.ts to validate the description-length cap, and by
 * check-skill-versions.ts to enforce version bumps on edits.
 */
import matter from 'gray-matter';

interface SkillFrontmatter {
  name?: unknown;
  description?: unknown;
  version?: unknown;
}

export function extractNameAndDescription(content: string): {
  name: string;
  description: string;
} {
  const { data } = matter(content) as { data: SkillFrontmatter };
  return {
    name: String(data.name ?? '').trim(),
    description: String(data.description ?? '').trim(),
  };
}

export function extractVersion(content: string): string {
  const { data } = matter(content) as { data: SkillFrontmatter };
  return String(data.version ?? '').trim();
}
