# Security Policy

## Reporting a Vulnerability

If you believe you've found a security vulnerability in the
`narrative-skills-marketplace` repository or in one of the skills it
ships, please report it privately rather than opening a public issue.

**Preferred channels:**

1. **GitHub Security Advisory** — open a private advisory at
   <https://github.com/narrative-io/narrative-skills-marketplace/security/advisories/new>.
2. **Email** — <security@narrative.io>.

Please include enough detail for us to reproduce: the skill or file
involved, the trigger conditions, and the impact you observed. If
you're reporting an issue with one of the MCP servers a skill talks to
(`mcp.narrative.io`, `docs.narrative.io`, `api.narrative.io`), the same
channels apply.

We will acknowledge your report within **3 business days** and aim to
provide a substantive response (status, fix timeline, or request for
more info) within **10 business days**. Please give us a reasonable
window to investigate and ship a fix before any public disclosure.

## Scope

In scope:

- Code in this repository — skills, scripts, the `setup` installer, CI
  workflows.
- Skill content that could lead an agent to perform unsafe actions
  (e.g. exfiltrate credentials, run unintended commands, leak data
  across tenants).

Out of scope:

- Vulnerabilities in the underlying agent harness (Claude Code, etc.) —
  report those to the harness vendor.
- Issues in third-party MCP servers or APIs not maintained by
  Narrative I/O.
- Best-practice suggestions with no demonstrable security impact —
  please open a regular issue or PR for those.

## Supported Versions

The `main` branch is the only supported version. Patches will land on
`main`; we do not backport to older tags.
