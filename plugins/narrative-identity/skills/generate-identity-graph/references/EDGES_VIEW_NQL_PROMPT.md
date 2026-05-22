# Edges-view `/write-nql` prompt template

Read in phase 7 of the main procedure. This file holds the verbatim
prompt body that gets passed to `/write-nql` (with `--no-explain`,
no `--run`) so it drafts and server-validates the
`CREATE MATERIALIZED VIEW` statement that becomes
`createEdges.with.nql` in the phase-8 workflow.

The phase-7 step in the main file owns the contract:

- Substitute values from phases 0 (`audit_filters`), 1 (graph kind,
  display name, description), 3 (first-party datasets), 4
  (graph-edge attribute name slug), 5 (`pending_mappings`), 6
  (third-party access rules).
- Pass the result to `/write-nql --no-explain` (without `--run`).
- Take the returned NQL string verbatim and pass it through to
  `/create-workflow` in phase 8.

## Prompt body

> Write a `CREATE MATERIALIZED VIEW "<edges-view-name>"` statement
> with:
>
> - `DISPLAY_NAME = '<display name from phase 1>'`
> - `DESCRIPTION = '<one-sentence description from phase 1>'`
> - `TAGS = ('<graph-kind>', 'identity-graph')`
> - `WRITE_MODE = 'overwrite'`
>
> The body should `SELECT DISTINCT` the six graph-edge contract
> columns (`SOURCE_ID`, `SOURCE_ID_TYPE`, `TARGET_ID`,
> `TARGET_ID_TYPE`, `IS_DIRECTED`, `ATTRIBUTES`) from each dataset
> using the Rosetta Stone graph-edge attribute access pattern, NOT
> the dataset's raw column names. Alias the FROM clause (use a short
> per-source slug) so the SELECT list doesn't have to repeat the
> full dataset path on every column. Each `SELECT` block should
> follow this exact shape:
>
> ```
> SELECT DISTINCT
>   <alias>._rosetta_stone.<graph_edge_attribute_name>.SOURCE_ID       AS SOURCE_ID,
>   <alias>._rosetta_stone.<graph_edge_attribute_name>.SOURCE_ID_TYPE  AS SOURCE_ID_TYPE,
>   <alias>._rosetta_stone.<graph_edge_attribute_name>.TARGET_ID       AS TARGET_ID,
>   <alias>._rosetta_stone.<graph_edge_attribute_name>.TARGET_ID_TYPE  AS TARGET_ID_TYPE,
>   <alias>._rosetta_stone.<graph_edge_attribute_name>.IS_DIRECTED     AS IS_DIRECTED,
>   <alias>._rosetta_stone.<graph_edge_attribute_name>.ATTRIBUTES      AS ATTRIBUTES
> FROM <dataset_reference> AS <alias>
> [WHERE <audit filters>]
> ```
>
> Pick a 2–4 character alias per source that's mnemonic for the
> dataset (e.g., `fpc` for `first_party_crm_events`, `aci` for
> `acxiom.consumer_identity_v3`). Aliases must be unique within the
> statement.
>
> Use the **graph-edge attribute name slug** returned by
> `/find-attribute` in phase 4 (e.g., `graph_edge`) — not the
> numeric attribute ID. UNION ALL every SELECT block in the order
> listed. Apply the listed `WHERE`-clause conditions to each
> dataset as given — they're pre-flight audit filters and must be
> preserved verbatim (combine multiple conditions with `AND`):
>
> Graph-edge attribute name (use verbatim in the
> `_rosetta_stone.<name>` access path): `<attribute name slug from
> phase 4>`
>
> First-party datasets (use `company_data.<id>`):
>   - `<first_party_dataset_id_1>`
>     filters: `<expression>`, `<expression>`
>   - `<first_party_dataset_id_2>`
>     filters: (none)
>   - …
>
> Third-party datasets (use `<provider>.<access_rule>`):
>   - `<provider_1>.<access_rule_1>`
>     filters: `<expression>`
>   - …
>
> Validate the statement and return it. Don't run it.

## Why the access pattern, not raw columns

Each first-party dataset is mapped to the graph-edge Rosetta Stone
attribute as a preceding workflow task (see phase 8). Querying
through the `_rosetta_stone.<name>` field gives the six contract
columns without coupling the workflow to native column names —
different datasets emit different native columns, but every mapped
dataset exposes the same graph-edge access path.

Third-party access rules are also queried through
`_rosetta_stone.<name>`. The provider is responsible for mapping
their access rule to the graph-edge attribute; the workflow does
not map them. If a third party's access rule does not expose the
graph-edge attribute, drop it from the input list — surface the
gap to the user before continuing.

## Threading audit filters

When building the prompt, look up each dataset's entries in
`audit_filters` from phase 0. If a dataset has one or more approved
filters, list them under that dataset; if it has none, write
"filters: (none)" so `/write-nql` doesn't add anything it wasn't
told to add. Do not silently drop filters — every approved filter
must appear in the prompt.

## Validation-failure recovery

If `/write-nql` reports validation failure after its own internal
retries (a referenced dataset doesn't exist, a column is named
differently than the contract expects, an audit-filter expression
references a column the dataset doesn't have), surface the verbatim
error to the user, ask whether to drop the offending dataset / drop
the offending filter / remap, and re-invoke `/write-nql` with the
corrected input list. Do **not** hand an unvalidated DDL to phase 8.
Do **not** drop an audit filter without explicit user approval — the
user already approved each one in phase 0b.
