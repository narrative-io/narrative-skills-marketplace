# Edge cases and gotchas

Read when something feels off — the workflow won't validate, the
graph-edge mapping isn't producing the right columns, identifier
types are showing up in unexpected casings, or the user is asking
about tuning knobs (`maxComponentSize`, `maxDegreeThreshold`).

## The graph-edge attribute schema is fixed and bipartite

All inputs to the UNION must produce exactly the contract columns:

```
SOURCE_ID, SOURCE_ID_TYPE, TARGET_ID, TARGET_ID_TYPE, IS_DIRECTED, ATTRIBUTES
```

The schema is bipartite, and the asymmetry is usually load-bearing:

- **SOURCE_ID / SOURCE_ID_TYPE**: typically the *less shared* side
  — often an identifier unique within one source system (a UUID,
  an auto-increment customer_id, a local-namespace member ID).
  `SOURCE_ID_TYPE` names the source (a source system like
  `first_party_crm`, or a third-party provider like `acxiom`,
  `experian`).
- **TARGET_ID / TARGET_ID_TYPE**: typically the *shared join key*
  — a value that recurs across sources and lets the graph stitch
  components together (a hashed email, an E.164 phone hash, a
  MAID). `TARGET_ID_TYPE` names the join-key type.

"Typically" matters: third-party providers occasionally publish
edges where both sides are shared identifier types and the
asymmetry inverts. Spot-check by asking whether the SOURCE_ID
value would ever appear in *another* dataset — if yes, it may be
behaving as a join key and you should at least confirm the
producer intended that.

If a dataset's mapping doesn't produce all six contract columns,
phase 5 of the main procedure isn't done — re-enter the
`/generate-rosetta-stone-mappings` flow until it does. A common
miss is `IS_DIRECTED` (gets silently dropped because the source
column is implicit); another is `ATTRIBUTES` (often null but still
required structurally).

## The workflow owns mapping application

The mapping draft `/generate-rosetta-stone-mappings` returns in
phase 5 is **not** applied before the workflow runs. The workflow
itself applies it via `CreateRosettaStoneMappingsIfNotExist` tasks
chained before `createEdges`. That makes re-runs self-healing —
adding a dataset just means appending another mapping task — but
also means that if you delete the workflow before its first run,
your draft mapping never lands. The mapping only persists when the
workflow successfully executes.

The task is idempotent: existing identical mappings show up in
`conflictMappings` rather than as failures, so re-running the
workflow is safe. `allowPartial: true` (default) lets one mapping
fail without aborting the others — useful when one dataset's draft
needs a small fix but the others are correct. Flip to `false` only
if you want any mapping failure to fail the whole workflow.

## `firstPartySources` / `thirdPartySources` are SOURCE_ID_TYPE values only

Both lists hold the distinct **SOURCE_ID_TYPE** values from the
unioned edges, partitioned by which inputs are first-party vs
third-party (e.g. `first_party_crm`, `first_party_loyalty`,
`acxiom`, `experian`). They do **not** hold TARGET_ID_TYPE values
(the bridge keys like `sha256_email`, `maid`, `household_id`).
Putting bridge keys in either list silently breaks priority
resolution — the graph job will not match them against any edge's
SOURCE_ID_TYPE and they'll behave as if absent.

The strings are also case- and spelling-sensitive: they must match
the **exact** values produced by the mapping expressions. If a
mapping emits `'first_party_crm'` (lowercase, underscore), don't
list it as `'First_Party_CRM'`.

### Discover them empirically — don't guess

Pull the SOURCE_ID_TYPE values from the data itself, not from
memory or the mapping spec:

- **Dataset statistics**: once the edges materialized view exists,
  ask for column stats on `SOURCE_ID_TYPE` — the distinct-values
  enumeration is what populates the source lists.
- **Distinct query**: ask `/write-nql --run` to run something like
  "show me all the distinct values of `SOURCE_ID_TYPE` in
  `<edges_view>`, optionally split by contributing dataset" so you
  can label which values came from first-party datasets vs
  third-party access rules. Use the result set verbatim. Don't
  hand-author the probe — let `/write-nql` write and validate it.

Same pattern applies to `TARGET_ID_TYPE` if you need to confirm
the bridge keys for `bridgeKeyTypeCol` — query, don't guess.

This matters more under the in-workflow mapping model:
`labelComponents.with.firstPartySources` is set at workflow-author
time (in phase 8's `/create-workflow` handoff), but the actual
SOURCE_ID_TYPE values won't exist in the edge view until the
workflow has run for the first time. If you set the wrong values,
`LabelConnectedComponents` will silently find zero edges from those
sources — the graph builds but is empty in surprising ways.
Spot-check the unioned edges view after the first run before
relying on the graph.

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

Call out the defaults explicitly in the phase-8 handoff to
`/create-workflow` so its approval summary shows them and the user
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

If `/write-nql` reports a name-collision error during phase 7
validation of the `CREATE MATERIALIZED VIEW` statement, ask the
user whether to overwrite the existing view (use
`WRITE_MODE = 'overwrite'`, already in example 11) or pick a new
name. Defaults:

- View: `<graph_kind>_identity_graph_edges`
- Output dataset: `<graph_kind>_identity_graph`

Append a version suffix (`_v2`, `_v3`) for new generations rather
than mutating an existing graph's output dataset — downstream
consumers may be pinned to it.

## Don't auto-run anything that writes

The materialized-view creation (delegated to `/write-nql --run`)
and the workflow submission both produce durable artifacts in the
user's namespace. Confirm explicitly with the user before either
runs. The workflow submit gate lives inside `/create-workflow` and
fires only after explicit user approval of the rendered YAML;
spot-check edge creation only runs if the user opts in.

## Empty UNION inputs

If a first-party dataset is mapped to the graph-edge attribute but
has zero rows that survive the mapping, its contribution to the
UNION will be empty — silently. The graph will build fine, just
smaller than expected. Spot-check edge counts per source before
handing off to `/create-workflow` by asking `/write-nql --run` for
a labeled per-source count across the first-party and third-party
inputs. Flag any zero-count source as a warning in the phase-8
handoff so `/create-workflow`'s approval summary surfaces it.
