# Common cases

Worked shapes for the situations that come up most. Each one applies the
judgment in the skill's opening section — finish on the first attempt, don't
obviously overspend — so read these as that call already made rather than as
independent rules.

| Case | Evidence you'd have | Recommendation | Confidence |
| --- | --- | --- | --- |
| Sample or interactive query, small dataset | Row count in the low millions or less, human waiting, no refresh schedule | Shared always-on, per-job. Avoiding the ~8 minute cluster launch is the whole argument. Only when the job is genuinely seconds-to-minutes. | High |
| Scheduled refresh, currently slow | `refresh_schedule_config` set, `first_run: false`, `merge: true` | Size on the largest recent `last_snapshot_added_records`, then take a rung for headroom — this runs unattended, so a failure waits for someone to notice. `merge: true` also argues for `_storage`. Set as **dataset default**. | Medium |
| First build of a large MV | `first_run: true`, or no job history at all | Size against `active_dataset_stored_records` of the sources plus a rung; a first build has nothing to calibrate against. Set **per-job** so steady-state refreshes stay on the smaller pool. | Low-medium |
| Query reads an access rule | Rule resolves, but carries no stats | Follow its `dataset_ids` for row counts. If those don't resolve, ask what volume they expect. Only if the number is load-bearing and they agree, offer a probe query on the shared always-on pool — this is the one case that justifies running anything. Never size off the rule's schema. | Medium with a probe, low without |
| Heavy joins or a high-cardinality `GROUP BY` | Three-plus datasets in the NQL, or a high `approx_count_distinct` on the group key | The band from row count, plus a rung, and try `_storage` at that size first — it's a quarter the cost of a size step and targets the scratch space this work needs. | Medium |
| Volume swings month to month | Spread across recent `last_snapshot_added_records`, or across run durations | Size for the high end of the observed range, not the mean. One rung, and say what range you sized for. | Medium |
| Stuck in `Pending` | `state: pending`, no progress, no error | Not a sizing problem — the in-flight cluster cap. Offer the shared pool, which never waits for a slot. **No resize.** | High |
| Bulk fan-out — dozens or hundreds of jobs | User says "I'm about to run N of these" | They run one at a time, so kill launch overhead first: submit back-to-back, raise `idle_timeout_seconds`. Then consider a step up, which can cut total cost. Never the shared pool. | High on scheduling, low on per-job duration |
| Slow, unchanged after a size step | User reports both runs | Suspect skew or query shape. Stop stepping up; see [`DIAGNOSTICS.md`](DIAGNOSTICS.md). | Medium |
| Job hangs rather than runs slowly on `medium` | User reports jobs sitting and never progressing | Both nodes went to coordination and nothing was left to work. Go to `large`. Not a patience problem. | High |
| Failed, message says nothing useful | `failures[].message` is generic or absent | Say the cause is unreported rather than naming one. Size from row count and query shape, take the headroom rung because a rerun costs someone's attention, and ask for the next failure. | Low on cause, medium on size |
| Dataset has no stats, or no column stats | `stats` renders `_not set_`, or column stats come back empty | Say so plainly, then offer: *"stats are off on this dataset — want me to turn them on and recalculate? It runs a job."* On a yes, enable and recalculate; on a no, size from what you have and name the gap. Never substitute a number. | Low until stats land |
| Heavy `GROUP BY` and you want to know if it will skew | Histogram on that key, `histogram_bin_limit=10` | Read the top bin's `ratio`. One value holding a large share means one oversized slice of work that a bigger pool won't fix — say so instead of stepping up. Costs nothing and needs no query. | High where stats exist |
| Snowflake plane | `platform.type` | Recommend among registered warehouses; if none fit, register one and re-run. Never apply the AWS ladder. See [`SNOWFLAKE.md`](SNOWFLAKE.md). | Medium |

## When none of these fit

Fall back to the phases. The bands in
[`POOL_SIZES.md`](POOL_SIZES.md) §3b give a floor from the row count, the
query shape adjusts off it, the headroom rule takes that to a
recommendation, and the guardrail caps it. If you find yourself more than one
rung above the band without a measured rerun, a deadline, or observed
variance to point at, you have talked yourself into overspending — go back
down.
