# Edge cases and gotchas

Read when an expression won't validate, an enum-constrained
attribute is involved, you're being asked to fix one property of
an object_mapping, the dataset has columns that don't fit Rosetta
Stone, or a mapping is failing for a reason the body procedure
doesn't address.

## Reserved SQL identifiers MUST be double-quoted

`type`, `value`, `user`, `order`, `group`, `select` are reserved.
Write `column."type"`, never `column.type`. See
`EXPRESSION_SYNTAX.md`.

## Enum constraints are case-sensitive

`'SHA256'` does NOT match `'sha256_email'`. When source values
don't match the enum, generate a `CASE WHEN` and lower confidence.
See `ENUM_HANDLING.md`.

## Null handling is automatic at runtime

Do NOT add `COALESCE` to mask nulls and do NOT flag null inputs as
edge cases. Nulls in test results from null inputs are expected.

## Object-mapping property_mappings is replace-all

When suggesting a fix to one property of an object mapping, include
*every* existing property_mapping in the suggested mapping — the
API replaces the whole array.

## Custom attributes are a fallback, not a primary path

Only mention them in the summary when (a) zero Rosetta Stone
matches exist for the dataset, or (b) several columns are clearly
proprietary (internal_id, custom_metric_x, etc.).

## Don't paraphrase the attribute catalog

If you'd benefit from the attribute description, just call
`narrative_attributes_describe` — don't reason from the search
snippet alone.

## Mapping confidence ≠ NQL validity

A 100% valid NQL expression can still be a low-confidence mapping
(e.g., `name` column → first name attribute vs full name attribute).
Validate syntactically, then score semantically.

## Token economy

Prefer the existing sample returned by
`narrative_datasets_describe(include: ["sample"])` over enqueuing a
fresh `narrative_dataset_request_sample` job. The existing sample
is almost always enough to spot the patterns this skill needs, and
re-sampling costs a job round-trip.

## Skip underscore-prefixed columns

Columns starting with `_` (e.g., `_nio_last_modified_at`,
`_nio_sample_128`) are reserved platform-managed columns. The
platform auto-generates mappings for them when needed (tagged
`nio_system` / `nio_dataset_implicit_attribute` in `mappings[]`).
Don't propose mappings for them and don't list them as unmapped in
warnings.
