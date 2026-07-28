# Edge cases and gotchas

Full prose for the one-line cheat sheet in the skill body. Grouped by
where they bite.

---

## Reading the data-plane payload

### `include` omitted, so no pools appear

`narrative_data_planes_list` and `narrative_data_planes_describe` both
default to `include=["metadata"]`. Without an explicit
`include=["compute_pools","platform"]` you get no pools and no provider
type, and the natural — wrong — conclusion is that the plane has no
pools. Always pass `include`.

### The `compute_pools` section is absent

When a plane has no pools, the section is **omitted entirely** rather
than rendered as an empty list. Absence therefore means one of two
things: the plane genuinely has no pools, or you forgot `include`.
Check which before reporting. A plane with no pools is a real state, not
an API failure, and the right recommendation is which pool to create.

### A pool's name contradicts its size

Pool names are free text and are not kept in sync with the `size` field.
A pool named `x_small_default` can be `size: medium`. Always read
`size`; never parse the name.

This is why recommendations must cite the pool **id**. Include the name
as a courtesy so the user can find it in the UI, but the id is the
identity.

### An unrecognized `platform.type`

If `platform.type` is not one of the AWS or Snowflake values, report the
literal string and ask the user how to treat it. Do not default to the
AWS ladder — the provider types have almost nothing in common, and a
wrong branch produces confidently wrong sizing.

---

## Reading dataset stats

### `column_stats_config` fails the whole call

Adding `column_stats_config` to `narrative_datasets_describe`'s
`include` list returns **404 on any dataset with no stats
configuration**, and the 404 fails the entire request rather than
omitting that one section. You lose the stats, schema, and view
definition you actually needed. Never include it speculatively.

### Total bytes used to size an incremental refresh

The most common over-recommendation in this skill. If
`refresh_schedule_config` is set and the job's `first_run` is `false`,
the workload processes `last_snapshot_added_bytes`, not
`active_dataset_stored_bytes` — often orders of magnitude less. Sizing an
incremental refresh against the total can easily land three rungs too
high.

### High file count relative to bytes

Tens of thousands of files for a few GB is a small-file explosion, and
it pressures the driver rather than the executors. A bigger pool does
not help. Recommend compaction and say explicitly that a resize is the
wrong fix. See [`DIAGNOSTICS.md`](DIAGNOSTICS.md) §4.

### Stats are stale or missing

The byte counts are estimates maintained alongside the dataset. If they
look implausible against the user's description, say so and ask rather
than sizing against a number you don't believe. `/profile-dataset` owns
stats freshness and recovery.

---

## Reading job history

### Jobs do not expose `compute_pool_id`

Verified absent from `metadata`, `input`, and `tags`. You therefore
**cannot** correlate "this job took 7 minutes" with "…on a `medium`
pool" from MCP alone, which breaks the most valuable available
heuristic — calibrating against the user's own history.

Three responses, in order of preference:

1. Ask the user which pool the run used. This is why the interview asks
   it explicitly.
2. If they don't know, treat the duration as uncalibrated and say the
   recommendation rests on the byte estimate alone.
3. Do **not** infer the pool from the resolution chain and present it as
   fact. The chain cannot see per-job overrides, so the inference is
   wrong exactly when it matters.

### `jobs_search(dataset_id=...)` misses read-from-source workloads

`dataset_id` matches jobs whose `input` references that id. A
`materialize-view` job's input carries the dataset it **writes** — so
searching by the *source* dataset of a planned build returns nothing
relevant, even when the company has a rich history of exactly the job
shape you need.

This bites precisely on one of the skill's own triggers: "I'm about to
build a big MV — what should it run on?" The source id is structurally
the wrong key there.

Search `data_plane_id` plus `type` instead:

```
narrative_jobs_search(data_plane_id=<dpId>, type="materialize-view",
  per_page=10)
```

Do not conclude "no history, uncalibrated" until **both** searches come
back empty. Declaring the recommendation uncalibrated when the
calibrating runs were one call away is the expensive version of this
mistake.

### No job history at all

A dataset that has never been built has no durations to calibrate
against — but confirm that with both searches above before you say it.
Then say the recommendation is uncalibrated, lean on the byte estimate
and the interview, and make the escalation path prominent — one real run
is worth more than any refinement of the guess.

---

## Batch and hand-over

### Cold start × job count ignored on a batch

Sizing a fan-out the way you'd size one job is the most expensive mistake
available here, because it charges real money for a change that recovers
less than a free one would.

Steps on a pool run FIFO at concurrency 1, so a batch of N jobs costs
`N × per-job duration` plus one cold start per cluster boot. At ~6 minutes
a boot, 100 jobs that each boot fresh burn ~10 hours in cluster startup —
routinely more than the total compute, and more than any rung on the
ladder can recover. Delete that first by submitting back-to-back and
raising `idle_timeout_seconds` to cover gaps between waves; only then
consider size.

The inverse error also exists: because execution is serial, a wider pool
genuinely can lower *total* cost on a batch (cost is rate × time). Don't
reflexively refuse a size step on a batch in the name of thrift — do the
arithmetic.

### Recommending a create without checking `manage_compute_pools`

Creating or editing a pool needs the `manage_compute_pools` permission on
the data plane collaborator. A user without it can see the pool list and
will hit a wall at the save button.

Say up front that applying the change may need whoever administers the
account. Pool creation may additionally be gated on the company's credit
limit — a refusal there is a billing decision, not a sizing error, so do
not respond by recommending a smaller size.

---

## Pool constraints

### `job_execution_timeout_seconds` is not in the MCP payload

The field most likely to kill a job is not readable through MCP. Do not
assume the 4-hour default — report it as unknown. If a job is failing at
a suspiciously round elapsed time, the timeout is the first thing to
suspect.

### The shared pool's 1-hour cap

The shared always-on pool caps job execution at one hour, well below the
4-hour default, and the cap is invisible to the user. A job that exceeds
it is cancelled and marked failed with no obvious cause. If a duration
estimate is anywhere near an hour, rule the shared pool out and say the
estimate is the weak link in the recommendation.

### The shared pool returns a permission error

The shared pool carries a collaborator access list, and some companies
are outside it. A permission error on use means "not available to you,"
not "broken." Fall through to the private path without treating it as a
fault.

### `small` or `medium` proposed as a step up from `x_small`

All three tiers deliver the same executor capacity, because one node is
always reserved for the Spark driver. The step is a no-op at the same
cost. `large` is the first genuine increase. See
[`EMR_SIZING.md`](EMR_SIZING.md) §2.

Treat this as settled. It is not a guess to hedge or re-derive — if a
recommendation lands on `small` or `medium`, the recommendation is wrong.

### A resize silently resets timeouts

On update, a pool's provider block is replaced **wholesale, not merged**.
A size-only change that omits `idle_timeout_seconds` and
`job_execution_timeout_seconds` resets both to defaults (15 min / 4 h).
If the user has custom timeouts, tell them to re-send those fields in the
same call — otherwise a resize intended to fix one problem creates
another.

### Always-on above `large`

Managed-scaling pools boot at their minimum and expand under load, so an
idle large pool still charges its floor continuously. Recommending
`always_on` above `large` commits the user to a standing cost for as long
as the pool exists. Always say this out loud; never let it be a surprise.

### Stuck in `Pending` with no error

A global cap on simultaneously running clusters means jobs can sit in
`Pending` indefinitely with no error message, allocated round-robin by
longest wait. This is documented behavior, not a hang, and it is not a
sizing problem — recommend no resize. The shared always-on pool is the
workaround, since it already has a running cluster and never waits for a
slot.

---

## Recommendation hygiene

### Do not quote dollar figures

Pricing is per-size and set outside this skill. Report relative
multipliers from [`EMR_SIZING.md`](EMR_SIZING.md) §3 instead. A quoted
rate reads as a commitment this skill cannot make.

### Do not present estimates as measurements

The in-memory expansion factor (3–10x) and the starting ladder are
calibration parameters, not measured truth. State the assumption, give
the confidence level, and name what one real run would settle. A
confident wrong number is worse than an honest range.

### Do not act

This skill is advice-only. It names a pool and a resolution level; the
user applies the change. Pool creation and resizing cost real money and
may be gated on account limits. If the user asks the skill to make the
change, decline and hand them the exact call to run.
