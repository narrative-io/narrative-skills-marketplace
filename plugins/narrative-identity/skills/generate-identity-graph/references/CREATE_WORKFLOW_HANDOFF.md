# `/create-workflow` substitution catalog

Read in phase 8 of the main procedure. This file holds the full
substitution catalog passed to `/create-workflow` when handing off
the identity-graph build. The example loaded by `/create-workflow`
is `assets/examples/11-identity-graph-multi-source-build.yaml`.

The phase-8 step in the main file owns the trigger and high-level
control flow (when to fire, when to retry, how to interpret the
return value); this file holds the verbose per-field substitution
shape so the main is shorter to read.

## Invocation shape

> `/create-workflow` Build the identity-graph workflow from
> `assets/examples/11-identity-graph-multi-source-build.yaml`.
> Substitute:
>
> - `document.namespace`: `<kebab-case slug of the company name returned by narrative_context_get>`
> - `document.name`: `<graph-kind>-identity-graph` (from phase 1 —
>   `person-identity-graph`, `household-identity-graph`, etc.;
>   append a qualifier if the user gave one, e.g. `us-person-identity-graph`)
> - **Per-dataset mapping tasks** (one
>   `CreateRosettaStoneMappingsIfNotExist` task per entry in
>   `pending_mappings` from phase 5, in the order the datasets
>   appear in the `createEdges` UNION). Use this shape, substituting
>   the per-dataset `propertyMappings`:
>
>   ```yaml
>   - map<DatasetSlug>:
>       call: CreateRosettaStoneMappingsIfNotExist
>       with:
>         datasetName: <dataset id or slug>
>         allowPartial: true
>         mappings:
>           - attributeId: <graph-edge attribute ID from phase 4>
>             mapping:
>               type: object_mapping
>               propertyMappings:
>                 - path: SOURCE_ID
>                   expression: <NQL from phase 5>
>                 - path: SOURCE_ID_TYPE
>                   expression: <NQL from phase 5>
>                 - path: TARGET_ID
>                   expression: <NQL from phase 5>
>                 - path: TARGET_ID_TYPE
>                   expression: <NQL from phase 5>
>                 - path: IS_DIRECTED
>                   expression: <NQL from phase 5>
>                 - path: ATTRIBUTES
>                   expression: <NQL from phase 5>
>   ```
>
>   Datasets that phase 4 reported as already-mapped do not need a
>   task — `CreateRosettaStoneMappingsIfNotExist` is idempotent, but
>   re-emitting an existing mapping is wasted effort.
>
>   Third-party access rules do NOT get mapping tasks — their
>   schemas are the provider's contract.
>
> - The `createEdges.with.nql` block: replace verbatim with this
>   already-validated NQL string. Do not modify it.
>
>   ```
>   <full NQL string returned by /write-nql in phase 7>
>   ```
>
> - `labelComponents.with.edgeDataset`: `<edges-view-name>` (the
>   view created by `createEdges` above)
> - `labelComponents.with.outputDataset`: `<graph-output-dataset-name>`
> - `labelComponents.with.firstPartySources`: `[<distinct
>   **SOURCE_ID_TYPE** values emitted by the first-party datasets>]`.
>   **Only SOURCE_ID_TYPE values belong here** — TARGET_ID_TYPE
>   bridge keys (`sha256_email`, `maid`, `household_id`, etc.) must
>   not appear in either list. Discover the values empirically: ask
>   for column statistics on the edges materialized view, or have
>   `/write-nql --run` execute `SELECT DISTINCT SOURCE_ID_TYPE FROM
>   <edges_view>` (split by contributing dataset) once the view
>   exists. On a first build where the view doesn't exist yet, derive
>   the candidate values from the mapping expressions in phase 5
>   (the literal each `SOURCE_ID_TYPE` `propertyMapping` emits) and
>   ask the user to confirm; never invent values.
> - `labelComponents.with.thirdPartySources`: `[<distinct
>   **SOURCE_ID_TYPE** values emitted by the third-party access
>   rules; empty array if none>]`. Same discovery rule as above —
>   query the data, never the bridge-key types.
> - `labelComponents.with.maxDegreeThreshold`: `100` (default)
> - `labelComponents.with.maxComponentSize`: `100` (default — surface
>   the default in your approval summary so the user can override
>   for B2B / household graphs)
> - `labelComponents.with.maxIterations`: `25` (default)

## Execution flags

Pass any user-requested execution flags through the same invocation
— `--trigger` if the user asked for an immediate run, `--data-plane
<id>` if they already named a plane, `--schedule` if they want the
cron activated on create (only valid if the user explicitly asked
for a schedule, which this skill does not add by default — the
example has no `schedule:` block).

If the user did **not** name a plane, do not invent one here;
`/create-workflow` will ask. Same for trigger / schedule — let
`/create-workflow` own those gates.

## What `/create-workflow` runs end-to-end

1. Loads example 11.
2. Substitutes the values above.
3. Resolves the data plane (asks if not provided).
4. Renders the YAML and explains it to the user.
5. Gates submission on explicit user approval.
6. Calls `narrative_workflows_create`.
7. Optionally triggers the first run.

When `/create-workflow` returns, take its result — workflow ID,
data-plane ID, status, optional run ID — and feed it to the
"Final summary format" section of the main file, where you wrap it
with the identity-graph context (input datasets, identifier types,
output graph dataset) that `/create-workflow` does not know about.

Do not retry `/create-workflow` blindly on submission failure. If
it returns a validator error, surface the verbatim error to the
user, decide together what to fix (a misnamed identifier type, a
wrong-plane dataset, a non-default tuning knob the user wants), and
re-invoke `/create-workflow` with the corrected substitutions.
