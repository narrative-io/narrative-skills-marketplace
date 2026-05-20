# Harness fallbacks

What to do when `narrative-mcp` is unavailable and when the harness
doesn't expose `AskUserQuestion`.

Never silently degrade. If a tool is unavailable, say so explicitly
in the summary and reduce confidence accordingly.

## `narrative-mcp` unavailable

- Ask the user to paste the dataset's schema + 10-25 sample rows +
  the Rosetta Stone attribute IDs they're considering (or to run
  `curl https://api.narrative.io/datasets/<id>` and paste the
  response).
- With that context pasted in, apply steps 5-8 of the procedure
  manually — you can't validate NQL syntactically without the
  server, so add a global warning saying expressions were not
  server-validated and confidence is reduced by 10 points across
  the board.
- Never silently degrade. If you can't validate, say so explicitly
  in the summary.

## "AskUserQuestion" not available

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same
question in plain prose — **one question per turn**, never batched
— and wait for a reply before continuing. The decision logic in the
main procedure is unchanged; only the delivery mechanism differs.
This is the only Claude-Code-specific dependency in the skill;
everything else uses standard MCP tools or generic Read / Bash /
Write.
