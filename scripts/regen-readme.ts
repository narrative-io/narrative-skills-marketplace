#!/usr/bin/env bun
/**
 * Regenerate the Plugins section of README.md from plugin/skill manifests.
 *
 * Walks every plugin listed in `.claude-plugin/marketplace.json`, reads its
 * `plugin.json` for the description, and lists every skill under
 * `plugins/<plugin>/skills/<skill>/SKILL.md` with the "Use when:" trigger
 * phrases pulled from the skill's frontmatter description.
 *
 * Content is written between the `<!-- BEGIN PLUGINS -->` and
 * `<!-- END PLUGINS -->` markers in README.md.
 */
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const BEGIN = "<!-- BEGIN PLUGINS -->";
const END = "<!-- END PLUGINS -->";

function parseFrontmatter(text: string): Record<string, string> {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end === -1) return {};
  const lines = text.slice(3, end).split("\n");
  const result: Record<string, string> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || line[0] === " " || line[0] === "\t") {
      i++;
      continue;
    }
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const val = m[2].trim();
    if (val === "|" || val === ">" || val === "|-" || val === ">-") {
      i++;
      const block: string[] = [];
      while (
        i < lines.length &&
        (lines[i].startsWith("  ") || lines[i] === "")
      ) {
        block.push(lines[i].startsWith("  ") ? lines[i].slice(2) : "");
        i++;
      }
      result[key] = block.join("\n").replace(/\s+$/, "");
    } else if (val === "") {
      i++;
      while (
        i < lines.length &&
        (lines[i].startsWith("  ") || lines[i] === "")
      ) {
        i++;
      }
    } else {
      result[key] = val.replace(/^["']|["']$/g, "");
      i++;
    }
  }
  return result;
}

function splitDescription(desc: string): { summary: string; useWhen: string } {
  const m = desc.match(/Use when:\s*([\s\S]+?)(?:\n\n|\n\(|$)/);
  let useWhen = "";
  let summary = desc;
  if (m && m.index !== undefined) {
    useWhen = m[1].trim();
    summary = desc.slice(0, m.index).trim();
  }
  return {
    summary: summary.replace(/\s+/g, " ").trim(),
    useWhen: useWhen.replace(/\s+/g, " ").trim(),
  };
}

async function renderPlugins(root: string): Promise<string> {
  const marketplace = JSON.parse(
    await Bun.file(join(root, ".claude-plugin/marketplace.json")).text(),
  );
  const out: string[] = ["## Plugins", ""];
  for (const plugin of marketplace.plugins ?? []) {
    const name: string = plugin.name;
    const pluginDir = join(root, "plugins", name);
    const manifest = JSON.parse(
      await Bun.file(join(pluginDir, ".claude-plugin/plugin.json")).text(),
    );
    out.push(`### \`${name}\``);
    out.push("");
    out.push((manifest.description ?? "").trim());
    out.push("");

    const skillsDir = join(pluginDir, "skills");
    const rows: string[] = [];
    let entries: string[] = [];
    try {
      entries = readdirSync(skillsDir).sort();
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      const skillMd = Bun.file(join(skillsDir, entry, "SKILL.md"));
      if (!(await skillMd.exists())) continue;
      const fm = parseFrontmatter(await skillMd.text());
      const skillName = fm.name ?? entry;
      const { useWhen } = splitDescription(fm.description ?? "");
      rows.push(`| \`/${skillName}\` | ${useWhen.replace(/\|/g, "\\|")} |`);
    }
    if (rows.length) {
      out.push("| Skill | Use when |");
      out.push("|-------|----------|");
      out.push(...rows);
      out.push("");
    }
  }
  return out.join("\n").replace(/\s+$/, "") + "\n";
}

const root = resolve(
  process.argv[2] ?? join(import.meta.dir, ".."),
);
const readmePath = join(root, "README.md");
const text = await Bun.file(readmePath).text();
const block = `${BEGIN}\n${await renderPlugins(root)}\n${END}`;
const pattern = /<!-- BEGIN PLUGINS -->[\s\S]*?<!-- END PLUGINS -->/;
const updated = pattern.test(text)
  ? text.replace(pattern, block)
  : text.replace(/\s+$/, "") + "\n\n" + block + "\n";

if (updated !== text) {
  await Bun.write(readmePath, updated);
  console.log(`  regenerated ${relative(root, readmePath)}`);
} else {
  console.log(`  ${relative(root, readmePath)} already up to date`);
}
