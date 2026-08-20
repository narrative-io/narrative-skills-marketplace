# Edge cases and gotchas

Full prose for the traps flagged in the skill body. Grouped by where they
bite.

---

## Citing numbers you didn't read

### The whole class of error

The user sees what the MCP server returns and nothing more. So a
recommendation resting on a figure that isn't in a tool response — bytes on
an access rule, memory or disk used by a past run, the volume a query scans,
the cause of a failure — can't be checked, can't be corrected, and sounds
more certain than anything you actually know.

Before handing over a recommendation, check every number in it against
[`EVIDENCE.md`](EVIDENCE.md). If it isn't sourced there or quoted from the
user, cut it or label it an assumption. This is the most common way this
skill goes wrong, and the least visible.

### Naming a failure cause the platform didn't report

`failures[].message` is an exception message, often generic — `executing
cluster '<id>' failed` says nothing about which resource ran short. There is
**no structured out-of-disk or out-of-memory signal in the API**.

So "it ran out of disk" is a claim you almost never have grounds for. Quote
the text you got, reason from it as far as it goes, and if it doesn't reach a
cause say so. "It failed and the message doesn't say why" is a legitimate
finding, and the right response is headroom plus a request for the next
failure — not a diagnosis.

### Presenting an absent stats block as a small dataset

`stats` renders `_not set_` on a dataset with no stats. That is missing data,
not a small dataset, and sizing it as small is how a big first build lands on
`x_small`. Say the stats are missing, ask for an approximate row count, or
point the user at `/profile-dataset`.

### Reading `*_bytes: 0` as an empty dataset

Observed in the wild: a dataset reporting 261 records with
`active_dataset_stored_bytes: 0` and `active_dataset_stored_files: 0`. The
rows exist; the bytes just aren't measured, which happens where the data
isn't stored as files Narrative counts — a Snowflake-backed dataset, for one.

A byte-keyed recommendation lands at the bottom of the ladder here and looks
perfectly reasonable doing it, because nothing marks the zero as missing.
This is the concrete reason the bands are keyed on rows. If bytes are `0` and
records aren't, size on records and say the byte figure was unavailable.

### Sizing an access-rule read off the rule

Access rules carry no stats of any kind. Their `schema`, `mappings`, and
`pricing` describe shape and terms, not volume, and none of them supports a
row estimate. Follow `dataset_ids` to real datasets, or ask. See
[`EVIDENCE.md`](EVIDENCE.md) §3.

---

## Reading the data-plane payload

### `include` omitted, so no pools appear

`narrative_data_planes_list` and `narrative_data_planes_describe` both
default to `include=["metadata"]`. Without an explicit
`include=["metadata","compute_pools","platform"]` you get no pools and no
provider type, and the natural — wrong — conclusion is that the plane has no
pools. Always pass `include`.

### The `compute_pools` section is absent

When a plane has no pools, the section is **omitted entirely** rather than
rendered as an empty list. Absence therefore means one of two things: the
plane genuinely has no pools, or you forgot `include`. Check which before
reporting. A plane with no pools is a real state, not an API failure, and the
right recommendation is which pool to create.

### A pool's name contradicts its size

Pool names are free text and are not kept in sync with the `size` field. A
pool named `x_small_default` can be `size: medium`. Always read `size`;
never parse the name.

This is why recommendations must cite the pool **id**. Include the name as a
courtesy so the user can find it in the UI, but the id is the identity.

### Asking which pool things run on today

`metadata.default_compute_pool_id` is on the plane payload. Jobs that don't
name a pool land there. Read it rather than spending a question on it — and
if the user's job *does* name one, that's what Phase 5's pool question is
for.

### An unrecognized `platform.type`

If `platform.type` is not one of the AWS or Snowflake values, report the
literal string and ask the user how to treat it. Do not default to the AWS
ladder — the provider types have almost nothing in common, and a wrong
branch produces confidently wrong sizing.

---

## Reading dataset stats

### `column_stats_config` fails the whole call

Adding `column_stats_config` to `narrative_datasets_describe`'s `include`
list returns **404 on any dataset with no stats configuration**, and the 404
fails the entire request rather than omitting that one section. You lose the
stats, schema, and view definition you actually needed. Never include it
speculatively.

### Total rows used to size an incremental refresh

The most common over-recommendation in this skill. If
`refresh_schedule_config` is set and the job's `first_run` is `false`, the
workload processes `last_snapshot_added_records`, not
`active_dataset_stored_records` — often orders of magnitude less. Sizing an
incremental refresh against the total can easily land three rungs too high.

### The last snapshot used where the largest was needed

The inverse error. One snapshot is one sample. Sizing on the most recent
delta when recent deltas swing by multiples is how you pick something that
fits this month and fails next. Read several and size for the high end.

### `est_total_*` mistaken for `active_*`

`est_total_dataset_stored_records` counts data superseded by later snapshots
too, so it's larger than `active_dataset_stored_records` and it isn't what a
job reads. Prefer `active_*`.

### Row count treated as the whole story

Rows set the band; the query decides where in the band you land. A hundred
million rows through a single filter and a hundred million rows through a
three-way join with a billion-distinct group key are different jobs. Always
read the NQL, and get `approx_count_distinct` on the keys it acts on.

### High file count relative to rows

Tens of thousands of files holding a few million rows means fragmented data,
and the cost lands in planning and opening files rather than in processing
rows. A bigger pool does not help. Recommend compaction and say explicitly
that a resize is the wrong fix. See [`DIAGNOSTICS.md`](DIAGNOSTICS.md) §4.

### Column stats absent read as zero

Column stats exist only where they've been configured. An empty response
means "not computed," not "no distinct values." The `schema`'s per-property
`approximate_cardinality` is the weaker fallback; if neither is there, the
cardinality argument is unavailable and the recommendation should say so.

### Quoting a precise in-memory expansion factor

The ratio between compressed bytes and working memory varies by an order of
magnitude across datasets. Quoting "assume 5x" dresses a guess up as
arithmetic. Size from rows and query shape; use bytes ÷ rows only to compare
row width *between* datasets in the same query, which is a relative
comparison you actually measured.

---

## Reading job history

### Jobs do not expose which pool they ran on

Verified absent from `metadata`, `input`, and `tags`. You therefore **cannot**
correlate "this job took 22 minutes" with "…on a `medium` pool" from MCP
alone, which breaks the most valuable available heuristic — calibrating
against the user's own history.

Three responses, in order of preference:

1. Ask the user which pool the run used. This is why the interview asks it.
2. If they don't know, the plane's `default_compute_pool_id` is the likely
   answer. Say you're assuming it.
3. Do **not** infer the pool from the resolution chain and present it as
   fact. The chain cannot see per-job overrides, so the inference is wrong
   exactly when it matters.

### Elapsed time read as execution time

`ended_at − created_at` spans submission to finish: queue wait, cluster
launch, and the work, undifferentiated. MCP does not expose when execution
began. On a cold private pool, 5–10 of those minutes bought nothing, and a
bigger pool shortens none of them.

Say "took 22 minutes end to end," and use the warm/cold pair to separate the
parts when the history supports it. A resize sold on a number that was mostly
launch overhead is money spent on the wrong thing.

### `jobs_search(dataset_id=...)` misses read-from-source workloads

`dataset_id` matches jobs whose `input` references that id. A
`materialize-view` job's input carries the dataset it **writes** — so
searching by the *source* dataset of a planned build returns nothing
relevant, even when the company has a rich history of exactly the job shape
you need.

This bites precisely on one of the skill's own triggers: "I'm about to build
a big MV — what should it run on?" The source id is structurally the wrong
key there.

Search `data_plane_id` plus `type` instead:

```
narrative_jobs_search(data_plane_id=<dpId>, type="materialize-view",
  per_page=10)
```

Do not conclude "no history, uncalibrated" until **both** searches come back
empty. Declaring the recommendation uncalibrated when the calibrating runs
were one call away is the expensive version of this mistake.

### No job history at all

A dataset that has never been built has no durations to calibrate against —
but confirm that with both searches above before you say it. Then say the
recommendation is uncalibrated, lean on the row counts, query shape, and the
interview, and make the escalation path prominent. One real run is worth more
than any refinement of the guess.

---

## Batch and hand-over

### Launch overhead × job count ignored on a batch

Sizing a fan-out the way you'd size one job is the most expensive mistake
available here, because it charges real money for a change that recovers less
than a free one would.

A pool runs one job at a time in submission order, so a batch of N jobs costs
`N × per-job duration` plus one cluster launch per boot. At ~6 minutes a
launch, 100 jobs that each start fresh burn ~10 hours in startup — routinely
more than the total compute, and more than any rung on the ladder can
recover. Delete that first by submitting back-to-back and raising
`idle_timeout_seconds` to cover gaps between waves; only then consider size.

The inverse error also exists: because execution is serial, a wider pool
genuinely can lower *total* cost on a batch (cost is rate × time). Don't
reflexively refuse a size step on a batch in the name of thrift — do the
arithmetic.

### Recommending a create without checking `manage_compute_pools`

Creating or editing a pool needs the `manage_compute_pools` permission on the
data plane collaborator. A user without it can see the pool list and will hit
a wall at the save button.

Say up front that applying the change may need whoever administers the
account. Pool creation may additionally be gated on the company's credit
limit — a refusal there is a billing decision, not a sizing error, so do not
respond by recommending a smaller size.

---

## Pool constraints

### `job_execution_timeout_seconds` is not in the MCP payload

The field most likely to kill a long job is not readable through MCP. Do not
assume the 4-hour default — report it as unknown. If a job is failing at a
suspiciously round elapsed time, the timeout is the first thing to suspect,
and the arithmetic is something you *can* do from `created_at` and `ended_at`.

### The shared pool's 1-hour cap

The shared always-on pool caps job execution at one hour, well below the
4-hour default, and the cap is invisible to the user. A job that exceeds it
is cancelled and marked failed with no obvious cause. If a duration estimate
is anywhere near an hour, rule the shared pool out and say the estimate is
the weak link in the recommendation.

### The shared pool returns a permission error

The shared pool carries a collaborator access list, and some companies are
outside it. A permission error on use means "not available to you," not
"broken." Fall through to the private path without treating it as a fault.

### `small` or `medium` proposed as a step up from `x_small`

All three sizes give the job the same usable capacity, because every pool
reserves one node to coordinate the work. The step is a no-op at the same
cost. `large` is the first genuine increase. See
[`POOL_SIZES.md`](POOL_SIZES.md) §2.

Treat this as settled. It is not a guess to hedge or re-derive — if a
recommendation lands on `small` or `medium`, the recommendation is wrong.

### A resize silently resets timeouts

On update, a pool's provider block is replaced **wholesale, not merged**. A
size-only change that omits `idle_timeout_seconds` and
`job_execution_timeout_seconds` resets both to defaults (15 min / 4 h). If
the user has custom timeouts, tell them to re-send those fields in the same
call — otherwise a resize intended to fix one problem creates another.

### Always-on above `large`

Autoscaling pools sit at their minimum when idle and expand under load, so an
idle large pool still charges its floor continuously. Recommending
`always_on` above `large` commits the user to a standing cost for as long as
the pool exists. Always say this out loud; never let it be a surprise.

### A long wait in `pending` with no error

A global cap on simultaneously running clusters means a job can sit in
`pending` for a long time with no error message, allocated round-robin by
longest wait. This is documented behavior, not a hang, and it is not a sizing
problem — recommend no resize. The always-on pool is the workaround, since it
already has a running cluster and never waits for a slot.

Note the ordinary case first, though: several minutes of `pending` is routine
assignment-plus-launch latency, not the cap binding. Only reach for this
explanation once the wait is well past what this job type normally takes on
this plane.

---

## Recommendation hygiene

### Do not quote dollar figures

Pricing is per-size and set outside this skill. Report relative multipliers
from [`POOL_SIZES.md`](POOL_SIZES.md) §3 instead. A quoted rate reads as a
commitment this skill cannot make.

### Do not present estimates as measurements

The starting bands are calibration parameters, not measured truth. State the
assumption, give the confidence level, and name what one real run would
settle. A confident wrong number is worse than an honest range.

### Do not act

This skill is advice-only. It names a pool and a resolution level; the user
applies the change. Pool creation and resizing cost real money and may be
gated on account limits. If the user asks the skill to make the change,
decline and hand them the exact settings to apply.

The one thing it may run is an `EXPLAIN` forecast, and only after asking. A
forecast is not a resize and not a real job, but it does queue work on the
user's plane — so it is a request, not a courtesy you extend silently.

### Treating the forecast as required

`EXPLAIN` is the best evidence available, not a precondition. If the user
declines it, or it errors, or the forecast job fails, the recommendation
still has to land from row counts and query shape. Say the forecast was
unavailable and carry on; don't retry it in a loop, and don't stall waiting
for a number you were never guaranteed.

### Reading `cost` as compute cost

The forecast pairs the row count with a **data-acquisition** figure — what
buying those rows would cost. Measured `0` on a company's own data. It is not
what running the job costs, and quoting it as such conflates a data bill with
a compute bill. Report `rows`; leave `cost` out of a sizing recommendation.

### Reading the forecast result as flat

The payload nests three levels:
`success.result.Forecast.rows`. A `result.rows` lookup finds nothing and reads
as "the forecast returned no data" when it actually succeeded.

### Submitting a forecast without pinning a pool

Measured on the same query and plane: pinned to an always-on pool it completed
in 1m30s; unpinned it took 6m56s, spending most of that waiting to be
assigned and then launching a cluster. Always pass `compute_pool_id` and
prefer the always-on pool — a forecast is exactly the small,
someone's-waiting job it exists for.

### Calling a `pending` job stuck

The unpinned forecast above sat at `pending` with `updated_at` frozen at
`created_at` for about six minutes, and then completed normally. A frozen
timestamp means "not assigned yet," not "abandoned."

Normal assignment-plus-launch on a cold pool is around 8 minutes, which is
indistinguishable from a hang if you look once. Poll again, and check what
this job type normally takes on this plane via `jobs_search`, before you
report a job as stuck or recommend anything on the strength of it.
