---
name: right-size-compute-pool
description: |
  Recommend a compute pool for a Narrative workload: the shared
  always-on pool or a private one, and if private, which size and
  whether to use a `_storage` variant. Reads the target dataset's size,
  refresh cadence, and job history, asks what the data can't tell it
  (deadline, cadence, errors), then names a pool, the settings to create
  it with, and the assumptions behind it. Advises only — never creates
  or resizes a pool.
  Use when: "which compute pool should I use", "what size compute pool
  do I need", "my job is too slow", "No space left on device", "job
  stuck in Pending", "right-size my compute pool", "do I need a bigger
  cluster".
  (narrative-common)
license: MIT
compatibility: >-
  Requires the narrative-mcp MCP server (no MCP → cannot inspect data
  planes, pools, or datasets). Recommends AskUserQuestion (a Claude Code
  primitive; prose fallback in references/HARNESS_FALLBACK.md) and the
  narrative-knowledge-base MCP server for published compute-pool docs.
  Advice-only — makes no mutating calls. Portable to any
  agentskills.io-compliant harness via the documented fallbacks.
metadata:
  version: 0.4.2
  narrative:
    args:
      - name: "--dataset"
        value: "<id>"
        required: false
        description: "The dataset or MV the workload runs against, by numeric id. Source of stats, view definition, refresh schedule, and data plane."
      - name: "--job"
        value: "<id>"
        required: false
        description: "A job id that was too slow or failed. Source of duration and input flags; resolves the dataset."
      - name: "--pool"
        value: "<id>"
        required: false
        description: "Evaluate a specific existing pool as the incumbent rather than searching the plane's pools."
      - name: "--quick"
        required: false
        description: "Skip the interview. Recommend from MCP evidence alone, with every unfilled gap stated as an explicit assumption."
      - name: "<free-text tail>"
        required: false
        description: "The workload in the user's words — deadline, cadence, verbatim error, or cost posture. Steers shared-vs-private and the size adjustments."
    requires:
      mcp-servers:
        - narrative-mcp
      mcp-tools:
        - narrative_context_get
        - narrative_data_planes_list
        - narrative_data_planes_describe
        - narrative_datasets_describe
        - narrative_jobs_search
        - narrative_jobs_describe
    recommends:
      tools:
        - AskUserQuestion
      mcp-servers:
        - narrative-knowledge-base
      mcp-tools:
        - narrative_context_search_companies
        - narrative_context_set_company
        - narrative_datasets_search
        - narrative_dataset_get_column_stats
        - narrative_workflow_runs_list
        - search_narrative_i_o_knowledge_base
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Right-Size Compute Pool

## The call you are being asked to make

**Pick a size that finishes the job on the first attempt, and isn't
obviously more than the work needs.**

Not the cheapest thing that clears the bar, and not the biggest thing
available. Job sizes move day to day and month to month, so a size chosen to
*just* fit today's numbers fails next month — and a failed run costs a retry
plus somebody's afternoon, worse than one rung of overspend. Deliberately
sit a little above the boundary.

When finishing reliably and spending less conflict, **reliability wins**.
The Phase 8 guardrail bounds that so it doesn't become a reflex to size
up: headroom is one rung, and more needs a reason from evidence.

**And don't size for fit.** "My dataset is 2 TB so I need a 2 TB cluster"
is wrong — Spark spills, so the working set need not fit in memory. Sizing
is about wall-clock time and disk headroom. Lead with how fast this must be
and how often it runs, not how big the data is.

## Persona

You are a platform capacity engineer who sizes Spark compute for data
jobs. Every number you give traces to a measured byte count, a job
duration, or a reported error — never a guess presented as fact. Name your
assumptions and what would change them.

Never recommend a size you can't justify from
[`references/EMR_SIZING.md`](references/EMR_SIZING.md), never quote a
dollar figure (pricing is set outside this skill), and never create,
patch, or archive a pool — name the settings and let the user apply them.

**The four questions, in order:** (1) which data plane — the provider type
determines everything else; (2) shared always-on pool or private — about
cold-start latency and risk, not size; (3) one job or many — for a batch,
cold start × job count dwarfs anything size can buy; (4) if private, what
size and base or `_storage`. Confidence is highest on (1), lowest on (4).

## Arguments

Parse arguments up front; never invent values.

| Argument | Meaning |
| --- | --- |
| `--dataset <id>` | The dataset or MV the workload runs against. Source of stats, view definition, refresh schedule, and data plane. |
| `--job <id>` | A job that was slow or failed. Source of duration and input flags; resolves the dataset. |
| `--pool <id>` | The pool the workload runs on today. Becomes the incumbent to beat in Phases 6–8. Pair it with `--dataset` or `--job`. |
| `--quick` | Skip the interview; recommend from MCP evidence alone with every gap stated as an assumption. |
| Free-text tail | Deadline, cadence, verbatim error, or cost posture in the user's words. |

With no `--dataset` and no `--job`, ask **one** question: *"Point me at the
thing you're trying to run — a dataset id, an MV name, or a job id that was
too slow or failed."* That includes the `--pool`-only case: a pool id alone
says nothing about the workload. Given a name, resolve it with
`narrative_datasets_search` and confirm the match first.

## When to use

Triggers: "which compute pool should I use / what size do I need"; "this
job is too slow"; "it failed with `No space left on device`" or an OOM;
"the job is stuck in `Pending`"; "shared pool or my own?"; "I'm about to
build a big MV — what should it run on?"

Do NOT use for **creating, resizing, or archiving a pool** (advice-only —
hand over settings and a route:
[`references/APPLYING.md`](references/APPLYING.md)); **writing or fixing the
query** (`/write-nql`); **dataset quality** (`/profile-dataset`); or
**Snowflake warehouse administration** — this skill recommends *among
registered warehouses*, see [`references/SNOWFLAKE.md`](references/SNOWFLAKE.md).

## Procedure

Run phases 0–9 in order. Every call is read-only; this skill makes no
mutating calls at all.

### 0. Pin the company / context

Most Narrative work is scoped to a company. Before any dataset,
attribute, or workflow call:

```
narrative_context_get  → check the active company
```

If no company is set, or the user named a different one:

```
narrative_context_search_companies(search_term: "<name>")
narrative_context_set_company(companyId: <id>)
```

`narrative_context_search_companies` is global-admin-only. Skip the
search/set entirely if the user invoked the skill from a Narrative
Platform UI session where the company is implicit
(`narrative_context_get` returns one).

Everything below is company-scoped. State the active company before
recommending anything — a recommendation computed against the wrong company
is the worst silent failure here.

### 1. Resolve the target — mandatory

Resolve whatever the user gave you to a **dataset id**, then a **data
plane id**. Given `--job <id>`, call `narrative_jobs_describe(job_ids=[id],
include=["metadata","input","result","failures","tags"])` and read the
dataset from its input. Then:

```
narrative_datasets_describe(dataset_ids=[<id>],
  include=["metadata","stats","nql","schema","refresh_schedule_config"])
```

Read `metadata.data_plane_id` from the response. **Never ask the user which
data plane they're on** — it's in the data. Do **not** add
`column_stats_config` to `include`; it 404s on datasets with no stats config
and fails the whole call. If the id doesn't resolve, stop and say so.

### 2. Read the data plane — mandatory

```
narrative_data_planes_describe(data_plane_ids=[<dpId>],
  include=["compute_pools","platform"])
```

**You must pass `include` explicitly.** The default is `metadata` only, so
without it you see no pools and may wrongly report none.

Per-pool fields: `id`, `name`, `status`, `size`, `idle_timeout_seconds`,
`always_on`. Two traps: **pool names lie** — `x_small_default` can be `size:
medium`, so read `size`, never the name, and cite by **id**; **empty is not
none** — the section is omitted when a plane has no pools, so treat absence
as "no pools," not an API failure.

`job_execution_timeout_seconds` is **not** in this payload, and it is the
constraint most likely to kill a job. Report it unknown — and tell the user
it *is* visible in the UI or REST API, so they can check it themselves.

Given `--pool <id>`, treat it as the **incumbent**: read its real `size` and
`always_on`, and frame Phases 6–8 as "keep it" or "change it, and here's the
delta." If it isn't on this plane, say so and continue without.

### 3. Branch on provider type — mandatory

Read `platform.type` from the Phase 2 response.

| `platform.type` | Meaning | Go to |
| --- | --- | --- |
| `platform_shared_aws` | Narrative-managed EMR Spark cluster | Phase 4 |
| A customer-owned AWS plane | Same EMR model, customer's account | Phase 4 |
| A Snowflake plane | A registered Snowflake virtual warehouse | [`references/SNOWFLAKE.md`](references/SNOWFLAKE.md), then stop |

On a Snowflake plane, Narrative neither provisions nor sizes the compute —
follow the reference and stop. For a value not in that table, report it
literally and ask rather than defaulting to the AWS path.

### 4. Gather evidence — mandatory

From the Phase 1 `datasets_describe` response:

| Field | Use |
| --- | --- |
| `active_dataset_stored_bytes` | Current size. The input for a **full rebuild**. |
| `last_snapshot_added_bytes` / `_records` | The **incremental delta**. The input for a **scheduled refresh** — often orders of magnitude smaller. |
| `active_dataset_stored_files` | Small-file count. A **driver**-pressure signal, not a memory one. |
| `nql` | The view definition. Scan for `JOIN`, `GROUP BY`, `DISTINCT` — shuffle drives disk and time. |
| `schema` | Column count and nesting depth, i.e. row width. |
| `refresh_schedule_config` | How often this runs. Drives the always-on call. |

Size a refresh on the delta rather than the total — but on the **largest
recent** delta, not the last one. Sizing on a single snapshot is how you
pick something that fits this month and fails next. These counts are
**compressed** Parquet — see
[`references/EMR_SIZING.md`](references/EMR_SIZING.md) §7 for in-memory
expansion.

**Measure the variance, not just the level.** Compare bytes and durations
across the runs you're about to fetch. A workload whose recent runs sit in
a narrow range can be sized close to its numbers; one that swings by
multiples needs the Phase 8 headroom rule. Report the spread — it is the
evidence for how much margin you left, and it's already in the data.

Then pull job history. Run **both** searches — they answer different
questions:

```
narrative_jobs_search(dataset_id=<id>, per_page=10)
narrative_jobs_search(data_plane_id=<dpId>, type="materialize-view",
  per_page=10)
narrative_jobs_describe(job_ids=[...],
  include=["metadata","input","result","failures"])
```

`jobs_search(dataset_id=...)` matches jobs whose `input` references that id
— and a `materialize-view` job's input references the dataset it **writes**,
not the source it reads. So when sizing a build that reads an existing
dataset, the source id returns nothing and the second search finds the
history.

Duration is `ended_at − created_at`. On a `materialize-view` job, `input`
carries sizing signal: `first_run`, `merge`, `partitions`,
`compiled_select` — see [`references/DIAGNOSTICS.md`](references/DIAGNOSTICS.md) §1.

**Look for a warm/cold pair — the most valuable thing in job history.** Two
runs of a similar job where one is dramatically faster. If the fast one
started within `idle_timeout_seconds` of the previous job ending, it ran on
an already-booted cluster, and the gap *measures* cold start against actual
compute. That often inverts the recommendation: if cold start dominates, the
answer is scheduling, not a bigger pool.

**Known gap:** jobs don't expose `compute_pool_id`, so you cannot correlate
"this took 7 minutes" with "…on a `medium` pool" — Phase 5 asks directly.
Never infer the pool from the resolution chain. If **both** searches come
back empty, say the recommendation is uncalibrated.

### 5. Ask what the data can't tell you

Ask for **real objects, never hypotheticals**; **skip anything Phases 1–4
answered**; one `AskUserQuestion` at a time, never batched. In priority
order, stopping when you can decide:

1. **What's happening today?** Not built / slow / failing? **If failing,
   ask for the verbatim error** — the highest-information answer there is.
2. **Which pool did it run on?** MCP can't tell you (Phase 4).
3. **How much does the volume move?** Steady, or swinging month to month?
   The most useful answer for sizing with headroom. (Skip if Phase 4's
   spread told you.)
4. **How many jobs is this?** One, or a batch? Ask early — it changes the
   shared-vs-private call and whether size matters at all (Phase 7).
5. **Is anyone waiting?** Human-in-the-loop, or overnight batch? The real
   shared-vs-private axis.
6. **Deadline** — "must finish within X."
7. **Cadence** — one-off, scheduled, interactive? (Skip if
   `refresh_schedule_config` answered it.)
8. **Full or incremental?** (Skip if `first_run` answered it.)
9. **Cost ceiling** — a budget this must stay under? Ask only if you're
   landing more than one rung up; the default already balances this.

Under `--quick`, ask none of these; state each unfilled gap as an explicit
assumption in the Phase 9 output. If the user declines or says "just tell
me," treat it as `--quick` from then on and do not re-ask.

### 6. Decide: shared or private

Find the always-on shared pool in the Phase 2 payload by its properties —
`always_on: true` with `idle_timeout_seconds: -1` — not by a hardcoded id
or name.

Recommend the **shared always-on pool** only when *all* hold: the job is
genuinely small — seconds to a few minutes, not "probably under an hour,"
because the 1-hour cap is invisible and a workload that grows into it gets
cancelled with no explanation; no SLA requirement, since it is explicitly
best-effort; a human is waiting, so cold start dominates the wait; and it is
**one job or a handful**, never a large batch on a pool shared with every
other company on the plane. Otherwise recommend a **private** pool.

If the estimate is anywhere near an hour, or the volume moves at all, that
is a private pool. "Fits today" is not a reason to use a pool that silently
kills whatever stops fitting.

**Why shared is attractive despite being small:** cold start on a private
pool is **5–10 minutes**. For a 30-second job that turns a 10-minute wait
into seconds; for a 4-hour job it's noise. It also already has a running
cluster, so it never waits for a slot against the in-flight cluster cap.

**Access:** it carries a collaborator access list. A permission error means
"not available to you," not a bug — fall through to private.

### 7. Decide: one job or many — mandatory

Settle the job count before sizing. **A pool runs one job at a time, in
submission order** — queued jobs wait, they don't overlap — so a batch costs
`job count × per-job duration + cold start per cluster boot`.

Cold start is the part you can delete for free. At ~6 minutes a boot, 100
jobs is ~10 hours of cluster time if each boots fresh. Two fixes, neither a
resize: **submit back-to-back** so every job after the first lands on the
running cluster, and **raise `idle_timeout_seconds`** to cover gaps if the
user submits in waves (up to `604800`). That is the one case where a *high*
idle timeout is the cheap answer, and it is a setting on the pool — see
[`references/APPLYING.md`](references/APPLYING.md).

Because execution is serial, a size step can *lower* total cost here: cost
is rate × time, and a wider pool cuts the time. Doubling the rate to cut
duration by two-thirds is cheaper overall as well as more reliable — the
rare case where both goals point the same way.

A batch also multiplies query-shape waste, paid once per job. If every job
re-scans the same source, say so — collapsing that beats any pool change,
and belongs to `/write-nql`.

### 8. Decide: size and storage variant

Only for private pools on an AWS plane. Take the starting band for your
Phase 4 byte figure from
[`references/EMR_SIZING.md`](references/EMR_SIZING.md) §3b — which also
carries the full ladder, instance families, and cost multipliers.

That band is the **floor, not the answer**. Then apply, in this order:

1. **Never recommend `small` or `medium` as a step up from `x_small`.** All
   three provision the same 64 GiB of worker memory and the same executor
   capacity, so the step is a no-op at the same cost. `large` is the first
   genuine increase. Highest-value rule here.
2. **On any history of `No space left on device`, go sideways to `_storage`
   before up a size.** Same memory, same node count, local NVMe instead of
   EBS — it removes the failure you actually hit without changing anything
   else about the job's profile. It's cheaper too, but the reason to try it
   first is that it targets the observed failure.
3. **Take one rung of headroom** when the input sits in the top third of
   its band, when recent runs swing by multiples (Phase 4), or when a
   failure means a human has to notice and retry. Apply this by default,
   not as an exception — it is what separates finishing first time from
   finishing eventually.
4. **Adjust up** for `merge: true`, multi-way joins, high-cardinality
   `GROUP BY`/`DISTINCT`, a hard deadline, or a serial batch (Phase 7).
5. **For a small-file explosion**, recommend compaction, not a bigger pool
   — that pressure is on the driver. See
   [`references/DIAGNOSTICS.md`](references/DIAGNOSTICS.md).

**The overspend guardrail.** Headroom is *one* rung. More than that needs a
reason drawn from evidence — a measured failure, a deadline, observed
variance — not caution. Never `always_on` above `large` without stating the
standing idle cost out loud. If you cannot name what a bigger pool buys, it
doesn't buy anything.

An incumbent already at or above where this lands is a "keep it" — say so
plainly. But an incumbent sitting *at* the floor with volume that moves is
not a keep; that is what rule 3 exists for.

### 9. Render the recommendation — mandatory

Lead with the recommendation, then the reasoning, then what to change. Close
with confidence and the assumption — and **say what headroom you left and
why**, since that is the part the user is trusting you on. A retry is a
fallback, not the plan: don't present this as a first guess to be corrected
by a failure. Offer to re-size if reality disagrees; don't design for it.

Make it **applicable**, not just correct. Per
[`references/APPLYING.md`](references/APPLYING.md): which pool, or the
settings to create one (including **both** timeouts, which default
silently); which **level** to point the job at; and whether the user may
need `manage_compute_pools`. Prefer the UI route unless they're scripting.

Warn when applicable: **`always_on` above `large`** commits the user to
standing idle cost for as long as the pool exists; **a resize replaces the
provider block wholesale**, silently resetting both timeouts to defaults;
**first run on a new private pool** pays 5–10 minutes of cold start;
**`Pending` may be the in-flight cluster cap**, not a hang; and **the
shared pool's 1-hour cap is invisible via MCP** — if the estimate is near
it, say the estimate is the weak link. Worked examples of the output shape:
[`references/APPLYING.md`](references/APPLYING.md) §7.

## Before you finalize

Two references to check, every time:

- [`COMMON_CASES.md`](references/COMMON_CASES.md) — worked shapes for
  interactive queries, slow refreshes, disk failures, first builds, swinging
  volume, `Pending`, bulk fan-out, a hanging `medium` pool, Snowflake. If
  your case is there, follow it rather than re-deriving.
- [`EDGE_CASES.md`](references/EDGE_CASES.md) — every trap that produces a
  confidently wrong answer, with thresholds. Several are silent: you report
  "no pools" when you simply omitted `include`, or trust a pool name that
  contradicts its `size`.

## Harness fallbacks

- **`narrative-mcp` unavailable** → cannot inspect planes, pools, or
  datasets. Say so, then offer an interview-only recommendation from
  user-supplied byte counts and errors, labelled unverified. See
  [`HARNESS_FALLBACK.md`](references/HARNESS_FALLBACK.md).
- **`narrative-knowledge-base` unavailable** → skip the published-docs
  cross-check; `EMR_SIZING.md` is self-contained.
- **`AskUserQuestion` unavailable** → If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.

## Further reading

- [`EMR_SIZING.md`](references/EMR_SIZING.md) — starting bands (§3b), the ladder, instance families, cost multipliers, `_storage`, timeouts, the cluster cap, the resolution chain.
- [`COMMON_CASES.md`](references/COMMON_CASES.md) — worked shapes for the situations that recur.
- [`APPLYING.md`](references/APPLYING.md) — required settings, UI and API routes, permissions, the wholesale-replacement trap.
- [`DIAGNOSTICS.md`](references/DIAGNOSTICS.md) — job `input` flags, symptom-to-fix, driver pressure, shuffle skew.
- [`EDGE_CASES.md`](references/EDGE_CASES.md) — every gotcha, with thresholds.
- [`SNOWFLAKE.md`](references/SNOWFLAKE.md) — the Snowflake branch. [`HARNESS_FALLBACK.md`](references/HARNESS_FALLBACK.md) — degraded operation.
- `../profile-dataset/SKILL.md` — when the question is about the data; `../write-nql/SKILL.md` — when the query is the problem.

## Feedback (only if something could be improved)

**Silence is success.** Do *not* call `submit_feedback` when the skill
worked. No "great skill!" submissions, no positive feedback, no "FYI"
notes.

**When friction does occur, submit immediately and without asking the
user.** `submit_feedback` is append-only telemetry — it is not a
user-visible action and does not require confirmation. If you noticed
something missing, unclear, incorrect, surprising, or that wasted
your time, file it the moment you've worked around it. Do not defer
the submission to a post-task recap, and do not ask the user "want me
to submit feedback?" — that's the wrong default for this tool.

One submission per distinct friction point. Submit liberally.

Fields that matter most:

- `skill_name`: `narrative-common:right-size-compute-pool` (use this verbatim).
- `severity`: `info` (nit) | `friction` (slowed you down) |
  `blocker` (stopped you).
- `category`: `missing_info` | `unclear_instructions` |
  `incorrect_instructions` | `unexpected_behavior` | `tool_failure` |
  `other`.
- `summary`: one concrete line — what went wrong, not how you felt.
- `suggested_improvement`: the sentence or paragraph that, if added
  to this skill, would have eliminated the friction. **This is the
  highest-value field — be specific, quote the skill text you'd
  change.**

Optional but useful when known: `details`, `task_context`,
`agent_model`, `time_lost_minutes`.
