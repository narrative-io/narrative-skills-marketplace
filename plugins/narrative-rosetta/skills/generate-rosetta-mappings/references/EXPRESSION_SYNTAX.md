# NQL / SQL expression syntax for Rosetta Stone mappings

Mapping expressions are evaluated by the Narrative NQL engine. They
look like SQL but with quoting rules that trip up most agents on the
first try.

Always validate with `narrative_nql_validate(dataset_id, expression)`
before suggesting an expression to the user.

## Quoting rules

Reserved identifiers MUST be double-quoted when used as column or
property names:

`type`, `value`, `user`, `order`, `group`, `select`, `from`, `where`,
`join`, `case`, `when`, `then`, `else`, `end`, `null`, `true`, `false`

Safe column names can be unquoted: `email_address`, `user_name`,
`created_at`, `device_id`.

| Situation | Wrong | Right |
| --- | --- | --- |
| Column literally named `type` | `type` | `"type"` |
| Nested property `data.value` | `data.value` | `data."value"` |
| Safe column | `"email_address"` (works but noisy) | `email_address` |
| String literal | `"email"` | `'email'` |
| Identifier discrimnator | `email` | `'email'` (it's a *value*, not a column) |

Double quotes = identifier. Single quotes = string literal. Mixing them
up is the #1 cause of NQL validation errors.

## Functions

Common, NQL-supported:

- `LOWER(x)`, `UPPER(x)`, `TRIM(x)`
- `COALESCE(x, default)` — but see "null handling" below; usually unneeded
- `NULLIF(x, value)`
- `CAST(x AS type)` — types: `string`, `long`, `double`, `boolean`, `timestamptz`
- `REGEXP_REPLACE(string, pattern, replacement)`
- `SUBSTRING(x, start, length)`
- `CONCAT(a, b, ...)`

Conditional:

```sql
CASE WHEN condition THEN value
     WHEN other_condition THEN other_value
     ELSE default_value
END
```

CASE WHEN expressions are the workhorse for enum normalization — see
`ENUM_HANDLING.md`.

## Null handling

The NQL engine automatically propagates nulls at runtime. You almost
never need `COALESCE` in a mapping expression:

- Source column is null → output is null (correct behavior, not a bug).
- `LOWER(null_email)` → null (no need to wrap in COALESCE).
- Sample-data test results showing nulls when input was null are
  expected; don't flag them as edge cases.

Use `COALESCE` only when:

- You're combining two source columns and want to fall back
  (`COALESCE(preferred_email, backup_email)`).
- You're producing a literal default that the target attribute requires
  (rare).

Never use `COALESCE(x, '')` to convert null to empty string — empty
strings break enum matching and identifier comparison.

## Type discriminators in object_mappings

For object attributes with a `type` property (e.g., the standard
Identifier object: `{ type, value }`), the `type` expression is almost
always a **literal string**, not a column reference:

```json
{ "path": "type", "expression": "'email'" }
```

If you find yourself writing `{ "path": "type", "expression": "some_column" }`,
double-check: is every sampled value of `some_column` already in the
attribute's enum? If not, you need a CASE WHEN — see `ENUM_HANDLING.md`.

## Examples by Rosetta Stone shape

### Primitive identifier (email)

```json
{
  "type": "value_mapping",
  "expression": "LOWER(TRIM(email_address))"
}
```

### Hashed-identifier object (sha256_email)

```json
{
  "type": "object_mapping",
  "property_mappings": [
    { "path": "type",  "expression": "'sha256_email'" },
    { "path": "value", "expression": "LOWER(hashed_email_sha256)" }
  ]
}
```

### Mixed-hash identifier (one column holds the hash type)

```json
{
  "type": "object_mapping",
  "property_mappings": [
    { "path": "type",  "expression": "CASE WHEN hash_algo = 'SHA256' THEN 'sha256_email' WHEN hash_algo = 'MD5' THEN 'md5_email' WHEN hash_algo = 'SHA1' THEN 'sha1_email' ELSE NULL END" },
    { "path": "value", "expression": "LOWER(hashed_value)" }
  ]
}
```

### Reserved-name nested property

If the source data has a struct column `payload` with subfields `type`
and `value`:

```json
{
  "type": "object_mapping",
  "property_mappings": [
    { "path": "type",  "expression": "payload.\"type\"" },
    { "path": "value", "expression": "payload.\"value\"" }
  ]
}
```

### Timestamp normalization

```json
{
  "type": "value_mapping",
  "expression": "CAST(event_ts AS timestamptz)"
}
```

If the source is an epoch-seconds long, cast through a TO_TIMESTAMP
function (validate with `narrative_nql_validate` — exact function name
varies by engine generation).

## When validation fails

`narrative_nql_validate` returns an error pointing to a position in
the expression. Common fixes:

| Error symptom | Likely cause | Fix |
| --- | --- | --- |
| "syntax error at or near 'type'" | Unquoted reserved word | Quote with `"type"` |
| "column not found" | Wrong identifier name / casing | Re-check with `narrative_datasets_describe` |
| "function does not exist" | Wrong function name (e.g., `LCASE` instead of `LOWER`) | Use the function table above |
| "cannot cast string to long" | Implicit type coercion | Wrap with `CAST(..., AS long)` or use NULLIF |
| "unexpected ELSE without CASE" | Mismatched CASE/END | Count CASE … END pairs |

Re-validate after every fix. Never suggest a mapping with an
expression you have not personally validated against the target
dataset's schema.
