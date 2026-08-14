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
