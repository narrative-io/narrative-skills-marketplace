# Alternate Entry Modes

The main procedure assumes the default flow: a fresh dataset with no
existing mappings, ending in a hand-off to `/apply-rosetta-stone-mappings`.
This file covers two alternate entry points that short-circuit that
flow when the user is touching up prior work rather than mapping a
new dataset.

Step 9 (the apply hand-off) is **skipped** for both modes below — the
output here is a scorecard or a one-line revision, not a deploy set.

## Evaluate existing mappings

If `narrative_datasets_describe` (with `include: ["mappings"]`)
returns a non-empty `mappings[]` array, or the user said "evaluate" /
"rate" / "why is X low confidence":

1. Skip the attribute-search step — the target attribute is already
   chosen. Pass the existing attribute IDs as an array to
   `narrative_attributes_describe(attribute_ids: [<id>, ...])`.
2. For each existing mapping, build a query that selects the mapping
   expression and the underlying source columns with a `limit` cap,
   and submit it via `narrative_nql_run(nql: '...')`. Poll the
   returned job with `narrative_jobs_describe(job_ids: ["<id>"])`
   until `state` is `completed`, then read the result rows to see
   what the mapping actually produces.
3. Score confidence per the main procedure's table, using *execution
   evidence* not just static reasoning.
4. Present a human-readable scorecard to the user — a row per existing
   mapping with `attribute_id`, `confidence`, `reasoning`, and an
   optional `suggested_fix`. For object_mappings include per-property
   scores (one entry per property_mapping path). Surface any
   dataset-wide warnings underneath. Do not print the underlying
   JSON unless the user asks.
5. Include a `suggested_fix` on any recommendation that has a concrete,
   testable replacement expression. Validate every `suggested_fix`
   expression with `narrative_nql_validate` first.

## Improve a single mapping expression

If the user pasted an expression and feedback (e.g., "lowercase the
emails, our match rate is bad"):

1. Pull the existing sample via
   `narrative_datasets_describe(dataset_ids: [<id>], include: ["sample"])`
   so you can see what the relevant column actually contains. Only
   enqueue a fresh `narrative_dataset_request_sample` if the existing
   sample is stale or missing.
2. Generate a single revised expression.
3. Validate it: wrap as a select and call `narrative_nql_validate(nql: ...)`.
   If it fails, fix and revalidate.
4. Show the user the revised `expression`, its `confidence`, a one-line
   `reasoning`, and any `warnings`. Keep it terse — one expression,
   one paragraph of justification. No JSON envelope.

Do not re-run the full generation flow for a one-line improvement.
