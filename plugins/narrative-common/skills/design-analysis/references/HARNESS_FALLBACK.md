# Harness fallbacks

What to do when `narrative-mcp` isn't available (or `--no-schema`
was passed), and what to do when the harness doesn't expose
`AskUserQuestion`.

Never silently degrade. If a tool is unavailable, say so explicitly
in the brief and reduce confidence accordingly.

## `narrative-mcp` unavailable (or `--no-schema` passed)

- Ask the user to paste the schema for each relevant table: name,
  grain, primary key, columns + types, known caveats. A 20–60-line
  paste is usually enough.
- With that pasted, run Phases 2, 4, and 5 normally. Phase 3
  becomes: "structure the user's pasted dictionary into the data-
  sources table in the brief."
- Add a global caveat to the brief: "schema not verified against
  `narrative-mcp`; the query writer should re-validate column names
  before running."

If the user has *no* schema at all, stop and say so explicitly. The
brief is unsafe to ship without a verified schema; do not guess.

## "AskUserQuestion" not available

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same
question in plain prose — **one question per turn**, never batched
— and wait for a reply before continuing. The decision logic in the
main procedure is unchanged; only the delivery mechanism differs.
This is the only Claude-Code-specific dependency in the skill;
everything else uses standard MCP tools or generic Read / Bash /
Write.
