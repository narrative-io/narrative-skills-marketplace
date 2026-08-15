<!-- AUTO-GENERATED from COVERAGE_LADDER.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# The coverage ladder

A profile is a *fast* operation. Every measure climbs only as far up the
ladder as it must, and stops at the first tier that can produce it.
Phase 3 of the skill body is the gate; this reference is the mechanics.

| Tier | Produces the measure how | Cost | Gated? |
| --- | --- | --- | --- |
| 1 — bundled stats + sample | Already in the Phase 1 `describe` response | Free | No |
| 2 — configure + recalculate stats | The stats engine computes it; you enable/refresh it | One mutating call + a poll | Yes (recalc) |
| 3 — custom NQL via `/write-nql` | A query the stats engine can't express | One cheap query | Yes (run) |

The rule that separates tier 2 from tier 3: **if a configurable stat can
answer the measure, never hand-write NQL for it.** Tier 2 is cached and
reused by the next caller; tier 3 is a one-off. NQL writing exists
entirely in the context of something custom being needed.

---

## Tier 1 — bundled stats + sample

Phase 1's `narrative_datasets_describe(... include: ["metadata",
"schema", "stats", "sample"])` already returns the dataset's most recent
per-column stats summary and a sample. Read from it directly:

- `null_rate`, `distinct_count`, `top_values`, `min`/`max` per column.
- Sample rows for shape inference (see `INTERPRETATION.md`).

If you only need per-column stats without re-describing (e.g. you
described without `stats`), pull them in one call — `columns` is an
array; omit it for every column with stats (one call covers a
200-column dataset):

```
narrative_dataset_get_column_stats(
  dataset_id: <id>,
  columns: ["<name>", "<name>"],   // omit for all columns
  include: ["basic_column_stats"]
)
```

If the bundled sample is too old to trust for shape inference, enqueue a
fresh one (async — wait for the returned job):

```
narrative_dataset_request_sample(dataset_id: <id>)
```

There is no `limit`; the platform decides sample size.

**Freshness.** Stats are computed against a snapshot. Compare the
snapshot the stats were computed against to the dataset's current
snapshot (both in the describe metadata). Equal → `fresh`. The stats
snapshot is older → `stale`. No stats at all → `missing`. `stale` and
`missing` are the triggers for tier 2.

---

## Tier 2 — configure a stat → recalculate → re-read

Take this path when the measure *is* something the stats engine
produces but isn't enabled (a histogram you didn't ask for) or is stale.
**Do not hand-write NQL here.**

### When a finer stat must be enabled first

Histograms and finer per-property stats are off by default (a histogram
can blow the response cap on a wide column). Configure them before
recalculating. For a Rosetta-Stone-mapped property — e.g. the id-type
distribution `/generate-match-report` needs — the config is:

```
narrative_dataset_set_column_stats_config(
  dataset_id: <id>,
  configuration: {
    "rosetta_stone": {
      "fields": [{
        "attribute_name": "graph_edge",
        "properties": [{
          "path": "target_id_type",
          "enabled_stats": ["histogram", "value_count", "approx_count_distinct"],
          "stat_options": { "histogram": { "max_bins": 100, "overflow": "truncate" } }
        }]
      }]
    }
  }
)
```

`overflow: "truncate"` caps the histogram instead of erroring; surface a
`histogram_truncated` flag when it trips. For a plain (non-rosetta)
column, configure the equivalent column stat rather than the
`rosetta_stone` block.

If a histogram is all you need and the stats are otherwise fresh, you
can also opt in per-read without reconfiguring:

```
narrative_dataset_get_column_stats(
  dataset_id: <id>,
  columns: ["<name>"],
  include: ["basic_column_stats", "histogram"],
  histogram_bin_limit: 25
)
```

### Recalculate (the one mutating call — gate it)

```
narrative_dataset_recalculate_statistics(dataset_id: <id>)
```

Async; returns a `recalculation_id` / job. **Gate this** behind the
Phase 3 confirmation unless `--allow-recalc` was passed. Wait for the
returned job to reach a terminal state, then re-read with
`narrative_dataset_get_column_stats` and set
`stats_freshness: "recalculated"` on the profile. Cadence:

Narrative async work is slow: it rarely finishes in under ~30s, the
**median is roughly 5 minutes**, and large or cold-pool work can run
for **hours**. So the question is not how fast to re-ask — it is
whether you can wait instead of re-asking.

**Have a job id and the `job_monitor` / `wait_for` tools? Wait.**

```
job_monitor(job_id: "<uuid>")                          → waitable.handle "wt_…"
wait_for(handles: ["wt_…"], timeout_seconds: 3600)     → status + result
```

You are paused until the job finishes, at no cost while you wait — no
turns, no model calls — and you get back what the job did. Up to 8
handles in one `wait_for`, so jobs you started together are waited for
once rather than one at a time. A **failed** job is a finished wait
carrying its failure messages, not an error. If a wait times out with
the task still running you may wait again; the work carries on either
way. Never loop `narrative_jobs_describe` to find out whether a job is
done.

**No handle to wait on? Then you have to check, and pause between
checks.** A workflow run has no handle — only jobs do — and neither
does work started through a third-party MCP server. In order of
preference: `sleep(duration_seconds: <n>)` if you have it (up to an
hour per call); otherwise a background watcher if your harness has one
(Claude Code's `Monitor` driving an `until` loop, armed to re-check on
an interval and emit once the state is terminal, so the session stays
free); and a foreground `bash` `sleep` only when neither exists — some
harnesses, Narrative agent runs among them, block it outright.

**Cadence when you are the one checking.** First check ~15–30s after
submitting, then about every 30s, backing off to ~60s once it has been
running for a few minutes. Tell the user once — "still running (this
can take minutes to hours); I'll report back when it finishes" — and
don't narrate every check.

**Your turns are finite.** Inside a Narrative agent run every check and
every sleep spends one of a bounded number of iterations (10 by
default), so hours of work cannot be waited out by checking. Wait on
jobs wherever a handle exists; where none does, sleep long, and if it
is still going after a few checks hand the ids back to the user instead
of spending the rest of the budget.

**Give-up rule — abandon a *stuck* operation, not a merely slow one.**
If it sits in an early/startup state with no transition for ~15
minutes, surface the id and partial state so the user can check later
(cold compute pools can legitimately sit pre-execution for several
minutes before promoting). Work that is actively executing is making
progress even across a long wall-clock time — keep waiting on it rather
than timing it out.

If the user declines the gate, profile from the sample, set
`stats_freshness: "sample_only"`, and flag every affected column. Don't
block on a recalc the user didn't approve.

---

## Tier 3 — custom NQL via `/write-nql` (last resort)

Reach here only when a required measure is genuinely outside what any
configurable stat can give:

- a cross-column relationship (distinct identifiers **per entity**),
- a conditional cardinality (`COUNT(DISTINCT x) WHERE y`),
- a derived-expression distribution (bucketing on a computed value),
- **any** quantitative measure on an access rule (tier 2 is unavailable
  there — see `ACCESS_RULES.md`).

Gate it unless `--allow-nql` was passed. Delegate to `/write-nql`; do
not draft raw NQL here. State this **profiling-grade efficiency
contract** verbatim in the delegated prompt:

> Profiling-grade query — must return in seconds, not minutes:
> - Use `APPROX_COUNT_DISTINCT(col)`, never `COUNT(DISTINCT col)`, for
>   every cardinality measure (exact at low cardinality, near-exact at
>   scale, far cheaper).
> - Project only the columns the measure needs; no `SELECT *`.
> - Bound the output: `GROUP BY` the one dimension under test, top-N
>   with `LIMIT`, no unbounded distributions.
> - No full-precision scan when an approximation answers the question.
> - One round trip per measure; never a query that could itself become
>   a long-running job.

Invoke with `--allow-nql` pre-approval already resolved, e.g.:

```
/write-nql --dataset <id> --no-explain
  <the single profiling measure, phrased to honor the contract above>
```

`/write-nql` validates, wraps the select in an ephemeral
`CREATE MATERIALIZED VIEW`, runs it, and returns the rows. Read the
measure off the result and set `measure_source: "custom_nql"` on the
affected column.

### When to give up instead of scanning

If the only way to compute a measure is a full-precision scan with no
approximation available — or `/write-nql` is unavailable — do **not**
run it. Set the column's `measure_source: "unprofiled"` and record the
reason (e.g. "exact per-entity cardinality unavailable as an
approximation; would require a full scan"). A profile that admits a gap
is correct; a profile that silently runs a multi-minute scan is not.
