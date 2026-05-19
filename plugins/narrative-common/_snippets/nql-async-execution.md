`narrative_nql_run` is **asynchronous**. It returns a job descriptor
immediately; the actual rows arrive only after the job finishes.

```
narrative_nql_run(
  nql: 'select … from company_data."<id>" limit 100'
)
→ { job_id: "<uuid>", state: "queued", ... }
```

Poll with `narrative_jobs_describe(job_ids: ["<uuid>"])` until `state`
is terminal. Use a short, bounded backoff — most queries finish in a
few seconds; very few should need more than 60s of polling.

Suggested polling cadence: 1s, 2s, 3s, 5s, 5s, 5s, 10s, 10s, 10s, 15s,
15s, … cap at ~15s between polls, give up at 5 minutes total wall
time and surface the partial state to the user.

Terminal states:

| `state` | Meaning | Next step |
| --- | --- | --- |
| `completed` | Job finished. **The payload depends on job type — rows almost never live here.** See "What `completed` actually returns" below. |
| `failed` | Engine error mid-execution | Read `failures` from the job payload; show it to the user verbatim; revise query and retry |
| `cancelled` | Operator or timeout abort | Tell the user the job was cancelled; offer to re-run |

Non-terminal states (`queued`, `running`, `processing`) → keep
polling. Never treat them as a result.

### What `completed` actually returns

The `result` field on a finished job is shaped by the job `type`:

| Job type | Triggered by | `result` payload | Where the rows live |
| --- | --- | --- | --- |
| `nql-forecast` | `narrative_nql_run` with `EXPLAIN …` | `{rows, cost}` — an estimate, not actual rows | n/a — forecasts return numbers only |
| `materialize-view` | `narrative_nql_run` with `CREATE MATERIALIZED VIEW …`, or any non-`EXPLAIN` `SELECT` (which is materialized into a dataset) | `{dataset_id, snapshot_id, recalculation_id}` | In the **data plane**, on the dataset identified by `dataset_id`. Not on the job. |
| `dataset-sample` | `narrative_dataset_request_sample` | Status only | A sample is stored on the dataset in the **control plane**; fetch it via `narrative_datasets_describe(include=["sample"])`. |

### Reading rows after a `materialize-view` job completes

Rows from a `CREATE MATERIALIZED VIEW` (or any executed `SELECT`) are
never inlined on the job. To see them you have to run a second
asynchronous job to materialize a sample, then fetch it:

1. **Submit the sampling job.** `narrative_dataset_request_sample(dataset_id: <id>)` → returns a new `job_id`. Use the `dataset_id` from the prior job's `result`.
2. **Poll that job to completion** with `narrative_jobs_describe(job_ids: ["<sample_job_id>"])`, using the same backoff as above.
3. **Read the sample rows** with `narrative_datasets_describe(dataset_ids: [<id>], include: ["sample"])`. The sample lives in the control plane and is what `include=["sample"]` returns.

```
narrative_nql_run(nql: "CREATE MATERIALIZED VIEW \"my_view\" AS (SELECT …) BUDGET 5 USD")
  → poll narrative_jobs_describe → result.dataset_id = 1234
narrative_dataset_request_sample(dataset_id: 1234)
  → poll narrative_jobs_describe → completed
narrative_datasets_describe(dataset_ids: [1234], include: ["sample"])
  → returns the sample rows (capped at 1,000)
```

The sample is a **point-in-time snapshot capped at 1,000 rows** of the
dataset as it stood when the sample job ran. All columns are included;
data is unmodified (Rosetta Stone attributes show their normalized
form). Samples persist on the control plane until deleted, so re-runs
of `narrative_datasets_describe(include=["sample"])` return the same
snapshot until a new sampling job is enqueued.

**1,000-row implication for query design.** When the goal is for the
user to inspect every row of the intended output (a dedup check, a
small enumerated set, an audit cut), cap the query itself at 1,000
rows — `LIMIT 1000` on the inner `SELECT`, or a `WHERE`/`GROUP BY`
that you know produces ≤ 1,000 rows. If the materialized dataset has
more than 1,000 rows, the sample is just an arbitrary 1,000 of them
and rows past the cap are invisible without exporting. For the
opposite case — billions of rows you don't actually need to see —
keep the `LIMIT` low (or push the work into aggregates: `COUNT(*)`,
`SUM`, `GROUP BY`) to control cost.

### Cost-of-execution reminder

Every `narrative_nql_run` consumes platform resources and the result
set is materialized. Default to a `LIMIT` clause whenever the user's
question doesn't explicitly need every row. Prefer aggregations
(`COUNT(*)`, `SUM`, `GROUP BY`) over pulling raw rows and counting in
the agent.

### Other async tools that follow the same pattern

`narrative_dataset_request_sample`,
`narrative_dataset_refresh_materialized_view`, and
`narrative_dataset_recalculate_statistics` use the same job-id +
`narrative_jobs_describe` polling protocol. The state machine and
backoff above apply identically. The recalculation case has one
caveat: for datasets not yet on the new statistics framework, the
returned id is **not** a job id and `narrative_jobs_describe` will
not find it — surface that to the user rather than polling forever.
