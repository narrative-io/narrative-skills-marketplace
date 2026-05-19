# Edge cases and gotchas

Read when something feels off — the workflow won't validate, the
graph-edge mapping isn't producing the right columns, identifier
types are showing up in unexpected casings, or the user is asking
about tuning knobs (`maxComponentSize`, `maxDegreeThreshold`).

## The graph-edge attribute schema is fixed

All inputs to the UNION must produce exactly the contract columns:

```
SOURCE_ID, SOURCE_ID_TYPE, TARGET_ID, TARGET_ID_TYPE, IS_DIRECTED, ATTRIBUTES
```

If a dataset's mapping doesn't produce all six, phase 5 of the main
procedure isn't done — re-enter the
`/generate-rosetta-stone-mappings` flow until it does. A common
miss is `IS_DIRECTED` (gets silently dropped because the source
column is implicit); another is `ATTRIBUTES` (often null but still
required structurally).

## Identifier-type strings are case- and spelling-sensitive

The values in `firstPartySources` / `thirdPartySources` must match
the **exact** strings produced by the mapping expressions. If a
mapping emits `'sha256_email'` (lowercase, underscore), don't list
it as `'SHA256_Email'` — the graph job will not match them.

When in doubt, run a quick `narrative_nql_run` against the edge
materialized view:

```sql
SELECT DISTINCT SOURCE_ID_TYPE FROM "<edges_view>"
UNION
SELECT DISTINCT TARGET_ID_TYPE FROM "<edges_view>"
```

Use the result set verbatim to populate the source lists.

## Don't mix directed and undirected edges silently

The `IS_DIRECTED` column is part of the contract. If some sources
are directed and others aren't, surface it in the summary so the
user can decide whether to normalize first. A graph where half the
edges are bidirectional and half aren't will produce surprising
component sizes.

## Third-party schemas are the provider's contract, not yours

Do **not** propose mappings on third-party access rules — they are
read-only outputs of the provider's pipeline. If the user reports
the third-party schema doesn't match the edge contract, the
provider needs to fix it. Flag the mismatch as a global warning
and stop; don't try to wrap a `SELECT` in the UNION to massage it.

## `maxComponentSize` defaults are conservative

The default cap of `100` will exclude the long tail of mega-clusters
caused by leaky identifiers — `null@example.com`, sentinel hashes
like `'00000000...'`, ad-network fallback MAIDs. That's usually
what you want for a production graph; it isn't what you want for
diagnostic runs trying to surface those very leaks.

Call out the defaults explicitly in the phase-8 summary so the user
can raise them when needed. Suggest `maxComponentSize: 10000` and
`maxDegreeThreshold: 1000` for diagnostic-only runs.

## `maxIterations` and convergence

`LabelConnectedComponents` is iterative; `maxIterations: 25` is
fine for most graphs. If the user reports the graph didn't
converge (some components still have multiple labels), raise to
`50` and re-run. Don't push past `100` without a calibration
exercise — at that point the structural issue is usually a
sentinel-identifier leak, not an iteration budget.

## Materialized view names must be globally unique within the namespace

If `narrative_nql_validate` returns a name-collision error on the
`CREATE MATERIALIZED VIEW` statement, ask the user whether to
overwrite the existing view (use `WRITE_MODE = 'overwrite'`,
already in the template) or pick a new name. Defaults:

- View: `<graph_kind>_identity_graph_edges`
- Output dataset: `<graph_kind>_identity_graph`

Append a version suffix (`_v2`, `_v3`) for new generations rather
than mutating an existing graph's output dataset — downstream
consumers may be pinned to it.

## Don't auto-run anything that writes

The materialized-view creation (`narrative_nql_run` on the `CREATE
MATERIALIZED VIEW`) and the workflow submission both produce
durable artifacts in the user's namespace. Confirm explicitly with
the user before either runs. Phase 8 of the main procedure is the
only place writes are allowed, and only after explicit approval.

## Empty UNION inputs

If a first-party dataset is mapped to the graph-edge attribute but
has zero rows that survive the mapping, its `SELECT` block in the
UNION will return nothing — silently. The graph will build fine,
just smaller than expected. Spot-check edge counts per source
before launching the workflow:

```sql
SELECT 'first_party_<id>' AS source, COUNT(*) AS n
FROM COMPANY_DATA.<first_party_dataset>
UNION ALL
SELECT '<provider>.<access_rule>' AS source, COUNT(*) AS n
FROM <provider>.<access_rule>
```

Flag any zero-count source as a warning in the phase-8 summary.
