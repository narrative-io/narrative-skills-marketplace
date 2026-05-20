# Example workflow index

Route an intent to the smallest example that already encodes the right
shape. Read the matching `examples/*.yaml`, adapt the bracketed values
to the user's situation, and only invent structure the user actually
needs. Each example file's leading comment block documents when to use
it and the gotchas that apply.

| Intent | Example | Tasks used |
|--------|---------|-----------|
| Persist a `SELECT` as a queryable dataset | [`examples/01-single-materialized-view.yaml`](examples/01-single-materialized-view.yaml) | `CreateMaterializedViewIfNotExists` |
| Pull newer rows into an existing view | [`examples/02-refresh-existing-view.yaml`](examples/02-refresh-existing-view.yaml) | `RefreshMaterializedView` |
| Multi-step pipeline; later tasks depend on earlier outputs | [`examples/03-multi-step-pipeline.yaml`](examples/03-multi-step-pipeline.yaml) | `CreateMaterializedViewIfNotExists`, `RefreshMaterializedView` |
| Pass metadata (dataset ID, row count) between tasks | [`examples/04-data-passing-export-context.yaml`](examples/04-data-passing-export-context.yaml) | `CreateMaterializedViewIfNotExists`, `ExecuteDml`, `export`, `${...}` |
| Run on a cron schedule | [`examples/05-scheduled-daily-refresh.yaml`](examples/05-scheduled-daily-refresh.yaml) | `schedule.cron`, `RefreshMaterializedView` |
| Productionize Rosetta Stone mappings idempotently | [`examples/06-create-rosetta-stone-mappings.yaml`](examples/06-create-rosetta-stone-mappings.yaml) | `CreateMaterializedViewIfNotExists`, `CreateRosettaStoneMappingsIfNotExist` |
| Cross-system identity resolution | [`examples/07-identity-resolution-label-components.yaml`](examples/07-identity-resolution-label-components.yaml) | `LabelConnectedComponents` |
| Write an audit-log row alongside a step | [`examples/08-dml-audit-log.yaml`](examples/08-dml-audit-log.yaml) | `RefreshMaterializedView`, `ExecuteDml`, `export` |
| Run an LLM inside the pipeline | [`examples/09-run-model-inference.yaml`](examples/09-run-model-inference.yaml) | `RunModelInference` |
| Capture a sample after refreshing | [`examples/10-dataset-sample-after-refresh.yaml`](examples/10-dataset-sample-after-refresh.yaml) | `RefreshMaterializedView`, `CreateDatasetSample` |

If none match the user's intent precisely, start from
[`templates/workflow-skeleton.yaml`](templates/workflow-skeleton.yaml)
and combine task patterns from the closest examples.
