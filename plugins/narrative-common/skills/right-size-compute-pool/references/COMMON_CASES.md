# Common cases

Worked shapes for the situations that come up most. Each one applies the
judgment in the skill's opening section — finish on the first attempt,
don't obviously overspend — so read these as that call already made rather
than as independent rules.

| Case | Evidence | Recommendation | Confidence |
| --- | --- | --- | --- |
| Sample or interactive query, small dataset | Low-MB `active_dataset_stored_bytes`, human waiting, no schedule | Shared always-on, per-job. Avoided cold start is the whole argument. Only when the job is genuinely seconds-to-minutes. | High |
| Scheduled refresh, currently slow | `refresh_schedule_config` set, `first_run: false`, `merge: true` | Size on the largest recent delta, then take a rung for headroom — this runs unattended, so a failure waits for someone to notice. `merge: true` also argues for `_storage`. Set as **dataset default**. | Medium |
| Failed with `No space left on device` | The verbatim error | Sideways to the same size's `_storage` variant — it fixes the dimension that failed. Step up only if that still fails. | High |
| First build of a large MV | `first_run: true` | Size against total bytes plus a rung; a first build has no history to calibrate against. Set **per-job** so steady-state refreshes stay on the smaller pool. | Low-medium |
| Volume swings month to month | Spread across recent snapshots or run durations | Size for the high end of the observed range, not the mean. One rung, and say what range you sized for. | Medium |
| Stuck in `Pending` | No error, no progress | Not a sizing problem — the in-flight cluster cap. Offer the shared pool, which never waits for a slot. **No resize.** | High |
| Bulk fan-out — dozens or hundreds of jobs | User says "I'm about to run N of these" | They run one at a time, so kill cold start first: submit back-to-back, raise `idle_timeout_seconds`. Then consider a step up, which can cut total cost. Never the shared pool. | High on scheduling, low on per-job duration |
| Slow, unchanged after a size step | User reports both runs | Suspect skew or query shape. Stop stepping up; see [`DIAGNOSTICS.md`](DIAGNOSTICS.md). | Medium |
| Job hangs rather than runs slowly on `medium` | `Initial job has not accepted any resources` | Deadlock, not slowness — the app master consumed the core instances. Go to `large`. Not a patience problem. | High |
| Snowflake plane | `platform.type` | Recommend among registered warehouses; if none fit, register one and re-run. Never apply the EMR ladder. See [`SNOWFLAKE.md`](SNOWFLAKE.md). | Medium |

## When none of these fit

Fall back to the phases. The bands in Phase 8 give a floor, the headroom
rule takes it to a recommendation, and the guardrail caps it. If you find
yourself more than one rung above the band without a measured failure, a
deadline, or observed variance to point at, you have talked yourself into
overspending — go back down.
