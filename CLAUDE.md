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
│       └── skills/
│           └── <skill>/
│               └── SKILL.md    # Skill definition
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
