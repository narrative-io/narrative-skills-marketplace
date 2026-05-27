<!-- AUTO-GENERATED from HARNESS_FALLBACK.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# Harness fallbacks

What to do when a required tool or MCP server is unavailable. Load
this file only when the body's `## Harness fallbacks` section points
you here for a specific gap.

## When `narrative_nql_validate` is unavailable

Skip the Phase 6 pre-flight validation. Surface a one-line warning
to the user before the submit gate ("NQL validation tool not
available — the workflow runner will catch any syntax errors after
~5 minutes instead of up front"). Do not auto-substitute
`narrative_nql_run` — that allocates compute.

## When `AskUserQuestion` is unavailable

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.
