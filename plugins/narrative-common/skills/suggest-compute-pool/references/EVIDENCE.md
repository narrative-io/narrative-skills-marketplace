# What you can actually see

The user is working through the Narrative MCP server. If a value doesn't
come back from one of these tools, neither of you can see it, and a
recommendation resting on it can't be checked or corrected.

This reference is the inventory: per entity, the fields that exist, and the
ones people assume exist and don't. Check your output against it before you
hand anything over. **Any figure that isn't sourced here or quoted from the
user should not be in the recommendation.**

---

## 1. Datasets — the main source of numbers

```
narrative_datasets_describe(dataset_ids=[<ids>],
  include=["metadata","stats","nql","schema","refresh_schedule_config"])
```

Up to 50 ids per call, so a query touching several datasets costs one call.

### `stats`

The scale numbers. Fields worth reading:

| Field | Meaning |
| --- | --- |
| `active_dataset_stored_records` | Rows currently in the dataset. **The primary sizing input for a full build.** |
| `active_dataset_stored_bytes` | On-disk size, compressed. |
| `active_dataset_stored_files` | Number of files. |
| `last_snapshot_added_records` | Rows added by the most recent write. **The sizing input for an incremental refresh.** |
| `last_snapshot_added_bytes` | Bytes added by the most recent write. |
| `last_snapshot_deleted_records` / `last_snapshot_removed_bytes` | What the last write removed. |
| `est_total_dataset_stored_*` | Totals including data superseded by later snapshots — larger than `active_*`, and not what a job reads. Prefer `active_*`. |

**Lead with rows, not bytes.** Rows are the figure the user can check
against their own understanding of the data, and the bands in
[`POOL_SIZES.md`](POOL_SIZES.md) §3b are keyed on them. Bytes are a useful
cross-check and the only way to spot unusually wide rows — divide bytes by
rows and compare against the other datasets in the same query.

**Bytes and files can be `0` on a dataset that has rows.** This is real and
observed: a dataset reporting `active_dataset_stored_records: 261` alongside
`active_dataset_stored_bytes: 0` and `active_dataset_stored_files: 0`. It
happens where the rows aren't stored as files Narrative measures — a
Snowflake-backed dataset, for instance. So a zero in those fields means "not
reported," never "empty."

This is the concrete reason to size on rows. A byte-keyed recommendation
silently lands at the bottom of the ladder on exactly these datasets, and
nothing in the payload flags it as missing. If bytes are `0` and records are
not, use records and say the byte figure was unavailable.

**The whole section can be absent.** It renders as `_not set_` on a dataset
with no stats at all. That is a gap to state, not a zero.
`/profile-dataset` owns getting stats populated.

### `schema`

Column count and nesting depth — how wide a row is. Individual properties
may carry `approximate_cardinality`, which is a weaker version of what
column stats give you, but it's present on more datasets.

### `nql`

The view definition for an MV. This is what the job actually does; read it
rather than sizing on row counts alone.

### `refresh_schedule_config`

Whether and how often this runs unattended. Drives the always-on call and
tells you whether a failure waits for someone to notice.

### `column_stats_config` — do not request it

Adding it to `include` returns **404 on any dataset with no stats
configuration**, and the 404 fails the whole call, so you lose the stats,
schema, and NQL you actually wanted. Never include it speculatively.

---

## 2. Column stats — how hard the work is

```
narrative_dataset_get_column_stats(dataset_id=<id>,
  columns=["<join or group key>", ...],
  include=["basic_column_stats","histogram"], histogram_bin_limit=10)
```

**Request the histogram, always with `histogram_bin_limit` and a `columns`
filter.** The limit returns top-N bins by frequency, which is what makes it
safe on high-cardinality columns; without it the response can blow the cap.
Filtered to the two or three keys the query acts on, this is the cheapest
high-value evidence available.

The payload nests under `basic_statistics` and `advanced_statistics`:

| Field | Use |
| --- | --- |
| `advanced_statistics.histogram.values[…].ratio` | **The skew measurement, and the reason to request histograms.** Each bin carries `absolute` and `ratio`. If one value on a join or group key holds a large share of the table, that slice of work runs long no matter how wide the pool is. Measured example: a `STATE` column where `NV` held `ratio: 0.3377` — a third of the rows on one key. |
| `advanced_statistics.approx_count_distinct` | Cardinality — how much regrouping a job does. A `GROUP BY` over 100 distinct values is cheap at any row count; one over a billion is the expensive thing on the plane. |
| `advanced_statistics.completeness` | Fraction of rows where the column is populated. A key that's 20% populated joins very differently than one that's full, and collapses the empties onto one value. |
| `basic_statistics.value_count` | Rows for this column — an independent read on the dataset's row count. |
| `basic_statistics.column_store_bytes` | Per-column stored size. Compare across columns to find the wide ones; more actionable than a whole-dataset byte figure. |
| `basic_statistics.null_value_count` | Nulls, as a count rather than a ratio. |
| `basic_statistics.lower_bound` / `upper_bound` | Value range. |
| `advanced_statistics.count_distinct` | Exact cardinality where computed. Usually `null`. |
| `advanced_statistics.mean` / `standard_deviation` | Numeric distribution. Rarely relevant to sizing. |
| `advanced_statistics.observed_types` | Type distribution. Data quality, not sizing. |

**Stats exist only where they've been configured.** An empty response means
"not computed," not "zero distinct values." Say which it is.

**When they're missing, offer to turn them on.** Phrase it as an offer —
*"this dataset has no column stats, so I can't see cardinality or skew. Want
me to enable them and recalculate? It runs a job."*
`narrative_dataset_set_column_stats_config` and
`narrative_dataset_recalculate_statistics` do it on an explicit yes.
Recalculation consumes compute, so never do it silently. Measured cost on a
live plane: routine `datasets_calculate_column_stats` runs took 6m38s–8m05s.

If the user declines, size from row counts and query shape, and say the
cardinality and skew evidence was unavailable.

---

## 3. Access rules — no numbers at all

```
narrative_access_rules_describe(access_rule_ids=[<id>],
  include=["metadata","nql","schema","mappings","collaborators","pricing"])
```

What you get: `name`, `display_name`, `description`, `owning_company`,
`data_plane_id`, `type`, `status`, `tags`, **`dataset_ids`**, `created_at`,
`updated_at`, the rule's `nql`, its `schema`, its attribute `mappings`, its
`collaborators`, and its `pricing`.

**What you do not get: any stats whatsoever.** No row count, no byte count,
no file count, no cardinality. There is no stats facet on the access-rule
payload, and there is no other tool that reports one.

This is the single biggest gap in this skill, because a query reading
somebody else's data through a rule is exactly the case where you'd most
want to know the volume. Handle it in this order:

1. **Follow `dataset_ids`.** Call `narrative_datasets_describe` on them. If
   they resolve, you have real stats and the gap closes.
2. **Run an `EXPLAIN`** against the query that reads the rule (§6). It
   reaches across the rule where the stats tools can't, so this is the one
   case where the forecast is worth the job it submits. Ask first.
3. **If neither works** — normal when the rule exposes another company's
   data and the user would rather not run anything — say so, and ask what
   they expect the rule to return. Record it as their estimate.
4. **Never derive a count from the rule's `schema`, `mappings`, or
   `pricing`** and present it as measured. Those describe shape and terms,
   not volume.

The rule's `nql` is still worth reading: it tells you what filtering the
rule applies before your query ever sees the data.

---

## 4. Jobs — the only real durations you get

```
narrative_jobs_search(dataset_id=<id>, per_page=10)
narrative_jobs_search(data_plane_id=<dpId>, type="materialize-view", per_page=10)
narrative_jobs_describe(job_ids=[<ids>], include=["metadata","failures","result"])
narrative_jobs_describe(job_ids=[<one id>], include=["input"])
```

**`input` needs its own call, one job at a time.** It carries `compiled_select`
inline — 88 KB on a real materialize-view job — so `include=["input"]` for four
jobs blew the response cap. Never pair it with `compiled_sql` either; that field
is already inside `input`. `metadata`, `failures`, and `result` are small and
batch fine up to the 50-id limit.

### `metadata`

`type`, `state`, `created_at`, `updated_at`, `ended_at`. That is the whole
list.

**Elapsed time is `ended_at − created_at`, and that spans submission to
finish** — queue wait, cluster launch, and the work itself, undifferentiated.
MCP does not expose when execution actually began, so you cannot separate
them from one run. Report it as "took N minutes end to end," and remember
that on a cold private pool 5–10 of those minutes bought nothing.

Two runs of a similar job *can* separate them: if the faster one started
within `idle_timeout_seconds` of the previous job ending, it reused a running
cluster, and the difference measures launch overhead.

### `input`

On a `materialize-view` job, the sizing flags: `first_run`, `merge`,
`partitions`, `stats_enabled`, `contains_delta_syntax`, `compiled_select`.
See [`DIAGNOSTICS.md`](DIAGNOSTICS.md) §1.

### `failures`

A list of `{message, timestamp, value}`. `message` is an exception message;
`value` sometimes carries a `stack_trace`.

**Most often the list is empty.** On three separate accounts, every job with
`state: failed` rendered `failures: _none_` and `result: _not set_` — no
message, no trace, nothing. Treat a populated `failures` as the exception.

**When it is populated it's frequently generic.** `executing cluster '<id>'
failed` is a real and common message, and it says nothing about which resource
ran short. There is **no structured out-of-disk or out-of-memory signal anywhere
in the API** — not a code, not a category, not a flag.

None of this blocks a sizing recommendation. A failed run with no stated cause
is a reason to take the Phase 8 headroom rung, not a reason to investigate —
debugging why a job failed is a different job than deciding what pool it needs.

So:

- Quote what you got, verbatim, and reason from it only as far as it goes.
- Do not build a diagnosis on an error string you did not read. If the user
  pastes one, that's evidence. Its absence is not.
- "It failed and the message doesn't say why" is a legitimate finding. The
  honest response is headroom, not a named cause.

### `state`

`pending`, `scheduled`, `running`, `completed`, `pending_cancellation`,
`cancelled`, `failed`. Filterable on `jobs_search`.

**`pending` and `scheduled` are different.** `pending` means the job has not
been assigned to a pool yet. `scheduled` means it has, and is waiting to run.

**Do not read `pending` as stuck.** Measured: two identical forecasts on the
same plane. The pinned one reached `scheduled` in 40 seconds. The unpinned one
sat at `pending` for roughly six minutes with `updated_at` frozen at
`created_at` — and then ran fine, completing at 6m56s. A frozen `updated_at`
means "not assigned yet," not "abandoned."

That plane also had no `default_compute_pool_id`, and the job still resolved a
pool eventually — so a missing plane default does **not** orphan a job.

Practical consequence: you cannot distinguish "waiting its turn" from
"genuinely stuck" from a single observation. Before calling anything stuck,
poll again after several minutes, and compare against how long this job type
normally takes on this plane (`jobs_search` gives you that). Calling a job
stuck after two minutes of `pending` is the error to avoid — the platform's
normal assignment-plus-launch latency on a cold pool is around 8 minutes,
which looks identical to a hang if you only look once.

When a job really does stay `pending` far beyond that range, the in-flight
cluster cap is the likely cause. Either way it is not a sizing problem and a
resize is the wrong answer.

### What jobs do not give you

**Which pool the job ran on.** Not in `metadata`, not in `input`, not in
`tags`. So you cannot pair "this took 22 minutes" with "…on a `medium`
pool," which would otherwise be the most valuable calibration available.

Three responses, in order of preference:

1. Ask the user which pool the run used — Phase 5 does.
2. If they don't know, the plane's `default_compute_pool_id` from Phase 2 is
   the likely answer. Say you're assuming it.
3. Do **not** infer the pool from the resolution chain and state it as fact.
   The chain can't see per-job overrides, so the inference is wrong exactly
   when it matters.

Also absent: attempt count, so you can't tell a first try from a third.

---

## 5. Data planes and pools

```
narrative_data_planes_describe(data_plane_ids=[<dpId>],
  include=["metadata","compute_pools","platform"])
```

`include` is **not** optional in practice — the default is `metadata` only,
and without it you see no pools and no provider type.

### `metadata`

`display_name`, `status`, and optionally `description`,
`default_compute_pool_id`, `last_heartbeat_at`.

`default_compute_pool_id` is where jobs land when nothing pins a pool, which
makes it the incumbent worth reading instead of asking about. **It is
frequently absent** — observed missing on a Narrative-managed AWS plane and
present on a Snowflake plane in the same company. When it's missing, say you
couldn't determine the incumbent; don't substitute the first pool in the list.

### `compute_pools`

Per pool: `id`, `name`, `status`, `size`, `idle_timeout_seconds`,
`always_on`. That is the entire list, and the last two are often missing —
`idle_timeout_seconds` is omitted outright, `always_on` renders `n/a` when
unset (universal on Snowflake planes, where it has no meaning). **Absence is
not `false`.**

- **Names lie, and names collide.** They're free text and aren't synced to
  `size`, so a pool named `x_small_default` can be `size: medium`. Worse, a
  live plane carries two *different* pools both named `shared_xsmall_pool` —
  same name, different ids, one `always_on: true` and one not. A name is not
  an identifier. Read `size` and `always_on` off the payload; cite the **id**.
- **Empty is not none.** The section is omitted when a plane has no pools,
  so absence means either "no pools" or "you forgot `include`." Check which.
- **`job_execution_timeout_seconds` is not here**, and it's the constraint
  most likely to kill a long job. Report it unknown rather than assuming the
  4-hour default; it is visible on the Compute Pools screen.

### `platform`

Carries `type`, which decides the branch. Confirmed values:
`platform_shared_aws` for Narrative-managed compute, `platform_snowflake` for
a plane backed by registered Snowflake warehouses. It also carries `region`,
and on Snowflake the `account_locator`, `account_name`, and
`organization_name`.

An unrecognized value gets reported literally and asked about — never
defaulted to the AWS path.

---

## 6. Queries

### Validate — compile without running

`narrative_nql_validate(nql=...)` compiles a query without running it. Use it
to confirm a pasted query is valid and to read what it references: each
`company_data."<id>"` is a dataset id, each `<slug>.<name>` is an access
rule. It returns no cost or volume estimate.

### Forecast — how many rows the query returns

**A last resort, not a step.** Stats and column stats answer most sizing
questions instantly and for free. A probe query costs minutes and real compute
on the user's account, so it needs a reason — in practice, a query reading an
access rule whose `dataset_ids` won't resolve — and an explicit yes. Never run
one for completeness.

Verified working end to end. The call:

```
narrative_nql_run(nql="EXPLAIN <query>", data_plane_id=<dpId>,
  compute_pool_id=<shared always-on pool id>)
→ poll narrative_jobs_describe(job_ids=[<id>], include=["metadata","result"])
```

### Finding the pool to run it on

Probes belong on the **shared always-on pool**, which already has a running
cluster. Discover it rather than remembering an id:

1. `narrative_data_planes_list(include=["metadata","platform"])`
2. Take the plane with `platform.type: platform_shared_aws` and
   `platform.region.id: us-east-1` — the Narrative shared plane, present in
   every account.
3. `narrative_data_planes_describe(..., include=["compute_pools"])` on it and
   take the pool with `always_on: true` and `idle_timeout_seconds: -1`.

On the environment checked, that resolved to pool `d1b5a48f-…` on plane
`f79cbdae-…`. Use the properties, not the ids — but the ids are a useful
sanity check.

**Any other pool costs roughly 8 minutes of cluster startup**, which is the
whole reason to pin. Measured on one query: 1m30s on the always-on pool,
6m56s unpinned. Same result.

`nql_run` echoes the compiled SQL immediately, which is worth reading — the
forecast compiles to a single `SUM(count_multiplier)` over the sources, so it
does far less work than the real query.

**The result is nested three levels deep**, not a flat `{rows, cost}`:

```json
{ "success": { "result": { "Forecast": { "cost": 0, "rows": 151 } } } }
```

Read `success.result.Forecast.rows`. A flat `result.rows` lookup returns
nothing.

This is the only evidence that measures *the query* rather than the datasets
beneath it, and the only way to get a volume figure across an access rule.

Four caveats beyond the pool choice above:

- **It submits a job.** Ask before running it, and say why the read-only
  evidence wasn't enough. If the user declines, that's a normal outcome.
- **`rows` is the output count, not the volume scanned.** A query reading ten
  billion rows and returning a thousand is expensive despite a tiny forecast.
  Always read it next to the source row counts. Note also that on an
  unfiltered single-source query the forecast just reproduces that dataset's
  `active_dataset_stored_records` — measured: `rows: 151` against a dataset
  whose stats reported 151 records. It tells you something new only when the
  query filters, joins, or crosses an access rule.
- **`cost` is a data-acquisition figure, not compute cost.** It came back `0`
  for a query over the company's own data. It answers "what would buying
  these rows cost," which is a different question from "what will running
  this cost." Report `rows`; leave `cost` out of a sizing recommendation.
- **If it errors or the job fails, drop it.** Say the forecast was
  unavailable and size from row counts and query shape. It is the best
  evidence here, not required evidence, and the recommendation must still
  land without it.

---

## 7. Things with no source at all

Do not state these as facts. If the recommendation depends on one, name it
as an assumption:

| Not available | What to do |
| --- | --- |
| Which pool a past job used | Ask, or assume the plane default and say so |
| A pool's job execution timeout | Report unknown; point at the Compute Pools screen |
| Access rule row or byte counts, directly | Follow `dataset_ids`, run an `EXPLAIN` (§6), or ask |
| The cause of a failure, structurally | Quote the text; don't name a resource it doesn't name |
| The volume a query *scans*, as opposed to returns | `EXPLAIN` gives output rows only. Reason from source row counts |
| CPU, memory, or disk used by a past run | Not exposed anywhere. Size from rows and query shape |
| Cost of a run in currency | Report relative multipliers from [`POOL_SIZES.md`](POOL_SIZES.md) §3 |
| Queue depth on a pool | Not exposed. `state: pending` is the only visible signal |
