<div align="center">

<!-- Drop a hero image at .github/banner.png (1280x320 ideal) and uncomment the line below.
     Until then, the wordmark + tagline lead. -->
<!-- <img src=".github/banner.png" alt="Narrative Skills Marketplace" width="100%" /> -->

# Narrative Skills Marketplace

**An agent skills marketplace from [Narrative I/O](https://narrative.io).**

Interactive, AI-powered workflows that walk you through the recurring
work of a modern data company — mapping schemas, writing NQL,
qualifying leads, shipping code, building decks — one approval at a time.

[![CI](https://github.com/narrative-io/narrative-skills-marketplace/actions/workflows/ci.yml/badge.svg)](https://github.com/narrative-io/narrative-skills-marketplace/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skills spec](https://img.shields.io/badge/spec-agentskills.io-d97757)](https://agentskills.io)
[![Biome](https://img.shields.io/badge/lint%20%26%20format-Biome-60a5fa?logo=biome)](https://biomejs.dev)
[![Bun](https://img.shields.io/badge/runtime-Bun-fbf0df?logo=bun&logoColor=black)](https://bun.sh)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.json)
[![Knip](https://img.shields.io/badge/dead%20code-Knip-7e22ce)](https://knip.dev)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](AGENTS.md)

</div>

---

## What is this?

A **marketplace** of agent skills. Each plugin bundles one or more
**skills** — interactive slash commands like `/write-nql` or
`/generate-rosetta-stone-mappings` that turn a recurring task into a
guided, AI-augmented workflow.

Install the marketplace, type a slash command in your agent, and the
skill takes it from there: it asks the right questions, does the
research, drafts the artifact, and waits for your approval before
acting on anything outside your repo.

Skills follow the [Agent Skills spec](https://agentskills.io) and run
in any spec-compliant harness. The bundled `bash setup` installer
currently targets Claude Code; for other harnesses, point your agent
at the `plugins/*/skills/*/SKILL.md` files directly.

> **Want the design philosophy?** See
> [AGENTS.md](AGENTS.md#skill-design-principles) — "interactive, not
> reference," "drafts, not actions," "evidence over assumptions," etc.

## Install

```bash
git clone https://github.com/narrative-io/narrative-skills-marketplace
cd narrative-skills-marketplace
bash setup
```

`setup` registers the marketplace, installs every plugin listed
below, and regenerates the catalog in this README. The installer
currently targets [Claude Code](https://claude.com/claude-code) — for
other harnesses, load any `plugins/*/skills/*/SKILL.md` directly.

**Requirements**

- [Claude Code](https://claude.com/claude-code) CLI on `PATH` (for
  `bash setup`; the SKILL.md files themselves are spec-portable)
- [Bun](https://bun.sh) ≥ 1.1 (used for template rendering + scripts)

<!-- BEGIN PLUGINS -->
## Plugins

### `narrative-common`

Common Narrative workflows backed by the narrative-mcp server — starting with Rosetta Stone attribute mapping generation, evaluation, and improvement.

| Skill | Use when |
|-------|----------|
| `/generate-rosetta-stone-mappings` | "map this dataset to Rosetta Stone", "suggest normalized attributes for dataset N", "evaluate the mappings on dataset N", "why is this mapping low confidence", "fix this expression", "improve this NQL mapping expression". |

<!-- END PLUGINS -->

## What's a skill?

A skill is a single `SKILL.md` file with YAML frontmatter and a
numbered, phased workflow. The frontmatter declares what tools the
skill can call; the body walks the user through the work, one
question at a time, drafting artifacts and waiting for approval at
each gate.

```yaml
---
name: write-nql
version: 1.0.0
description: |
  Compose, validate, and run NQL against a Narrative dataset.
  Use when: "write an NQL query for X", "validate this NQL".
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

## Phase 1. Pin the dataset

…
```

Some skills reuse boilerplate via the snippet system — author a
`SKILL.md.tmpl` with `{{SNIPPET:pin-company-context}}` and `bun run
gen:skill-docs` renders the final `SKILL.md`. See
[AGENTS.md → Template system](AGENTS.md#template-system).

## Development

```bash
bun install                  # install dev deps (Biome, Knip, TS)
bun run gen:skill-docs       # render SKILL.md from SKILL.md.tmpl files
bun run check                # Biome — format + lint
bun run check:fix            # Biome — autofix everything safe
bun run typecheck            # tsc --noEmit, strict mode
bun run knip                 # find unused deps / files / exports
bun run check:manifests      # validate marketplace.json + plugin.json + SKILL.md
bun run check:skill-docs     # fail if any SKILL.md is stale vs. its .tmpl
bun run ci                   # everything CI runs, in order
```

Every check above runs in [CI](.github/workflows/ci.yml) on push and
PR — including [shellcheck](https://www.shellcheck.net) on the
`setup` script. Biome is configured with the strictest practical
ruleset (all rule groups + nursery + pedantic style/correctness/
suspicious rules); see [`biome.json`](biome.json).

## Contributing

[`docs/authoring-skills.md`](docs/authoring-skills.md) is the canonical
guide for writing a new skill — frontmatter contract, description
writing, phased body structure, progressive disclosure, composing
skills, the template / snippet system, and CI checks.

[AGENTS.md](AGENTS.md) is the quick reference for the same material
and covers:

- Project structure (`plugins/<plugin>/skills/<skill>/SKILL.md`)
- Naming conventions (verb-noun: `/triage-lead`, `/create-deck`)
- The `SKILL.md` format + the 1024-char description cap
- Skill design principles (interactive, drafts-not-actions, etc.)
- The snippet / template system

Pull requests go through the CI gauntlet above; the `Plugins`
catalog in this README regenerates itself from each skill's
frontmatter — edit the frontmatter, not the table.

## License

[MIT](LICENSE) © 2026 Narrative I/O
