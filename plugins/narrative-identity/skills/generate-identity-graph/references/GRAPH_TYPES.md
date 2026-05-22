# Per-shape playbooks

Read when scoping a new graph build to confirm shape-specific
defaults. The skill is one workflow shape regardless of graph type
— what differs per shape is the set of input datasets, the
identifier types those datasets emit, and a few tuning-knob
defaults. The phases in the main file run identically for every
shape; this file just captures the per-shape variations.

## Person graph (the default)

User wants to resolve people across two or more first-party CRM /
event datasets, typically keyed on `sha256_email` and `maid` (those
are TARGET_ID_TYPE bridge keys, not source list entries). Run
phases 1-8 in order. Expect `firstPartySources` to be the distinct
SOURCE_ID_TYPE values of the user's first-party systems (e.g.
`first_party_crm`, `first_party_loyalty`); `thirdPartySources` to
be empty unless the user explicitly named providers, in which case
it's the providers' SOURCE_ID_TYPE values (e.g. `acxiom`,
`experian`).

## Household graph

Same shape as a person graph, plus one dataset (often a third-party
householding edge source) that produces edges with
`TARGET_ID_TYPE = 'household_id'` or `'household_address'`. The UNION
gains one or two more `SELECT` blocks. If that new dataset emits a
new SOURCE_ID_TYPE (the household provider's system name), append
it to `thirdPartySources` (or `firstPartySources` if the user owns
the household source). Do **not** add `household_id` or
`household_address` to either list — those are TARGET_ID_TYPE
bridge keys, not source systems. Output dataset name defaults to
`household_identity_graph`.

## Device graph

Inputs are device-side datasets (MAID, IDFA, GAID, cookies, CTV IDs).
Often *no* first-party data — entirely third-party (a device-graph
provider's access rule). If so, phases 3-5 collapse to a single
question: "Which provider's device graph?". Phase 7 emits a workflow
whose UNION is a single `SELECT ... FROM <provider>.<access_rule>`.

## B2B / account graph

Primary identifiers are `domain` and `company_id`; sometimes
`employee_email`. Treat the same as a person graph, but warn the user
in phase 8 that `maxComponentSize: 100` may need to be raised — B2B
graphs frequently have legitimate large clusters (every employee of
a Fortune 500 connects through one domain).

## Evaluate / re-run an existing graph

User points at an existing identity-graph workflow and asks to
"refresh" or "rebuild". Pull the existing workflow's input list,
re-validate each dataset's mapping status (phase 4), and surface
which sources have changed. Append a version suffix (`_v2`,
`_v3`, …) rather than overwriting the existing output dataset —
downstream consumers may be pinned to it.
