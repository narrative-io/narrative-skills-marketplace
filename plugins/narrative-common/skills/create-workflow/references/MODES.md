# Worked recipes per intent

The intent → example router at step 2 of `SKILL.md` maps the user's
free-text ask to a single starting example. This file expands that
router into fuller per-recipe walkthroughs: which example(s) to
combine, what to confirm with the user, and how to invoke
`narrative_workflows_create`. Consult it when the one-line router
hit doesn't tell you enough to draft confidently.

## Wrap-NQL — "Wrap this NQL as a recurring daily view refresh"

Intent: the user has an existing NQL query and wants it to run every
day, persisted to a queryable view.

Start from `examples/01-single-materialized-view.yaml` + the
`schedule:` block from `examples/05-scheduled-daily-refresh.yaml`.
The result is one workflow that creates the view (idempotent) and, on
subsequent days, refreshes it via a separate `RefreshMaterializedView`
task. Submit with `--schedule` so the cron activates on create.

## Multi-step pipeline — "Build dataset A, then derive B from it"

Intent: a two-step pipeline where the second task can only run after
the first persists.

Start from `examples/03-multi-step-pipeline.yaml`. Confirm that the
second task references the first task's output by name
(`company_data.<dataset_name>`) — workflows run sequentially, so the
dataset will exist by the time the second task runs.

## Refresh + audit — "Refresh the view, then write a row to the audit log"

Intent: a refresh + an audit insert that captures the dataset ID.

Start from `examples/08-dml-audit-log.yaml`. The pattern combines
`RefreshMaterializedView`, `export` of `datasetId` into `$context`,
and a downstream `ExecuteDml` that interpolates the ID into an
`INSERT`. The audit table must already exist — confirm before
submitting.

## Identity-nightly — "Run customer identity resolution nightly"

Intent: a scheduled bipartite label-propagation job that produces a
canonical-component dataset from an edge table.

Start from `examples/07-identity-resolution-label-components.yaml`
and add a `schedule:` block from `examples/05-…`. Confirm with the
user the priority order of `firstPartySources` — it determines which
source ID wins as the component representative.

## Submit-existing — "Submit this YAML I already have"

Intent: the user has an existing spec (paste, file, prior draft).

Take `--spec <path>` (or paste contents). Skip drafting. Go straight
to step 5 (data plane), step 6 (render + explain), step 7 (gate), and
step 8 (submit). Do not silently modify the user's YAML — surface any
issues you spot and ask before changing anything.
