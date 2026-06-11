<!-- AUTO-GENERATED from HARNESS_FALLBACK.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# Harness fallbacks

What to do when the MCP servers this skill depends on aren't
available — most commonly `narrative-mcp`, occasionally
`narrative-knowledge-base` — and what to do when `AskUserQuestion`
isn't exposed by the harness.

Never silently degrade. If a tool is unavailable, say so explicitly
in the final summary and reduce confidence accordingly.

## `narrative-mcp` unavailable

Every phase after argument parsing depends on it: dataset resolution,
attribute classification, NQL validation, data-plane resolution, and
submission. If the user supplied complete inputs (datasets, features,
output config) you may still render the pipeline YAML from the
templates and hand it over as an artifact — clearly labeled as
unvalidated — and tell the user to re-invoke the skill (or
`/create-workflow --spec <path>`) once `narrative-mcp` is back. Do
not promote any out-of-band submission path, and never present an
unvalidated spec as ready to run.

## `narrative-knowledge-base` unavailable but `narrative-mcp` is

Proceed. The pipeline templates and classification rules in
`references/` are self-contained — KB access is a *recommends*, not a
*requires*.

## `AskUserQuestion` not available

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.
