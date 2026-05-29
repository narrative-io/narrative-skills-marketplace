# Dataset Describe — Deep Semantics

Reference for the deep details behind step 2's
`narrative_datasets_describe` call: which `include` fields to opt
into, how to split-describe a wide schema, and how to treat the
underscore-prefixed columns the platform reserves for itself.

The happy path — one call with the broad include — covers most
datasets. Reach for this file when the schema is wide enough to
truncate the response, when you need to be deliberate about which
fields you pull, or when you hit reserved-column noise.

## The `include` allowlist

Describe the dataset, **opting into every field this flow uses**
(the default is just `metadata + schema`):

```
narrative_datasets_describe(
  dataset_ids: [<id>],
  include: ["metadata", "schema", "mappings", "stats", "sample"]
)
```

`dataset_ids` is an array — pass up to 50 IDs to describe multiple
datasets in one call. The `include` allowlist is
`column_stats_config, mappings, metadata, nql, retention_policy,
sample, schema, stats`.

What to extract from the response:

- Column list with types (always present via `schema`)
- Existing mappings (only present when you `include: ["mappings"]`).
  If `mappings[]` is non-empty, the task is evaluation or incremental
  — see [`MODES.md`](MODES.md).
- Most recent sample rows (only present when you `include: ["sample"]`)
- Per-column stats summary (only present when you `include: ["stats"]`)
- Dataset name, record count, freshness — from `metadata`, used for the summary

## Split-describe pattern for wide schemas

If the dataset is small or unfamiliar, the broad include above gives
you everything in one round trip. For very wide schemas, split:
describe once with `include: ["metadata", "schema", "mappings"]` to
scope which columns matter, then delegate per-column coverage & quality
to `/profile-dataset` with a `--focus` list (step 3) rather than pulling
and interpreting `sample` / `stats` here.

**Stop and confirm with the user if**: the dataset has 50+ columns and
the user gave no scoping hint. Ask which columns or which Rosetta
Stone domain (identity, demographics, behavior, geo, etc.) they care
about. Mapping a 200-column dataset blind is rarely what they meant.

## Underscore-prefixed columns

**Skip underscore-prefixed columns.** Columns whose names start with
`_` (e.g., `_nio_last_modified_at`, `_nio_sample_128`) are reserved
platform-managed columns. The platform generates the mappings it needs
for them automatically (typically tagged `nio_system` /
`nio_dataset_implicit_attribute` in `mappings[]`). Do not propose
user-facing mappings for them, and do not score them as "unmapped" in
warnings.
