# Diagnosing what a job actually needs

Read this in Phase 4 when interpreting job history, and in Phase 7 when
mapping a reported symptom to a fix. The core idea: **the symptom tells
you which resource is binding**, and only one of the three possible
answers is "a bigger pool."

---

## 1. Reading a `materialize-view` job's `input`

`narrative_jobs_describe(..., include=["metadata","input","result","failures"])`
returns an `input` object on MV jobs. A representative shape:

```json
{
  "merge": false,
  "first_run": true,
  "partitions": null,
  "stats_enabled": false,
  "contains_delta_syntax": true,
  "compiled_select": "SELECT ... FROM narrative.datasets.ds_41823",
  "delta_dataset_bounds": []
}
```

What each field tells you:

| Field | Reading |
| --- | --- |
| `first_run: true` | A full build, not incremental. Size against `active_dataset_stored_bytes`. |
| `first_run: false` | Incremental. Size against `last_snapshot_added_bytes` — often orders of magnitude smaller. |
| `merge: true` | The expensive `MERGE` path. Strong signal for both a larger pool and a `_storage` variant. See §2. |
| `partitions` | If set, the partitioning in play; uneven partitions predict skew. |
| `compiled_select` | The real cost driver. Scan it — see §3. |
| `contains_delta_syntax` | The view uses delta bounds, so incremental runs are genuinely bounded. |

Duration is derivable from `metadata` as `ended_at − created_at`. Use it
as your calibration anchor — but remember you cannot see which pool the
run used (jobs do not expose `compute_pool_id` through MCP), so a
duration alone is only half a data point. Ask the user for the pool.

---

## 2. `merge: true`

Shuffle-partition coalescing does a poor job on `MERGE` statements. The
practical consequence is that a merging job adds a large number of files
on every run, and that accumulation puts pressure on the **driver**.

So `merge: true` argues for two things at once:

- A step up in size, because the merge itself shuffles heavily.
- A `_storage` variant, because the shuffle needs scratch space.

It also makes the job a candidate for the small-file diagnosis in §4 —
check the file count before assuming size is the answer.

---

## 3. Reading `compiled_select`

Shuffle is what actually drives disk consumption and wall-clock time.
Scan the compiled SQL for:

| Pattern | Implication |
| --- | --- |
| `JOIN`, especially three or more | Shuffle proportional to both sides. The dominant cost in most slow MVs. |
| `GROUP BY` on a high-cardinality key | Large shuffle; risk of skew (§5). |
| `DISTINCT` / `COUNT(DISTINCT ...)` | Full shuffle. An approximate-distinct rewrite is often a better fix than a bigger pool. |
| Window functions with wide partitions | Shuffle plus per-partition memory pressure. |
| `NAMED_STRUCT` nesting | Wide rows; pushes the in-memory expansion factor toward the high end of the 3–10x range. |

If the query itself is the problem — an accidental cross join, a
`DISTINCT` that isn't needed — say so and hand off to `/write-nql`.
Sizing around a broken query is the expensive way to fix it.

---

## 4. File count and driver pressure

Compare `active_dataset_stored_files` against
`active_dataset_stored_bytes`. Tens of thousands of files for a few GB
is a **small-file explosion**.

This pressures the **driver**, not the executors. The driver holds file
metadata and plans the scan; a bigger pool adds executor capacity and
does nothing for it. Symptoms are long delays before any task starts,
or driver OOM.

**The fix is compaction, not a bigger pool.** Flag it as a distinct
diagnosis and say plainly that a resize will not help. Daily `MERGE`
jobs (§2) are the usual source.

---

## 5. Shuffle skew

`narrative_dataset_get_column_stats(dataset_id=...)` returns per-column
approximate distinct counts. High cardinality on a join key or `GROUP
BY` key predicts **skew** — one task receives a disproportionate share
of rows and runs long after the others finish.

Keep `histogram` **out** of the `include` list; it blows the response cap
on wide columns.

The signature of skew is a job whose duration doesn't improve when you
size up, because the bottleneck is one task, not total capacity. If a
user reports "I doubled the pool and it took the same time," suspect
skew rather than recommending another step up.

---

## 6. Symptom to fix

| Symptom | Binding resource | Fix |
| --- | --- | --- |
| `No space left on device` | Disk | Sideways to the same size's `_storage` variant. Only step up if `_storage` still fails. |
| Executor OOM | Memory | Step up a size — and remember `small`/`medium` are not a step up from `x_small`. |
| Driver OOM, or long delay before tasks start | Driver | Compaction (§4). A resize will not help. |
| Jobs hang waiting for executors on `medium` | Executor placement | Go to `large`. See EMR_SIZING §2. |
| Stuck in `Pending`, no error | Cluster availability | The in-flight cluster cap. Not a sizing problem; the shared pool is the workaround. |
| Job cancelled near the 1-hour mark on the shared pool | Execution timeout | Move to a private pool. The cap is invisible via MCP. |
| Job cancelled near the 4-hour mark | Execution timeout | Raise `job_execution_timeout_seconds`, or reduce the work. Not necessarily a size problem. |
| Slow, no error, doesn't improve when sized up | Skew (§5) or query shape (§3) | Investigate the query; don't keep stepping up. |
| Slow, no error, improves when sized up | Total capacity | Keep stepping — you're on the right axis. |
| First run slow, later runs fast | Cold start | 5–10 minutes on a private pool. Expected, not a defect. |

The two rows worth internalizing: **disk symptoms go sideways**, and
**"doesn't improve when sized up" means stop sizing up.**
