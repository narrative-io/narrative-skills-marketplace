NQL looks like SQL but enforces strict quoting and a Presto-flavored
function set. Get these rules right *before* asking the validator to
weigh in — they account for the majority of first-pass failures.

### Table references

Datasets are addressed as `company_data."<dataset_id>"`. The dataset
id is numeric and **must** be double-quoted because it would otherwise
be parsed as a number:

```sql
SELECT col_a, col_b FROM company_data."12345" LIMIT 10
```

For cross-dataset queries, fully qualify each side and alias them:

```sql
SELECT a.id, b.email
FROM company_data."12345" a
JOIN company_data."67890" b ON a.user_id = b.user_id
```

### Identifier vs. literal quoting

Double quotes = identifier. Single quotes = string literal. Reversing
them is the single most common validation error.

| Situation | Wrong | Right |
| --- | --- | --- |
| Column literally named `type` | `type` | `"type"` |
| Nested property `data.value` | `data.value` | `data."value"` |
| Safe column name | (either works) | `email_address` |
| String literal | `"email"` | `'email'` |
| Type discriminator value | `email` | `'email'` |

Reserved words that must always be double-quoted when used as
identifiers: `type`, `value`, `user`, `order`, `group`, `select`,
`from`, `where`, `join`, `case`, `when`, `then`, `else`, `end`,
`null`, `true`, `false`.

### Functions

Supported (Presto-flavored):

- `LOWER(x)`, `UPPER(x)`, `TRIM(x)`
- `COALESCE(x, default)` — rarely needed; see "Null handling" below
- `NULLIF(x, value)`
- `CAST(x AS type)` — types: `string`, `long`, `double`, `boolean`, `timestamp`, `timestamptz`
- `to_timestamp(text, format)` — Presto-style format masks (`%Y`, `%m`, `%d`, `%H`, `%i`, `%s`). `date_parse` / `parse_datetime` are NOT supported.
- `FROM_UNIXTIME(epoch_seconds)`
- `REGEXP_REPLACE(string, pattern, replacement)`, `REGEXP_LIKE(string, pattern)`
- `SUBSTRING(x, start, length)`, `CONCAT(a, b, …)`, `LENGTH(x)`
- Aggregates: `COUNT(*)`, `COUNT(DISTINCT col)`, `SUM`, `AVG`, `MIN`, `MAX`, `APPROX_DISTINCT(col)`

Conditional:

```sql
CASE WHEN condition THEN value
     WHEN other_condition THEN other_value
     ELSE default_value
END
```

### Null handling

The engine propagates nulls automatically. `LOWER(null)` is `null`,
`null = 'x'` is `null`. Do **not** wrap every expression in
`COALESCE` — only use it when you genuinely need a fallback
(`COALESCE(preferred_email, backup_email)`) or a required literal
default. Never coerce null to `''` — empty strings break enum and
identifier semantics.

### Validation error → fix cheat sheet

| Error symptom | Likely cause | Fix |
| --- | --- | --- |
| "syntax error at or near 'type'" | Unquoted reserved word | Quote as `"type"` |
| "column not found" | Wrong identifier name / casing | Re-check schema via `narrative_datasets_describe` |
| "function does not exist" | Wrong function name (e.g., `LCASE`) | Use the function list above |
| "No match found for function signature `date_parse`/`parse_datetime`" | Function not exposed | Use `to_timestamp(text, format)` or `CAST(... AS timestamp)` |
| "cannot cast string to long" | Implicit coercion | Wrap with `CAST(... AS long)` or `NULLIF` |
| "unexpected ELSE without CASE" | Mismatched CASE/END | Count `CASE … END` pairs |

When the local rules above aren't enough — type system edge cases,
window functions, advanced join semantics — query the
`narrative-knowledge-base` MCP server (`/concepts/nql/…`,
`/cookbooks/nql/…`).
