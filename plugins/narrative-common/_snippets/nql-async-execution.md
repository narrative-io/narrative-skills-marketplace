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
| `completed` | Rows are available on the job descriptor | Read `result` / `rows` / `output_url` from the job payload |
| `failed` | Engine error mid-execution | Read `error` from the job payload; show it to the user verbatim; revise query and retry |
| `cancelled` | Operator or timeout abort | Tell the user the job was cancelled; offer to re-run |

Non-terminal states (`queued`, `running`, `processing`) → keep
polling. Never treat them as a result.

### Cost-of-execution reminder

Every `narrative_nql_run` consumes platform resources and the result
set is materialized. Default to a `LIMIT` clause whenever the user's
question doesn't explicitly need every row. Push aggregations into
the query (`COUNT(*)`, `SUM`, `GROUP BY`) instead of pulling raw rows
back and counting in the agent.

### Other async tools that follow the same pattern

`narrative_dataset_request_sample` and
`narrative_dataset_recalculate_statistics` use the same job-id +
`narrative_jobs_describe` polling protocol. The state machine and
backoff above apply identically.
