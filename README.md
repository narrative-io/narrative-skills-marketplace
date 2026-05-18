# narrative-skills-marketplace

A Claude Code plugin marketplace. Each plugin contains one or more
interactive skills — AI-powered workflows that guide users through
recurring processes step by step. Type `/skill-name` in Claude Code and
the skill walks you through it.

## Quick start

```bash
git clone <repo-url> narrative-skills-marketplace
cd narrative-skills-marketplace
bash setup
```

Then in Claude Code, type:

```
/hello
```

## Project structure

```
narrative-skills-marketplace/
├── .claude-plugin/
│   └── marketplace.json        # Marketplace catalog
├── plugins/
│   └── example/
│       ├── .claude-plugin/
│       │   └── plugin.json     # Plugin manifest
│       └── skills/
│           └── hello/
│               └── SKILL.md    # Skill definition
├── setup                       # Register marketplace + install plugins
├── CLAUDE.md                   # Conventions for contributors
└── README.md
```

## Adding a new plugin

1. Create `plugins/<plugin>/.claude-plugin/plugin.json` with `name`,
   `version`, `description`, `author`.
2. Add a corresponding entry to `.claude-plugin/marketplace.json`.
3. Create at least one skill under `plugins/<plugin>/skills/<skill>/SKILL.md`.
4. Run `bash setup` to register and install.

## Adding a new skill

1. Create `plugins/<plugin>/skills/<skill>/SKILL.md` with YAML frontmatter
   (`name`, `version`, `description`, `allowed-tools`) followed by the
   interactive workflow body.
2. Re-run `bash setup` (or just `claude plugin install <plugin>@narrative-skills-marketplace`).
3. Invoke `/skill` in Claude Code to test.

See [CLAUDE.md](CLAUDE.md) for conventions and skill design principles.
