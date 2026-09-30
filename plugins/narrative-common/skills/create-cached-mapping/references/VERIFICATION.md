<!-- AUTO-GENERATED from VERIFICATION.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# Verifying the fill

How to poll the first fill run, prove the cache actually resolves, and
diagnose the ways a "successful" run still leaves a blank attribute.

Read this when the fill workflow has been submitted — phase 10 of the
skill. The body carries the rule (poll to terminal, check inserted rows,
validate a read, never claim success on zero inserts); everything below
is the detail behind it.

## Polling the run

Use the workflow and run ids `/create-workflow` returned. It submits but
does not poll.

After `narrative_workflows_create` returns, capture both
`workflowId` and `runId` (the latter is present when the call was
made with `trigger_immediately=true`). Poll the run until terminal:

```
narrative_workflow_runs_list(workflow_id=workflowId)
```

Terminal states are `completed`, `failed`, and `terminated`; any other
status means keep polling.

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

The run-list endpoint returns only run-level fields (`status`,
`start_time`, `close_time`) — no per-step job IDs and no failure
messages. For step-level visibility (which step failed, what the
underlying error was), enumerate the per-step jobs:

```
narrative_jobs_search(workflow_run_id=runId)
```

Each result carries a `job_id` plus the workflow step it ran for.
Pull the failing one's detail with
`narrative_jobs_describe(job_id=<...>)` to read the actual error
message. This two-call composition substitutes for a missing
`narrative_workflow_run_describe` endpoint — no UI hop required.

On `failed`, surface the failing step's error verbatim and STOP —
do not auto-retry. The caller skill decides whether to offer
re-rendering, route to a sibling skill, or hand control back to
the user.

## Proving the cache resolves

A terminal `completed` is not proof of a working attribute. Three checks,
in order — each one rules out a different failure:

1. **The fill wrote rows.** Read the `fillCache` task's `insertedRows`
   from its job record. Zero is a real failure mode, not a quiet
   success.
2. **The cache holds them.** Describe the cache dataset with
   `include: ["stats"]` and confirm a non-zero row count. This
   distinguishes "the INSERT reported rows" from "the cache has rows."
3. **A read compiles and resolves.** Validate:

   ```sql
   SELECT d.<some_id_column>, d._rosetta_stone.<attribute_name>
   FROM company_data.<source_dataset> d
   ```

   Validation proves the mapping compiles and the cache reference
   resolves, which is the part that silently breaks. Actually *running*
   it proves values come back — only do that if the user asks, and say
   it costs compute first.

## Reading the tier breakdown

The resolved view keeps `resolver` and `ml_conf` per key; the cache does
not. So the "which tier answered, and how confident" question is
answered from the resolved view, not the cache:

```sql
SELECT r.resolver, COUNT(1) AS keys
FROM company_data.<resolved_view> r
GROUP BY r.resolver
```

A `resolver` of NULL means the row was cut by the LLM row cap — not an
error, and not a wrong answer. Those keys are retried on the next
refresh, because the fill only inserts non-NULL values.

This is worth reporting unprompted: it tells the user whether their rules
are earning their keep and whether the classifier threshold is set
sensibly. A tier that resolved nothing is a tier to reconsider.

## Diagnosing a run that "worked" but left the attribute blank

| Observation | Most likely cause | What to do |
|---|---|---|
| `insertedRows` = 0, cache empty | The `keys` anti-join found nothing, because the input expression in the mapping and in the waterfall differ. | Read the mapping's `input_expressions` and the resolved view's definition; compare character by character. This is the single most common cause. |
| `insertedRows` = 0, cache already populated | Nothing new to insert — every key was already cached. Correct behavior on a re-run. | Confirm the cache row count is non-zero and report it as a no-op, not a failure. |
| `insertedRows` > 0 but the read returns NULL for every row | The join key the reader computes doesn't match what was stored — same byte-identity problem, seen from the other end. | Compare a stored `input_0` value against what the input expression produces for the same source row. |
| Read fails to compile, "table not found" | The cache's status, not the SQL. | Describe the cache; if `pending`, activation didn't take. Re-run phase 8. |
| Many keys resolved to the fallback value | The LLM is answering off-enum — near-misses like "Standard Poodle" for "Poodle". | Check the prompt lists every enum value verbatim and that `temperature` is 0. Report the fallback rate; don't loosen the matching. |
| Run `failed` at `refreshResolved` | Usually the model tier: an unavailable Cortex model id, a missing classifier version, or Cortex grants absent on the account. | Surface the step's error verbatim and stop. Do not re-submit. |
| Run `failed` at `fillCache` in ~1.5s with no job | The cache was pending when the workflow ran. | Activate, then trigger a new run. |

Never report a fill as successful on the strength of a terminal
`completed` alone. The workflow's job is to insert rows; the skill's job
is a readable attribute. Those come apart exactly when the input
expression drifts, which is why the checks above exist.
