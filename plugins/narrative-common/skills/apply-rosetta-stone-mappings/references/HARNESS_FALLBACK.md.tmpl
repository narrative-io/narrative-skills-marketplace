# Harness fallbacks

What to do when `narrative-mcp` is unavailable, when individual MCP
calls error mid-flow, and when the harness doesn't expose
`AskUserQuestion`.

Never silently degrade. If a tool is unavailable, say so explicitly
in the final summary and either stop at render or hand the user a
copy-pasteable spec.

## `narrative-mcp` unavailable

This skill cannot submit a workflow without the server. The
fallback:

- Run Phases 1–3 from the user's pasted context (skip the company
  pin in Phase 1 if you cannot reach `narrative_context_get` —
  surface a warning that the company was not verified).
- Skip Phase 4 (dataset describe). Ask the user for the
  `datasetName` and `dataPlaneId` explicitly.
- Skip Phase 5 re-validation. Add a global warning to the rendered
  spec: "Expressions were not server-validated; the dataset's
  current schema is unknown. Re-validate manually before applying."
- Render the spec in Phase 7 as usual.
- Stop at Phase 8. Tell the user to paste the YAML into the
  Narrative Platform's workflow creation UI, or to `curl
  https://api.narrative.io/workflows` with the spec when the MCP
  server comes back.

Do not attempt to submit via any path other than
`narrative_workflows_create`. The platform's REST API contract is
not part of this skill's compatibility surface.

## Partial degradation (a single MCP call errors mid-flow)

| Tool | Behavior on error |
| --- | --- |
| `narrative_context_get` | Retry once. If it still fails, surface a warning and continue — the platform will reject the workflow at submit time if the context is wrong, which is a safer failure than a silent wrong-company submission. |
| `narrative_datasets_describe` | Retry once. If still failing, ask the user for `datasetName` and `dataPlaneId` directly and surface a warning that conflict detection (existing mappings) is unavailable. |
| `narrative_nql_validate` | Retry once per validate call. If a specific expression's validate keeps failing on transport (not on syntax), surface that mapping with a warning and ask the user whether to proceed (drop, defer, or override). Do not auto-proceed. |
| `narrative_data_planes_list` | Retry once. If still failing and the dataset describe also failed (no `dataPlaneId` known), ask the user to provide the plane UUID. |
| `narrative_workflows_create` | A 4xx is a validator error — fix the spec and re-submit (see [`EDGE_CASES.md`](EDGE_CASES.md) for the common root causes). A 5xx or network error is transport — retry once, then surface. |
| `narrative_workflow_runs_list` | Retry once per poll. If it keeps failing, stop polling and tell the user the workflow was submitted (give them the `workflow_id`) but the run state is unknown. |

## `AskUserQuestion` not available

{{SNIPPET:askuserquestion-fallback}}
