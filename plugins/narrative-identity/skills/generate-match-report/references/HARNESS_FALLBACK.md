# Harness fallbacks

What to do when a required tool or MCP server is unavailable. Load
this file only when the body's `## Harness fallbacks` section points
you here for a specific gap.

## When `AskUserQuestion` is unavailable

The skill ships as an interactive interview. Without
`AskUserQuestion`, ask the same options as a numbered list in prose:

```
**Pick one — reply with 1, 2, or 3:**
1. <option A> (recommended)
2. <option B>
3. <option C>
```

For multi-select prompts (id-type subsetting, enrichment attribute
groups), default selections are still pre-ticked. Ask the user to
reply with the numbers to *uncheck* — keeps the prose short.

Mandatory steps (pre-flight validation, schema-fidelity rule, dry-run
gate) do not change.
