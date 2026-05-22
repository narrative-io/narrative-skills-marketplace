# Chain execution — orchestrating `/write-nql` from an approved brief

This reference describes the optional follow-through path of
`/design-analysis`. The skill's primary deliverable is the **brief**;
execution runs only when the user explicitly approves it. When that
happens, this skill is the **only** orchestrator of `/write-nql` calls
for analytical work — upstream skills (e.g. `/triage-pregraph-data`)
that need queries run hand their specs to this skill and let it own
the chaining. Do not let callers bypass this layer; that's how the
separation between question-framing, query authoring, and
graph-quality concerns stays intact.

The order matters: **foundational queries first**, analytical
queries only after their dependencies have completed and validated.
Within a tier, independent specs run in parallel; dependent specs
wait.

## Parallelism — issue independent specs concurrently

Group the specs by tier (foundational / analytical) and by
dependency. **Independent specs at the same tier are issued as a
single batch of concurrent `/write-nql` tool calls in one turn**,
not serially. This is critical for callers that test many
hypotheses in parallel (e.g. `/triage-pregraph-data` passes 5–15
independent hypothesis specs in one brief).

A spec is *dependent* only if the brief explicitly marks it (e.g.
"Q5 depends on the cohort defined in Q3"). Otherwise treat
same-tier specs as parallel.

Example execution shape for a brief with Q1, Q2 foundational and
Q3, Q4, Q5 independent analytical specs:

1. **Batch 1 (foundational)** — issue Q1, Q2 as two parallel
   `/write-nql --run` invocations in one tool-call turn.
2. **Wait for both** to reach terminal state. Validate that the
   framing still holds.
3. **Batch 2 (analytical)** — issue Q3, Q4, Q5 as three parallel
   `/write-nql` invocations (no `--run` — let each one gate
   through `/write-nql`'s own end-of-flow approval).
4. **Wait for all three.** Then compose the consolidated results.

For very wide briefs (15+ independent specs), spawn a sub-agent
per spec cluster so each owns its own draft → validate → execute
loop and only consolidated results return to the parent.

## Per-spec invocation pattern

For each spec in the current batch:

1. **Compose the invocation.** The spec's purpose + filters +
   measures become `/write-nql`'s free-text tail; the dataset id and
   any flags become its arguments. Example for the validation query
   Q1:

   ```
   /write-nql --dataset 12345 --run --no-explain
     Q1 validation per the design-analysis brief: count rows,
     distinct entity_ids, and min/max event_ts for company_data.events
     over [2026-04-01, 2026-05-01).
   ```

   - Pass `--no-explain` on chained invocations — the brief already
     carries the user-facing explanation, and `/write-nql`'s
     plain-English layer would duplicate it.
   - Pass `--run` only for foundational queries (cheap, read-only,
     row-count / distribution / date-range sanity checks). **Never**
     auto-`--run` analytical queries that scan large volumes; let
     `/write-nql`'s end-of-flow gate ask the user.

2. **Hand off and wait.** `/write-nql` runs its own validate → (gated)
   execute loop. Wait for its terminal state before moving on
   (validated query for plan-only; `completed` job for `--run`).

3. **Capture the result.** Append to the brief as
   "Q<n> result": the query that was actually run plus the result
   rows (or the validated query, if execution wasn't approved).

4. **Decide whether to continue.** Foundational-query failures
   (Q1 row count = 0, Q2 distribution all-null, date range outside
   the window) invalidate the framing. **Stop and re-interrogate**
   (loop back to Phase 2) before any analytical query runs. Do not
   paper over a broken foundation.

## Foundational vs. analytical gating

| Tier | Examples | Default `/write-nql` invocation |
| --- | --- | --- |
| Foundational | row counts, date min/max, distinct keys, marginal distributions | `/write-nql … --run` immediately after brief approval |
| Analytical | period-over-period deltas, cohort joins, ranked attribution, decompositions | `/write-nql …` (no `--run`) — let `/write-nql` ask the user query-by-query |

This skill never bypasses `/write-nql`'s own validation or
execution gates. If the user invoked `/design-analysis` with a
`--run`-equivalent shortcut, that is forwarded to foundational
queries only.

## When `/write-nql` is not available

Drop to the harness-fallback flow ([`HARNESS_FALLBACK.md`](HARNESS_FALLBACK.md)): ship the
brief as the deliverable and let the user execute through their own
query tool. Never silently re-implement query execution inside this
skill.
