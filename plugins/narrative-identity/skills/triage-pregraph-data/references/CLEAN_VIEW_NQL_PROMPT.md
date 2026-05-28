# Clean-View NQL Prompt — Phase 8 brief for `/write-nql`

This reference holds the verbatim brief body the skill hands to
`/write-nql` in Phase 8. It converts the consolidated filter set
from Phase 6 into a single validated `CREATE MATERIALIZED VIEW`
query — the operational deliverable that produces a graph-ready
clean source.

Phase 8 is the **one** place this skill calls `/write-nql` directly.
The Phase 4 hypothesis testing routes through `/design-analysis`
because that workload is multi-query and analytical. Phase 8 is a
single deterministic translation from an already-decided filter set
into a `CREATE MATERIALIZED VIEW` — no analyst orchestration adds
value, so the direct call keeps the path short.

## Invocation

```
/write-nql --dataset <id> --no-explain
  Author a single CREATE MATERIALIZED VIEW over <fully-qualified
  source — e.g., company_data.<table>> that produces a graph-ready
  clean view. Project these columns explicitly: <col1>, <col2>, ... .
  Apply the following keep-predicates (combined with AND):
    K1: <predicate from Phase 6 finding 1, phrased to keep good rows>
    K2: <predicate from Phase 6 finding 2, phrased to keep good rows>
    ...
  Suggested view name: `<source>_graph_clean_<yyyymmdd>`.
  DISPLAY_NAME: a human-readable label, e.g.
  `<Source human name> — Graph-Clean Source`.
  DESCRIPTION: one sentence — graph-ready clean view of <source> with
  <N> filters applied to remove <the failure modes found in triage>.
  EXPIRE policy: short (e.g., 'P7D') — the caller can promote to a
  scheduled refresh if needed.
  Validate only. Do NOT run. Return the validated NQL verbatim.
```

## Access-rule delta

If the source is an access rule, see
[`ACCESS_RULES.md`](ACCESS_RULES.md) — drop the `--dataset <id>`
flag, swap the source reference to `<owning_company_slug>.<rule_name>`,
and use `<rule_name>_graph_clean_<yyyymmdd>` for the view name.
Everything else in the prompt is identical.

## Pre-flight checklist (do this before sending the brief)

1. **Dedupe** overlapping filters (e.g., a sentinel-email filter that
   subsumes a malformed-email filter). Keep the broader filter; drop
   the narrower one.
2. **Phrase each filter as a row-level keep-predicate** that evaluates
   `TRUE` for rows to **keep** (the materialized view's `WHERE`
   clause is a positive predicate, not an exclusion list). For each
   Phase 6 filter expressed as "exclude rows where X", invert it to
   "keep rows where NOT (X)".
3. **List every column the source carries** — NQL rejects `SELECT *`,
   so the materialization must project explicit columns. Capture the
   column list from the Phase 2 schema read.

## Post-flight

Wait for `/write-nql` to return a validated query. If validation
fails (e.g., a filter references a column that does not exist in
the schema, or a function call doesn't compile), loop back to Phase
6, revise the offending filter, and re-hand off. **Never ship an
unvalidated NQL block.**
