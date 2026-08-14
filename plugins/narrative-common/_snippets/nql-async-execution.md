`narrative_nql_execute` is **asynchronous**. It returns a *workflow*
that runs the query plus the *run* of that workflow — no rows, and no
job id. The rows (or the view) arrive only after the run finishes.

```
narrative_nql_execute(
  nql: 'CREATE MATERIALIZED VIEW "<name>" AS SELECT … FROM company_data."<id>"',
  data_plane_id: '<uuid-of-dataset-plane>'
)
→ ## NQL workflow <workflow-uuid>
  _run:_ <run-uuid>
```

> The old name `narrative_nql_run` still resolves to this tool, but it
> is no longer advertised in the tool list, and it used to hand back a
> job id instead of the two ids above. Call `narrative_nql_execute`.

### Selecting `data_plane_id` — mandatory when it's not the company default

NQL queries execute inside a single data plane and only see datasets
that live there. Both `narrative_nql_validate` and
`narrative_nql_execute` accept an optional `data_plane_id`; when
omitted, each falls back to the **company default** plane, which is
almost never the right choice for a multi-plane tenant. Pass the data
plane of the dataset(s) being queried explicitly to both.

Resolution sequence:

1. **Capture the dataset's data plane during describe.** `narrative_datasets_describe(dataset_ids: [<id>], include: ["metadata"])` exposes the dataset's plane assignment alongside its name and id. Record it next to the unique_name / id you'll use in the query.
2. **Confirm every dataset on the query is on the same plane.** Cross-plane joins fail at execution; if a query references multiple datasets, all of them must share a plane. If they don't, that's the cross-data-plane gotcha — query each plane separately or materialize one side into the other plane first.
3. **Pass the same `data_plane_id` to validate and execute.** If you need to discover available planes (e.g. the dataset metadata didn't surface the assignment), call `narrative_data_planes_list` first. See the gotchas reference for the failure mode this prevents — most visibly, validator-only "Unknown Table" errors on numeric-id references that execution accepts.

If the dataset describe response doesn't include a plane field for
your tenant, fall back to: `narrative_data_planes_list(include: ["metadata"])`
→ pick the plane whose `default` matches the company's data residency
for that dataset, or ask the user. **Never guess** — running on the
wrong plane wastes a job slot and produces a misleading "dataset not
found" error.

### Following the run to its result

Two levels, and they answer different questions. The **run** tells you
whether the query is still going; the **job** underneath it holds the
result and any error message.

```
narrative_workflow_runs_list(workflow_id: "<workflow-uuid>")
  → status: completed | failed | terminated (anything else: not finished)

narrative_jobs_search(workflow_run_id: "<run-uuid>")
  → the job this run enqueued for the query

narrative_jobs_describe(job_ids: ["<job-uuid>"], include: ["compiled_sql", "result"])
  → state, result, failures, and the SQL the query compiled to
```

The job appears only once the run has enqueued it, so an empty
`narrative_jobs_search` on a run that just started means "not yet",
not "nothing to find".

{{SNIPPET:async-poll-cadence}}

For NQL the early/startup job states are `queued` / `pending` (where
the stuck-job give-up rule applies) and the active states are
`running` / `processing`.

Terminal job states:

| `state` | Meaning | Next step |
| --- | --- | --- |
| `completed` | Job finished. **The payload depends on job type — rows almost never live here.** | See [`references/NQL_ASYNC_DEEP.md`](references/NQL_ASYNC_DEEP.md) for what `result` looks like per job type. |
| `failed` | Engine error mid-execution | Read `failures` from the job payload; show it to the user verbatim; revise query and retry |
| `cancelled` | Operator or timeout abort | Tell the user the job was cancelled; offer to re-run |

Non-terminal states (`queued`, `running`, `processing`) → not a
result. Same for a run that is not yet `completed`, `failed`, or
`terminated`.

> Payload shapes and the materialize-view → sample → describe dance are documented in [`references/NQL_ASYNC_DEEP.md`](references/NQL_ASYNC_DEEP.md).
