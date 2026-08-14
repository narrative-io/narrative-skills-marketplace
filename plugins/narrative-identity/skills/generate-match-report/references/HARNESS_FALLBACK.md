<!-- AUTO-GENERATED from HARNESS_FALLBACK.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# Harness fallbacks

What to do when a required tool or MCP server is unavailable. Load
this file only when the body's `## Harness fallbacks` section points
you here for a specific gap.

## When `narrative_nql_validate` is unavailable

Skip the Phase 6 pre-flight validation. Surface a one-line warning
to the user before the submit gate ("NQL validation tool not
available — the workflow runner will catch any syntax errors after
~5 minutes instead of up front"). Do not auto-substitute
`narrative_nql_execute` — that allocates compute.

## When `/profile-dataset` is unavailable (Phase 3)

Phase 3 normally delegates the `target_id_type` histogram read to
`/profile-dataset`. If that skill isn't installed, run the recovery
inline against the customer dataset. First read the stats:

```
narrative_dataset_get_column_stats(dataset_id=CUSTOMER_DATASET_ID)
```

If the histogram for `_rosetta_stone.graph_edge.target_id_type` is
missing or stale, configure it, recalculate, poll, and re-read:

```
narrative_dataset_set_column_stats_config(
  dataset_id=CUSTOMER_DATASET_ID,
  configuration={
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

Then `narrative_dataset_recalculate_statistics(dataset_id=CUSTOMER_DATASET_ID)`,
poll the returned job with `narrative_jobs_describe` until it
completes, re-fetch column stats, and read the histogram keys into
`CUSTOMER_ID_TYPES`. This requires the `narrative_dataset_get_column_stats`,
`narrative_dataset_set_column_stats_config`, and
`narrative_dataset_recalculate_statistics` tools (declared by
`/profile-dataset`, not by this skill).

## When the waiting tools are unavailable

A Narrative agent run has three waiting tools. `job_monitor(job_id)` takes a
job the platform runs and hands back a handle for it;
`wait_for(handles, timeout_seconds)` pauses the run until those jobs finish and
returns what each did, spending no turns while it waits; `sleep(duration_seconds)`
pauses the run for a set time, for work the platform cannot watch.

No other harness has them, and nothing substitutes for the pause itself — only
for the pacing. Check the status yourself, and put the harness's own wait
between checks:

- **Claude Code** — a `Monitor` driving an `until` loop, so the session stays
  free while the operation runs. Use that rather than `bash sleep`.
- **Any harness with a background or scheduled wait** — same shape: re-check on
  an interval, report once the state is terminal.
- **Nothing of the kind** — a foreground `bash sleep` between status calls, as a
  last resort. Some harnesses block it outright, Narrative agent runs among them
  — though there you would have `sleep` instead.

Cadence and the give-up rule are unchanged; they are in the skill body. Say when
you have degraded: "no wait tool here, so I'm checking every 30s" is worth
knowing when a job runs for an hour.

## When `AskUserQuestion` is unavailable

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.
