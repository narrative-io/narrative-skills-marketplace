# Harness fallbacks

What to do when `narrative-mcp` is unavailable and when the harness
doesn't expose `AskUserQuestion`.

Never silently degrade. If a tool is unavailable, say so explicitly
in the explanation.

## `narrative-mcp` unavailable

- Ask the user to paste the dataset's schema (column names + types)
  and 10-25 sample rows.
- With that context pasted in, draft the query and apply the syntax
  rules above manually. You cannot validate without the server —
  add a global caveat in the explanation that the query has *not*
  been server-validated and the user should sanity-check before
  running it through the Narrative UI.
- Never silently degrade. If validation was skipped, say so
  explicitly.

## "AskUserQuestion" not available

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same
question in plain prose — **one question per turn**, never batched
— and wait for a reply before continuing. The decision logic in the
main procedure is unchanged; only the delivery mechanism differs.
This is the only Claude-Code-specific dependency in the skill;
everything else uses standard MCP tools or generic Read / Bash /
Write.
