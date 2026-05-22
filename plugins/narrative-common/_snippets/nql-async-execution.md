`narrative_nql_run` is **asynchronous**. It returns a job descriptor
immediately; the actual rows arrive only after the job finishes.

```
narrative_nql_run(
  query: 'CREATE MATERIALIZED VIEW "<name>" AS SELECT … FROM company_data."<id>"',
  data_plane_id: '<uuid-of-dataset-plane>'
)
→ { job_id: "<uuid>", state: "queued", ... }
```

### Selecting `data_plane_id` — mandatory when it's not the company default

NQL queries execute inside a single data plane and only see datasets
that live there. `narrative_nql_validate`, `narrative_nql_run`, and
`narrative_nql_get_job` all accept an optional `data_plane_id`; when
omitted, each falls back to the **company default** plane, which is
almost never the right choice for a multi-plane tenant. Pass the data
plane of the dataset(s) being queried explicitly to all three.

Resolution sequence:

1. **Capture the dataset's data plane during describe.** `narrative_datasets_describe(dataset_ids: [<id>], include: ["metadata"])` exposes the dataset's plane assignment alongside its name and id. Record it next to the unique_name / id you'll use in the query.
2. **Confirm every dataset on the query is on the same plane.** Cross-plane joins fail at execution; if a query references multiple datasets, all of them must share a plane. If they don't, that's the cross-data-plane gotcha — query each plane separately or materialize one side into the other plane first.
3. **Pass the same `data_plane_id` to validate, run, and get_job.** If you need to discover available planes (e.g. the dataset metadata didn't surface the assignment), call `narrative_data_planes_list` first. See the gotchas reference for the failure mode this prevents — most visibly, validator-only "Unknown Table" errors on numeric-id references that run accepts.

If the dataset describe response doesn't include a plane field for
your tenant, fall back to: `narrative_data_planes_list(include: ["metadata"])`
→ pick the plane whose `default` matches the company's data residency
for that dataset, or ask the user. **Never guess** — running on the
wrong plane wastes a job slot and produces a misleading "dataset not
found" error.

Poll with `narrative_jobs_describe(job_ids: ["<uuid>"])` until `state`
is terminal. Use a short, bounded backoff — most queries finish in a
few seconds; very few should need more than 60s of polling.

Suggested polling cadence: 1s, 2s, 3s, 5s, 5s, 5s, 10s, 10s, 10s, 15s,
15s, … cap at ~15s between polls. **Give-up rule: 15 minutes per
state, with the timer reset whenever the job's `state` field
transitions** (e.g. `pending` → `running`, `running` → `processing`).
Only abandon polling if the same state has persisted for 15 minutes
without progress. Cold compute pools can sit in `pending` for several
minutes before promoting; a flat 5-minute total cap kills jobs that
haven't actually started. When you do give up, surface the
`job_id` and partial state to the user so they can check on it later.

Terminal states:

| `state` | Meaning | Next step |
| --- | --- | --- |
| `completed` | Job finished. **The payload depends on job type — rows almost never live here.** | See [`references/NQL_ASYNC_DEEP.md`](references/NQL_ASYNC_DEEP.md) for what `result` looks like per job type. |
| `failed` | Engine error mid-execution | Read `failures` from the job payload; show it to the user verbatim; revise query and retry |
| `cancelled` | Operator or timeout abort | Tell the user the job was cancelled; offer to re-run |

Non-terminal states (`queued`, `running`, `processing`) → keep
polling. Never treat them as a result.

> Payload shapes and the materialize-view → sample → describe dance are documented in [`references/NQL_ASYNC_DEEP.md`](references/NQL_ASYNC_DEEP.md).
