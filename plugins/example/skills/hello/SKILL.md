---
name: hello
version: 0.1.0
description: |
  Minimal example skill. Greets the user and demonstrates the SKILL.md
  format expected by Claude Code plugins.
  Use when: "hello", "say hi", or as a template for new skills.
  (example)
allowed-tools:
  - AskUserQuestion
---

# /hello

This is the minimal scaffold for a Claude Code skill. Replace the contents
below with your own interactive workflow.

## Phase 1: Greet

Ask the user for their name with `AskUserQuestion`, then respond:

> Hello, {name}! This is the example skill from
> `narrative-skills-marketplace`. Edit
> `plugins/example/skills/hello/SKILL.md` to customize, or copy this
> directory to scaffold a new skill.

## Notes for skill authors

- Skill names follow the **verb-noun** pattern (`/triage-lead`,
  `/create-deck`). Single-word skills are OK when unambiguous (`/commit`).
- Frontmatter `allowed-tools` must list every non-MCP tool the skill calls.
- Prefer one question at a time when interacting with the user.
- For external-facing output (email, Slack), always draft and require
  approval before sending.
