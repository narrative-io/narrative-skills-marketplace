<!-- AUTO-GENERATED from HARNESS_FALLBACK.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# Harness fallbacks

What to do when a declared tool or server is unavailable. Never silently
degrade — if a tier of the coverage ladder is unreachable, say so in the
rendered profile.

## `narrative-mcp` unavailable

This skill cannot profile without the server — there are no stats, no
sample, and no recalc path. Say so explicitly. The only degraded mode:

- Ask the user to paste the dataset's schema (column names + types) and
  10–25 sample rows.
- Run the `INTERPRETATION.md` shape-inference heuristics on the pasted
  sample, and report fill/cardinality only if the user also pasted
  stats.
- Set `stats_freshness: "sample_only"` and flag the whole profile as
  unverified against the live dataset. Do not present inferred numbers
  as authoritative.

## `/write-nql` unavailable

Tier 3 of the coverage ladder is unreachable. Any measure that requires
a custom query — and, for access rules, every quantitative measure —
cannot be computed. Mark each such column `measure_source: "unprofiled"`
with the reason "`/write-nql` unavailable", and profile every
stats-derivable column normally. Do not improvise a raw NQL query from
this skill; query authoring belongs to `/write-nql`.

## Waiting tools not available

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

## `AskUserQuestion` not available

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.

The gates that use it — the tier-2 recalc confirmation and the tier-3
custom-NQL confirmation — keep their logic unchanged; only the delivery
differs. When the caller pre-approved with `--allow-recalc` /
`--allow-nql`, there's no question to ask in the first place.
