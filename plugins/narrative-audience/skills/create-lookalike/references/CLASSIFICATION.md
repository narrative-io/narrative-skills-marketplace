# Attribute classification

How to turn a dataset's Rosetta Stone surface into the model's
inputs: identity join keys, categorical features, and continuous
features. These rules mirror Lookalike Studio's classifier; apply
them mechanically and show the user the result for approval.

## Inputs

For each dataset (`narrative_datasets_describe` with schema and
mappings; `narrative_dataset_get_column_stats` for statistics):

- The dataset's **mapped Rosetta Stone fields** — the dot-notation
  paths under `_rosetta_stone.` that its attribute mappings expose
  (e.g. `_rosetta_stone.unique_id.value`,
  `_rosetta_stone.merchant.name`).
- The **attribute definitions** behind those mappings (type, enum
  values, `is_join_key`), from the describe payload or
  `narrative_attributes_search` / the attribute catalog.
- **Column statistics** for the raw columns each Rosetta Stone field
  maps from — cardinality and histograms.

## Field eligibility

Consider only leaf fields under `_rosetta_stone.`. Exclude:

- `_rosetta_stone.narrative_id*` fields.
- Fields whose label starts with `_nio`.
- `object` and `array` containers (their scalar leaves are
  considered individually).
- Raw (non-Rosetta-Stone) dataset columns — they have no shared
  semantics across datasets and are treated as metadata.

## Role

Evaluate in order; first match wins:

1. **Metadata** — field type is `timestamptz`/`timestamp`.
   Timestamps don't enter the model.
2. **Identity** — the leaf attribute has `is_join_key: true`, OR a
   sibling property of the same parent object attribute does (e.g.
   `unique_id.type` is identity because `unique_id.value` is the
   join key — the whole object travels together).
3. **Feature** — everything else.

## Type (features only)

- Attribute/field type `long` or `double` → **continuous**.
- Everything else (string, boolean, enum, …) → **categorical**.

## Feature eligibility filter

A feature attribute enters the model only if at least one holds:

- It has **enum values** (from the attribute definition, or as a
  fallback the column histogram's value keys), or
- Its **cardinality is known and < 10,000**. Resolve cardinality
  from the mapped raw column's statistics: `count_distinct`, else
  `approx_count_distinct`, else the number of histogram keys; if
  none is available the cardinality is unknown and the feature is
  **ineligible** (suggest `/profile-dataset --allow-recalc` to
  refresh stats if the user wants it in).

Identity attributes are exempt from this filter.

## Join-key selection

From the identity attributes, the **join keys** used for identity
expansion are those whose field path ends in `.value` or contains no
dot (the actual key values — not `.type`/`.context` siblings). If
none match, fall back to all identity attributes. If a dataset has
no identity attributes at all, stop: the pipeline cannot build a
join key, and the user needs Rosetta Stone identity mappings first
(`/generate-rosetta-stone-mappings`).

Run this selection for **both** datasets — the population's join keys
drive stage 1, the seed's drive stage 2.

## Shared-identity requirement

In the pipeline, `id_type` is the join-key attribute's alias (field
path minus `_rosetta_stone.`, dots → underscores). Seed and
population rows only match where aliases AND values coincide, so at
least one alias must appear in both join-key sets. No overlap → the
seed labeling join matches nothing, every candidate scores as if the
seed were empty, and the output is garbage. Stop and show both sides'
identity attributes instead.

## Extraction expressions

The NQL expression for a field, used verbatim in stage 1–2 templates:

- Rosetta Stone field `_rosetta_stone.a.b` on dataset `ds`:
  `company_data."ds"."_rosetta_stone"."a"."b"` — every path segment
  individually double-quoted.
- (Raw column `col`, identity-exempt cases only:
  `company_data."ds"."col"`.)

## Output of this phase

Two structures, presented to the user as tables before anything is
built:

1. **Population model inputs** — join keys (alias + field), and the
   eligible features split into categorical (alias, cardinality or
   enum count) and continuous (alias).
2. **Seed join keys** — alias + field, with the shared aliases
   marked.

The user may exclude any feature; exclusions are honored exactly.
More than ~8 categorical features → recommend trimming (combo
explosion and Naive-Bayes double counting; see PIPELINE.md's known
modeling limitation).
