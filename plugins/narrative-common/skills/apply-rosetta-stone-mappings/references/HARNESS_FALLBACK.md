<!-- AUTO-GENERATED from HARNESS_FALLBACK.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
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

## Waiting tools not available

A Narrative agent run has three waiting tools. `job_monitor(job_id)` takes a
job the platform runs and hands back a handle for it;
`wait_for(handles, timeout_seconds)` pauses the run until those jobs finish and
returns what each did, spending no turns while it waits; `sleep(duration_seconds)`
pauses the run for a set time, for work the platform cannot watch.

No other harness has them, and nothing substitutes for the pause itself — only
for the pacing. Check the status yourself, and put the harness's own wait
between checks:

- **Claude Code** — a `Monitor` driving an `until` loop, so the session stays
  free while the operation runs. Use that rather than `bash sleep`.
- **Any harness with a background or scheduled wait** — same shape: re-check on
  an interval, report once the state is terminal.
- **Nothing of the kind** — a foreground `bash sleep` between status calls, as a
  last resort. Some harnesses block it outright, Narrative agent runs among them
  — though there you would have `sleep` instead.

Cadence and the give-up rule are unchanged; they are in the skill body. Say when
you have degraded: "no wait tool here, so I'm checking every 30s" is worth
knowing when a job runs for an hour.

## `AskUserQuestion` not available

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.
