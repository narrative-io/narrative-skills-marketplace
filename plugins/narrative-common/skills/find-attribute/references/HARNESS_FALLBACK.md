# Harness fallbacks

What to do when `narrative-mcp` is unavailable, when individual MCP
calls error mid-flow, and when the harness doesn't expose
`AskUserQuestion`.

Never silently degrade. If a tool is unavailable, say so explicitly
in the returned `final_answer` (set `confidence: low` and add a
warning).

## `narrative-mcp` unavailable

This skill cannot run — its entire value is searching the live
catalog. The fallback:

- Ask the user for the attribute ID directly. They almost always
  know it (or can copy it from a previous successful run, or pull
  it from `https://api.narrative.io/attributes/<id>` via `curl`).
- If the user provides an ID, return a `final_answer` with
  `attribute_id` set, `confidence: low`, and a warning that the
  schema could not be verified because `narrative-mcp` was
  unavailable.
- If the user can't provide an ID either, return the empty-result
  shape from phase 5 with the warning explaining the harness gap.

## Partial degradation (a single MCP call errors mid-flow)

- `narrative_attributes_search` errors: retry once. If it still
  fails, ask the user for any candidate IDs they remember, then
  jump to phase 3.
- `narrative_attributes_describe` errors: retry once with a smaller
  ID batch (split into halves). If still failing, return the
  search-only ranking with `confidence: low` and a warning that
  schemas were not verified.

## "AskUserQuestion" not available

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same
question in plain prose — **one question per turn**, never batched
— and wait for a reply before continuing. The decision logic in the
main procedure is unchanged; only the delivery mechanism differs.
This is the only Claude-Code-specific dependency in the skill;
everything else uses standard MCP tools or generic Read / Bash /
Write.
