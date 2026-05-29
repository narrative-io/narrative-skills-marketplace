# Edge cases and gotchas

One entry per failure mode. The body carries the one-line cheat sheet;
the full procedure is here.

## Stats missing entirely

`describe` returned no `stats` block and `get_column_stats` is empty.
This is the `missing_stats` case. Offer the tier-2 recalc (gated unless
`--allow-recalc`). If the user declines or recalc is unavailable,
profile from the sample only: set `stats_freshness: "sample_only"`,
leave numeric fields `null`, infer shape from sample rows, and raise one
dataset-level `missing_stats` flag. Never block on a recalc the user
didn't approve.

## Stats older than the current snapshot

The stats snapshot in metadata predates the dataset's current snapshot.
Raise `stale_stats` and offer the same gated recalc path. If declined,
report the numbers you have **with** the `stale_stats` flag so the
caller knows they describe an older snapshot — don't silently present
stale numbers as current.

## Histogram blows the response cap

Wide columns can exceed the response cap. Always configure histograms
with `overflow: "truncate"` and a `max_bins` (e.g. 100) — never request
an unbounded histogram. When truncation trips, surface
`histogram_truncated` and report the top bins you got; do not retry with
a larger limit chasing completeness.

## Empty / zero-row dataset

`row_count == 0`. Report the shape header with `row_count: 0` and stop —
there are no per-column stats or sample rows to interpret. Don't escalate
to tier 2/3 on an empty source.

## Access rule

No bundled stats or sample; tier 2 unavailable. Every quantitative
measure goes to tier 3. See [`ACCESS_RULES.md`](ACCESS_RULES.md).

## `_nio_*` platform-managed columns

Profile them silently if the caller's focus includes them, but never
name them in the rendered table, flags, or summary. Refer to them
generically ("platform-managed columns") if you must acknowledge them.
Exception: the user expressly asks about `_nio_*` fields.

## Caller asked for a measure no stat can give, and `/write-nql` is down

Tier 3 is unreachable. Mark the affected column
`measure_source: "unprofiled"` with the reason "custom measure required;
/write-nql unavailable". Profile every other column normally. Don't
improvise a raw query from this skill — query authoring belongs to
`/write-nql`.

## Very wide dataset (200+ columns), no focus list

One `get_column_stats` call still covers it, but the rendered table will
be unwieldy. Render the dataset-level shape + flags in full, then the
per-column table sorted by null rate, and offer to expand specific
columns rather than dumping 200 rows. The structured object always
carries every focused column.

## Recalc job stuck

A recalculation that sits in an early state for ~15 min is stuck (cold
pool excepted — see the shared `async-poll-cadence` give-up rule).
Surface the job
id and partial state, fall back to `sample_only`, and let the caller
re-check later. Don't block the profile on a multi-hour wait.
