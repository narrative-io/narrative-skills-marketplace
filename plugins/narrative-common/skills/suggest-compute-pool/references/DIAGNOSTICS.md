# Diagnosing what a job actually needs

Read this in Phase 4 when interpreting job history, and in Phase 8 when
turning a symptom into a fix. The core idea: **only some of the possible
answers are "a bigger pool,"** and the platform tells you less about which
than you'd like.

The discipline that matters here: **diagnose from signals you can observe.**
Elapsed times, row counts, cardinality, file counts, job state, and the
job's own input flags are all real. A named failure cause usually is not —
see [`EVIDENCE.md`](EVIDENCE.md) §4 — so when you can't tell which resource
ran short, say that and size for headroom rather than inventing a cause.

---

## 1. Reading a `materialize-view` job's `input`

`narrative_jobs_describe(..., include=["metadata","input","compiled_sql","failures"])`
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
| `first_run: true` | A full build. Size against `active_dataset_stored_records`. |
| `first_run: false` | Incremental. Size against `last_snapshot_added_records` — often orders of magnitude smaller. |
| `merge: true` | The expensive merge path. Argues for both a larger pool and a `_storage` variant. See §2. |
| `partitions` | If set, the partitioning in play; uneven partitions predict skew (§5). |
| `compiled_select` | The real cost driver. Read it — see §3. |
| `contains_delta_syntax` | The view uses delta bounds, so incremental runs are genuinely bounded. |

Elapsed time comes from `metadata` as `ended_at − created_at`, which spans
submission to finish — queue wait and cluster launch included. Use it as
your calibration anchor, but remember you cannot see which pool the run used,
so a duration alone is only half a data point. Ask the user for the pool.

---

## 2. `merge: true`

The merge path handles row-level updates rather than appending, and it adds a
large number of small files on every run. That accumulation is a real cost,
and it compounds across scheduled runs.

So `merge: true` argues for two things at once:

- A step up in size, because the merge itself does heavy regrouping.
- A `_storage` variant, because that regrouping needs scratch space.

It also makes the job a candidate for the file-count diagnosis in §4 — check
the file count before assuming size is the answer.

---

## 3. Reading the query

Sorting and regrouping rows across the cluster is what drives wall-clock
time and scratch space. Read the `compiled_select`, the dataset's `nql`, or
the query the user pasted, and look for:

| Pattern | Implication |
| --- | --- |
| `JOIN`, especially three or more | Work proportional to both sides of each join. The dominant cost in most slow MVs. |
| `GROUP BY` on a high-cardinality key | Large regroup, and a risk of skew (§5). Check `approx_count_distinct` on that column. |
| `DISTINCT` / `COUNT(DISTINCT ...)` | A full regroup. An approximate-distinct rewrite is often a better fix than a bigger pool. |
| Window functions over wide partitions | Regrouping plus per-partition memory pressure. |
| Deeply nested struct output | Wide rows. Cross-check with bytes ÷ rows. |

**Always pair the pattern with the cardinality of the column it acts on.**
A `GROUP BY` over 100 distinct values is cheap at any row count; the same
`GROUP BY` over a billion distinct values is the expensive thing on the
plane. `narrative_dataset_get_column_stats(dataset_id=..., columns=[...])`
gives you `approx_count_distinct` for exactly the keys you found. Pattern
without cardinality is half an argument.

If the query itself is the problem — an accidental cross join, a `DISTINCT`
that isn't needed — say so and hand off to `/write-nql`. Sizing around a
broken query is the expensive way to fix it.

---

## 4. File count

Compare `active_dataset_stored_files` against
`active_dataset_stored_records`. Tens of thousands of files holding a few
million rows means the data is fragmented into many tiny files.

This costs time in planning and opening files rather than in processing
rows, so **adding capacity does not help.** Symptoms are a long delay before
the job appears to do anything, and a duration that doesn't improve with a
bigger pool.

**The fix is compaction, not a bigger pool.** Flag it as a distinct
diagnosis and say plainly that a resize will not help. Scheduled `merge`
jobs (§2) are the usual source.

---

## 5. Skew — measure it, don't infer it

**The histogram measures skew directly, before anything runs.** This is the
most underused evidence in the skill:

```
narrative_dataset_get_column_stats(dataset_id=<id>,
  columns=["<the join or group key>"],
  include=["basic_column_stats","histogram"], histogram_bin_limit=10)
```

Each bin comes back with `absolute` and `ratio`. The top bin's `ratio` is the
share of the table sitting on one key value — measured example: a `STATE`
column where `NV` held `0.3377`, a third of the rows. Group or join on that
and one slice of work is three times the others, and no amount of extra
capacity evens it out.

`histogram_bin_limit` returns top-N by frequency, which is exactly what you
want here and what makes the call safe on a high-cardinality column. Filter
`columns` to the keys the query actually acts on.

Two more shapes from the same response predict trouble:

- **Very high `approx_count_distinct`** — a large regroup, and more chances
  for one slice to be far bigger than the rest.
- **Low `completeness`** — a key that's mostly empty collapses those rows
  onto a single value, which is skew in its purest form. Cross-check against
  `null_value_count`.

The after-the-fact signature of skew is a job whose duration doesn't improve
when you size up, because the bottleneck is one oversized slice rather than
total capacity. If a user reports "I doubled the pool and it took the same
time," suspect skew — and then go read the histogram, which would have told
you in advance.

---

## 6. Symptom to fix

Every row here keys on something you can actually observe.

| Symptom | What's binding | Fix |
| --- | --- | --- |
| `pending` for a few minutes, `updated_at` frozen | Nothing yet — it's waiting to be assigned | **Not a diagnosis.** Normal assignment-plus-launch is around 8 minutes on a cold pool. Poll again before concluding anything. See §8. |
| `pending` far beyond this job type's normal time on this plane | Cluster availability | The in-flight cluster cap. Not a sizing problem; the always-on pool is the workaround. |
| Jobs hang rather than run slowly on a `medium` pool | Coordination consumed both nodes | Go to `large`. See [`POOL_SIZES.md`](POOL_SIZES.md) §2. |
| Long delay before anything happens, high file count | File planning, not capacity | Compaction (§4). A resize will not help. |
| Slow, and doesn't improve when sized up | Skew (§5) or query shape (§3) | Investigate the query and the key cardinality; don't keep stepping up. |
| Slow, and improves when sized up | Total capacity | Keep stepping — you're on the right axis. |
| Heavy joins or high-cardinality `GROUP BY` over many rows | Scratch space | Try the `_storage` variant at the same size before stepping up. |
| First run slow, later runs fast | Cluster launch | About 8 minutes on a private pool. Expected, not a defect. |
| Cancelled near the 1-hour mark on the shared pool | Execution timeout | Move to a private pool. The cap is invisible via MCP. |
| Cancelled near the 4-hour mark | Execution timeout | Raise `job_execution_timeout_seconds`, or reduce the work. Not necessarily a size problem. |
| Failed, and the message doesn't say why | Unknown | A legitimate finding. Size for headroom and say the cause is unreported — do not name one. |

Three rows worth internalizing: **"doesn't improve when sized up" means stop
sizing up**; **`Pending` is not a sizing problem**; and **an unexplained
failure stays unexplained.** Two of the three call for something other than
a bigger pool.

---

## 7. Working out the elapsed-time budget

When a user says "this took two hours and that's too long," break the two
hours into the parts you can account for before recommending anything:

1. **Queue wait.** Invisible directly, but `state` history and the
   in-flight cap make it plausible. If other jobs were running, some of the
   two hours may be wait.
2. **Cluster launch.** About 8 minutes on a private pool, zero on the shared
   always-on pool. Fixed regardless of size.
3. **The work itself.** What's left. This is the only part a bigger pool
   shortens.

A bigger pool is a good answer when part 3 dominates. When parts 1 and 2 do,
the answer is scheduling — submit back-to-back, raise
`idle_timeout_seconds`, or use the always-on pool — and a resize spends money
on the wrong thing. The warm/cold pair in Phase 4 is how you tell them
apart from data rather than assumption.

**How big parts 1 and 2 really are.** On a live Narrative-managed plane, the
recurring `datasets_calculate_column_stats` job — trivial work over a handful
of small datasets — took **6m44s, 8m05s, 7m14s, and 6m38s** end to end across
four consecutive daily runs. Nothing about that workload justifies seven
minutes; it is almost entirely queue and launch. Meanwhile
`model_inference_run` jobs on the same plane finished in **7–13 seconds**,
because they don't need a cluster at all.

Keep that spread in mind before you read a slow job as an undersized pool. If
a job's total is in the 6–8 minute range and the work is small, you're
looking at launch overhead, and no rung on the ladder touches it.

---

## 8. Don't call a job stuck

`pending` with `updated_at` still equal to `created_at` looks alarming and
usually isn't. Measured on a live Narrative-managed plane: an unpinned
forecast sat exactly like that for about six minutes, then got assigned,
launched a cluster, and completed at 6m56s. The same query pinned to the
always-on pool finished in 1m30s.

So the frozen timestamp means "not assigned yet." It does not mean abandoned,
and it does not mean the plane is misconfigured — that plane had no
`default_compute_pool_id` and the job still resolved a pool on its own.

Two rules follow:

- **Poll again before drawing a conclusion.** One observation cannot tell
  "waiting its turn" from "hung," because normal assignment-plus-launch on a
  cold pool lands in the same 6–8 minute window as a genuine problem.
- **Calibrate against this plane's own history.** `jobs_search` by
  `data_plane_id` and `type` shows what this job type normally takes. On the
  plane above, routine `datasets_calculate_column_stats` runs took 6m38s–8m05s
  as a matter of course. A job at seven minutes there is unremarkable.

The recommendation that follows from a slow start is almost never a resize.
It's the always-on pool, or pinning a pool, or submitting back-to-back — see
§7.
