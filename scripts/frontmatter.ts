/**
 * Extract `name` and `description` from a SKILL.md.tmpl frontmatter block.
 * Used by gen-skill-docs.ts to validate the description-length cap.
 */
import matter from 'gray-matter';

interface SkillFrontmatter {
  name?: unknown;
  description?: unknown;
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
