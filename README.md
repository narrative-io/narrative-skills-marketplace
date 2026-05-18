# narrative-skills-marketplace

A Claude Code plugin marketplace published by Narrative I/O. Each plugin
bundles one or more interactive skills — AI-powered workflows that walk
you through a recurring process step by step. Install the marketplace,
type `/skill-name` in Claude Code, and the skill takes it from there.

## Install

```bash
git clone <repo-url> narrative-skills-marketplace
cd narrative-skills-marketplace
bash setup
```

`setup` registers the marketplace with Claude Code, installs every
plugin listed below, and regenerates the catalog in this README.

<!-- BEGIN PLUGINS -->
## Plugins

### `narrative-common`

Common Narrative workflows backed by the narrative-mcp server — starting with Rosetta Stone attribute mapping generation, evaluation, and improvement.

| Skill | Use when |
|-------|----------|
| `/generate-rosetta-stone-mappings` | "map this dataset to Rosetta Stone", "suggest normalized attributes for dataset N", "evaluate the mappings on dataset N", "why is this mapping low confidence", "fix this expression", "improve this NQL mapping expression". |

<!-- END PLUGINS -->

## Contributing

See [CLAUDE.md](CLAUDE.md) for project structure, naming conventions, the
`SKILL.md` format, and the design principles every skill in this
marketplace follows.

The `Plugins` section above is generated from each plugin's
`plugin.json` and each skill's `SKILL.md` frontmatter — edit those, then
re-run `bash setup` (or `bun scripts/regen-readme.ts`) to update.
