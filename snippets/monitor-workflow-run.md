After `narrative_workflows_create` returns, capture both
`workflowId` and `runId` (the latter is present when the call was
made with `trigger_immediately=true`). Poll the run until terminal:

```
narrative_workflow_runs_list(workflow_id=workflowId)
```

Terminal states are `completed`, `failed`, and `terminated`.

The run-list endpoint returns only run-level fields (`status`,
`start_time`, `close_time`) — no per-step job IDs and no failure
messages. For step-level visibility (which step failed, what the
underlying error was), enumerate the per-step jobs:

```
narrative_jobs_search(workflow_run_id=runId)
```

Each result carries a `job_id` plus the workflow step it ran for.
Pull the failing one's detail with
`narrative_jobs_describe(job_id=<...>)` to read the actual error
message. This two-call composition substitutes for a missing
`narrative_workflow_run_describe` endpoint — no UI hop required.

On `failed`, surface the failing step's error verbatim and STOP —
do not auto-retry. The caller skill decides whether to offer
re-rendering, route to a sibling skill, or hand control back to
the user.
