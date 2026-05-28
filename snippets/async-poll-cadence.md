Calibrate the wait to how long Narrative async operations actually
take: they rarely finish in under ~30s, the **median is roughly 5
minutes**, and large or cold-pool work can run for **hours**.
Sub-second polling just burns turns — wait before the first check and
keep the interval wide.

**Prefer a non-blocking watcher over a foreground sleep.** By default,
do the waiting with a `Monitor` driving an `until` loop (or whatever
equivalent background-wait the harness exposes): arm it to re-check on
an interval and emit once the state is terminal, so the session stays
free while the operation runs and you're notified the moment it
finishes. (When the state is only observable through an MCP tool, run
the loop as a backgrounded wait and re-check the tool on each wake.)
**Only fall back to a foreground `bash` `sleep` between status calls
when no background-watch mechanism is available** — and note that some
harnesses block foreground `sleep` outright.

**Cadence.** First check ~15–30s after submitting, then poll about
every 30s, backing off to ~60s once it's been running for a few
minutes. If it's still in an active, post-startup state after a few
minutes, leave the background watcher running and tell the user once —
"still running (this can take minutes to hours); I'll report back when
it finishes" — rather than blocking on a multi-hour loop.

**Give-up rule — abandon a *stuck* operation, not a merely slow one.**
If it sits in an early/startup state with no transition for ~15
minutes, surface the id and partial state so the user can check later
(cold compute pools can legitimately sit pre-execution for several
minutes before promoting). Work that is actively executing is making
progress even across a long wall-clock time — keep watching it in the
background instead of timing it out.
