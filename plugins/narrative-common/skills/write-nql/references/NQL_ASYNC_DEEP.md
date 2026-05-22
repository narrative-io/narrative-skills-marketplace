# Async execution: payload shapes and the materialize → sample → describe dance

Deep-dive companion to the async-execution snippet inlined in step 8.
The snippet covers the high-level state machine (`pending` /
`running` / `completed`) and polling cadence; this file documents
**what the `completed` payload actually contains for each job type**
and the second-job sampling dance you have to perform to read rows
out of a `CREATE MATERIALIZED VIEW`.

Read this when:

- A job came back `completed` but you can't find rows on the
  descriptor.
- You need to surface results to the user after a `materialize-view`
  job and aren't sure which dataset id holds them.
- You're orchestrating one of the other async tools
  (`narrative_dataset_request_sample`,
  `narrative_dataset_refresh_materialized_view`,
  `narrative_dataset_recalculate_statistics`) and need to confirm it
  uses the same polling contract.

## What `completed` actually returns

The `result` field on a finished job is shaped by the job `type`:

| Job type | Triggered by | `result` payload | Where the rows live |
| --- | --- | --- | --- |
| `materialize-view` | `narrative_nql_run` with `CREATE MATERIALIZED VIEW "<name>" AS SELECT …` | `{dataset_id, snapshot_id, recalculation_id}` | In the **data plane**, on the dataset identified by `dataset_id`. Not on the job. |
| `dataset-sample` | `narrative_dataset_request_sample` | Status only | A sample is stored on the dataset in the **control plane**; fetch it via `narrative_datasets_describe(include=["sample"])`. |

## Reading rows after a `materialize-view` job completes

Rows from a `CREATE MATERIALIZED VIEW` are never inlined on the job
descriptor. To see them you have to run a second asynchronous job to
materialize a sample, then fetch it.

1. **Submit the sampling job.** `narrative_dataset_request_sample(dataset_id: <id>)` → returns a new `job_id`. Use the `dataset_id` from the prior job's `result`.
2. **Poll that job to completion** with `narrative_jobs_describe(job_ids: ["<sample_job_id>"])`, using the same backoff as the parent snippet.
3. **Read the sample rows** with `narrative_datasets_describe(dataset_ids: [<id>], include: ["sample"])`. The sample lives in the control plane and is what `include=["sample"]` returns.

```
narrative_nql_run(nql: "CREATE MATERIALIZED VIEW \"my_view\" AS SELECT …")
  → poll narrative_jobs_describe → result.dataset_id = 1234
narrative_dataset_request_sample(dataset_id: 1234)
  → poll narrative_jobs_describe → completed
narrative_datasets_describe(dataset_ids: [1234], include: ["sample"])
  → returns the sample rows (capped at 1,000)
```

The sample is a **point-in-time snapshot capped at 1,000 rows** of
the dataset as it stood when the sample job ran. All columns are
included; data is unmodified (Rosetta Stone attributes show their
normalized form). Samples persist on the control plane until
deleted, so re-runs of
`narrative_datasets_describe(include=["sample"])` return the same
snapshot until a new sampling job is enqueued.

**1,000-row implication for query design.** When the goal is for the
user to inspect every row of the intended output (a dedup check, a
small enumerated set, an audit cut), cap the query itself at 1,000
rows — `LIMIT 1000` on the inner `SELECT`, or a `WHERE`/`GROUP BY`
that you know produces ≤ 1,000 rows. If the materialized dataset
has more than 1,000 rows, the sample is just an arbitrary 1,000 of
them and rows past the cap are invisible without exporting. For the
opposite case — billions of rows you don't actually need to see —
keep the `LIMIT` low (or push the work into aggregates: `COUNT(1)`,
`SUM`, `GROUP BY`) to control cost.

## Other async tools that follow the same pattern

`narrative_dataset_request_sample`,
`narrative_dataset_refresh_materialized_view`, and
`narrative_dataset_recalculate_statistics` use the same job-id +
`narrative_jobs_describe` polling protocol. The state machine and
backoff in the parent snippet apply identically. The recalculation
case has one caveat: for datasets not yet on the new statistics
framework, the returned id is **not** a job id and
`narrative_jobs_describe` will not find it — surface that to the
user rather than polling forever.
