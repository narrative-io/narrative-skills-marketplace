# narrative-skills-marketplace

A Claude Code plugin marketplace. Plugins live under `plugins/`; each
plugin contains one or more skills under `plugins/<plugin>/skills/`.

## Commands

```bash
bash setup   # register the marketplace + install every plugin
```

## Project structure

```
narrative-skills-marketplace/
├── .claude-plugin/
│   └── marketplace.json        # Marketplace catalog (this repo)
├── plugins/
│   └── <plugin>/
│       ├── .claude-plugin/
│       │   └── plugin.json     # Plugin manifest (name, version, mcpServers)
│       ├── _snippets/          # (optional) plugin-local snippets
│       └── skills/
│           └── <skill>/
│               ├── SKILL.md.tmpl   # Template (source of truth, optional)
│               └── SKILL.md        # Rendered file (auto-generated if .tmpl exists)
├── snippets/                   # Shared snippets reused across skills
├── scripts/
│   ├── gen-skill-docs.ts       # Renders SKILL.md from SKILL.md.tmpl
│   ├── discover-skills.ts
│   ├── frontmatter.ts
│   └── resolvers/              # {{PLACEHOLDER}} resolver registry
├── package.json                # bun run gen:skill-docs
├── setup
└── README.md
```

## Naming conventions

Skills follow the **verb-noun** pattern (`/triage-lead`, `/create-deck`).
Single-word names are fine when the verb is unambiguous (`/commit`,
`/qualify`). Skill directory names match the slash command (lowercase,
hyphen-separated).

| Verb | When to use |
|------|-------------|
| `write` | Long-form prose (`/write-blog`, `/write-story`) |
| `create` | Structured artifacts (`/create-slide`, `/create-pr`) |
| `triage` | Categorize + prioritize inbound items |
| `review` | Evaluate existing content |
| `start` | Begin a workflow |
| `capture` | Persist an external artifact |
| `find` | Search existing material |
| `prep` | Prepare for a specific event |
| `build` | Assemble multi-artifact output |
| `sweep` | Scheduled hygiene pass |

Never use adjective-noun (`/new-lead`) or noun-noun (`/campaign-brief`).

## SKILL.md format

Every skill file starts with YAML frontmatter:

```yaml
---
name: my-skill
version: 1.0.0
description: |
  One- or two-sentence description.
  Include trigger phrases: "use when X", "use when Y".
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
---
```

- **name** matches the slash command (no leading `/`).
- **allowed-tools** lists every non-MCP tool the skill calls.
  `AskUserQuestion` is required for interactive skills. MCP tools
  declared in `plugin.json` are globally available and do not need to be
  listed.
- The body is a phased, interactive workflow. Number phases sequentially
  (Phase 1, Phase 2, …).

## Skill design principles

1. **Interactive, not reference** — walk the user through decisions; don't
   just display docs.
2. **AI does the grunt work** — research, enrichment, drafting. Humans
   approve.
3. **One question at a time** — never batch multiple `AskUserQuestion`s.
4. **Evidence over assumptions** — never skip to conclusions without data.
5. **Drafts, not actions** — for external-facing output (email, Slack),
   always draft and require explicit approval before sending.
6. **Graceful degradation** — if an MCP tool isn't available, continue
   without it and note manual follow-ups.
7. **DRY via templates** — pull shared boilerplate (company-context
   pinning, harness fallbacks, voice guidelines) out into `snippets/`
   and reference it from a `SKILL.md.tmpl` instead of duplicating prose
   across skills.

## Template system

Skills can be authored as a `SKILL.md.tmpl` with `{{PLACEHOLDER}}`
substitutions; `bun run gen:skill-docs` (also invoked by `bash setup`)
renders them to `SKILL.md` in place. Plain `SKILL.md` files with no
template are left untouched.

### Placeholder syntax

```
{{RESOLVER}}                # no-arg resolver
{{RESOLVER:arg1}}           # one arg
{{RESOLVER:arg1:arg2}}      # colon-separated args
```

Resolver names are UPPERCASE_WITH_UNDERSCORES. Unknown resolvers fail
the render. Snippets that themselves contain `{{...}}` are resolved
transitively (up to 5 passes).

### Built-in resolvers

| Placeholder | What it does |
|-------------|--------------|
| `{{SNIPPET:<name>}}` | Inlines `snippets/<name>.md` (or `plugins/<plugin>/_snippets/<name>.md` if the snippet is plugin-local). |

### Adding a snippet

1. Create `snippets/<name>.md` (repo-shared) or
   `plugins/<plugin>/_snippets/<name>.md` (plugin-local; takes
   precedence). Write the markdown chunk verbatim, no frontmatter.
2. Reference it from a template:

   ```markdown
   ### Phase 2. Pin the company / context

   {{SNIPPET:pin-company-context}}
   ```

3. Run `bun run gen:skill-docs` to regenerate the rendered `SKILL.md`.

### Adding a resolver

For dynamic content (computed bash blocks, programmatic lookups, etc.)
that can't be expressed as a static snippet:

1. Write `scripts/resolvers/<name>.ts` exporting a `ResolverFn`.
2. Register it in `scripts/resolvers/index.ts`.
3. Use `{{YOUR_NAME}}` or `{{YOUR_NAME:arg}}` in any template.

The resolver signature is `(ctx: TemplateContext, args?: string[]) => string`.
`ctx` provides the skill name, template path, and repo root.

### Generated files

Rendered `SKILL.md` files start with an `<!-- AUTO-GENERATED ... -->`
banner immediately after the frontmatter. Edit the `.tmpl`, never the
rendered output. `bun run check:skill-docs` is a `--dry-run` check
suitable for CI.
