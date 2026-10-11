<!-- AUTO-GENERATED from HARNESS_FALLBACK.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# Harness fallbacks

What to do when `narrative-mcp` is unavailable and when the harness
does not expose `AskUserQuestion`.

Never silently degrade. If a tool is unavailable, say so in the report.

## `narrative-mcp` unavailable

This skill cannot run to completion without it. Attribute resolution,
dataset schema, validation, and execution all go through that server,
and nothing downstream is safe to guess at.

What is still worth doing:

- Ask the user to paste the attribute's enum values and the source
  column's schema plus 25 to 50 sample rows.
- Draft all three queries against what they pasted, and say clearly
  that none of them has been validated and that the column names came
  from the paste rather than from the platform.
- Generate the synthetic rows, which need no server at all, and hand
  them over as a reviewable list.
- Stop before claiming anything about coverage. Class counts come from
  a query against the built view, and without the server there is no
  view and no query.

## `narrative-knowledge-base` unavailable

Proceed. It is a *recommends*, used for looking up NQL behavior when a
query fails in a way the local references do not cover. Without it,
surface the failing error verbatim rather than guessing at a fix.

## `AskUserQuestion` not available

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.
