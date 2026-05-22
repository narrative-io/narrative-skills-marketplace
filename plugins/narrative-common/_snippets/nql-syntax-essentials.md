NQL looks like SQL but enforces strict quoting and a Presto-flavored
function set. Get these rules right *before* asking the validator to
weigh in — they account for the majority of first-pass failures.

### Table references

Use `company_data.<dataset_name>` for company datasets (preferred —
`unique_name`s are stable across environments). Fall back to
`company_data."<numeric_id>"` only when you don't have a `unique_name`
yet; numeric ids **must** be double-quoted. Cross-company access rules
live under the provider's slug schema (e.g. `acme."ar_fitness"`), and
global identity resolution lives at `narrative.rosetta_stone`. See
[`references/NQL_QUOTING_AND_TABLE_REFS.md`](references/NQL_QUOTING_AND_TABLE_REFS.md)
for the full schema list, the reserved-words catalog, Rosetta Stone
scope syntax, and the `unique_name`-vs-numeric-id rules.

```sql
-- Preferred: address by unique_name
SELECT user_id, email FROM company_data.web_events LIMIT 10

-- Fallback: address by numeric id (quoted)
SELECT user_id, email FROM company_data."12345" LIMIT 10
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

The full reserved-words list and quoting deep-dive lives in
[`references/NQL_QUOTING_AND_TABLE_REFS.md`](references/NQL_QUOTING_AND_TABLE_REFS.md).

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
- Aggregates: `COUNT(1)`, `COUNT(<col>)`, `COUNT(DISTINCT col)`, `SUM`, `AVG`, `MIN`, `MAX`, `APPROX_COUNT_DISTINCT(col)`. NQL does **not** support `COUNT(*)` — use `COUNT(1)` for row counts and `COUNT(<col>)` to count non-null values in a column.

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

### Common NQL gotchas

> Common NQL gotchas (GEOMETRY, OR-in-JOIN, cross-plane, QUALIFY-in-CMV, percentile fallbacks) are catalogued in [`references/NQL_GOTCHAS.md`](references/NQL_GOTCHAS.md). Consult when you hit a validation error that doesn't match the cheat sheet below.

### Validation error → fix cheat sheet

> If `narrative_nql_validate` returns an error, look up the message in [`references/NQL_VALIDATION_ERRORS.md`](references/NQL_VALIDATION_ERRORS.md) for the canonical fix.

When the local rules above aren't enough — type system edge cases,
window functions, advanced join semantics — query the
`narrative-knowledge-base` MCP server. Useful entry points:

- `/guides/nql/troubleshooting` and its sub-pages (`unsupported-type-error`, `cross-data-plane-queries`) — the canonical gotchas catalog.
- `/cookbooks/nql/performance-patterns` and `/guides/nql/query-optimization` — performance recipes.
- `/concepts/nql/…`, `/cookbooks/nql/…` — broader reference.

Typical lookups:

```
search_narrative_i_o_knowledge_base(query: "NQL <symptom or function>")
query_docs_filesystem_...(command: "cat /guides/nql/troubleshooting/unsupported-type-error.mdx")
query_docs_filesystem_...(command: "cat /guides/nql/query-optimization/avoid-or-in-join.mdx")
query_docs_filesystem_...(command: "cat /cookbooks/nql/performance-patterns.mdx")
```
