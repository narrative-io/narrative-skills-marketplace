# Contributing

Thanks for your interest in contributing to the Narrative Skills
Marketplace! This file is the quick-start; the canonical authoring
guide is [`docs/authoring-skills.md`](docs/authoring-skills.md).

## Before you start

- Read [`docs/authoring-skills.md`](docs/authoring-skills.md) — it
  covers the `SKILL.md` format, frontmatter contract, description
  writing, phased body structure, the template/snippet system, and the
  CI checks every PR runs through.
- Skim [`AGENTS.md`](AGENTS.md) for the 60-second tour: project
  structure, naming conventions, and skill design principles.
- All contributors are expected to follow the
  [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

```bash
git clone https://github.com/narrative-io/narrative-skills-marketplace
cd narrative-skills-marketplace
bun install
```

You need [Bun](https://bun.sh) ≥ 1.1 to render templates and run the
checks; the `setup` installer additionally needs the
[Claude Code](https://claude.com/claude-code) CLI on `PATH`.

## Adding or changing a skill

1. Branch off `main`.
2. Edit (or create) the `SKILL.md.tmpl` under
   `plugins/<plugin>/skills/<skill>/`. If your skill has no template,
   edit `SKILL.md` directly — but most non-trivial skills should use a
   template so shared snippets stay DRY.
3. Run `bun run gen:skill-docs` to render the rendered `SKILL.md`.
4. Run `bun run ci` to make sure everything is green locally.
5. Open a PR. The marketplace catalog in `README.md` regenerates
   itself from each skill's frontmatter — don't hand-edit the table.

## What CI checks

Every PR runs through:

```bash
bun run check:skill-docs   # SKILL.md is up to date vs. SKILL.md.tmpl
bun run check:manifests    # marketplace.json + plugin.json + SKILL.md frontmatter
bun run check              # Biome format + lint
bun run typecheck          # tsc --noEmit, strict
bun run knip               # unused deps / files / exports
```

Plus [shellcheck](https://www.shellcheck.net) on `setup`. See
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) for the full
pipeline.

## Filing issues

- **New skill request** — use the
  [`new-skill` issue template](.github/ISSUE_TEMPLATE/new-skill.yml).
- **Improve an existing skill** — use the
  [`improve-skill` template](.github/ISSUE_TEMPLATE/improve-skill.yml).
- **Security report** — see [`SECURITY.md`](SECURITY.md). Do **not**
  open a public issue for vulnerabilities.

## Style and conventions

- Verb-noun skill names (`/create-deck`, `/triage-lead`).
- Skill directory names match the slash command (lowercase,
  hyphen-separated, no leading `/`).
- Descriptions are ≤ 1024 chars and lead with trigger phrases.
- Numbered, phased workflow bodies. One `AskUserQuestion` at a time.
- For external-facing output (email, Slack, etc.), the skill must
  **draft** and require explicit user approval before acting.

See [`AGENTS.md`](AGENTS.md#skill-design-principles) for the full list.

## License

By contributing, you agree that your contributions will be licensed
under the [MIT License](LICENSE) that covers this project.
