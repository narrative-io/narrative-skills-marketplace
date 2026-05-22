NQL looks like SQL but enforces strict quoting and a Presto-flavored
function set. Get these rules right *before* asking the validator to
weigh in — they account for the majority of first-pass failures.

### Table references

Every table reference is **schema-qualified**. The three schemas you'll
meet in practice:

| Schema | Holds | Example |
| --- | --- | --- |
| `company_data` | Your own datasets, views, and the data shared into your tenant. | `company_data.web_events` |
| `<provider_slug>` | Another company's resources, exposed to you through an access rule. The schema name is that company's slug. | `acme."ar_fitness"` |
| `narrative` | Platform-wide special tables — most notably `narrative.rosetta_stone` for global identity resolution. | `narrative.rosetta_stone` |

Within a schema, a dataset, view, or access rule can be addressed two
ways:

| Form | Looks like | When to use |
| --- | --- | --- |
| **`unique_name`** (preferred) | `company_data.web_events` | Always, when you know it. Stable across environments, readable in code review, and survives dataset re-creation. Datasets, views, and access rules share a single `unique_name` namespace, so the same syntax works for all three. |
| Numeric id | `company_data."12345"` | Only when you don't have a `unique_name` — e.g. a freshly created dataset, or one referenced from a job payload. The id is numeric and **must** be double-quoted, otherwise NQL parses it as a number. |

```sql
-- Preferred: address by unique_name
SELECT user_id, email FROM company_data.web_events LIMIT 10

-- Fallback: address by numeric id (quoted)
SELECT user_id, email FROM company_data."12345" LIMIT 10
```

The schema name itself is just an identifier, so `"company_data"."12345"`
is equivalent to `company_data."12345"` — bare is the convention.

**Quoting a `unique_name`.** Leave safe snake_case slugs unquoted
(`web_events`). Double-quote when the name collides with a reserved
word, contains uppercase letters or dashes, or — as the docs do for
access rules — when you want to be defensive about an externally
supplied name: `acme."ar_fitness"`, `company_data."Order_History"`.

**Cross-dataset queries.** Fully qualify each side and alias them. This
works identically whether you mix forms or not:

```sql
SELECT u.user_id, o.order_id, o.total_cents
FROM company_data.users        AS u
JOIN company_data.order_history AS o ON u.user_id = o.user_id
```

**Special: Rosetta Stone scopes.** The `_rosetta_stone` virtual table
attaches to any schema or dataset to surface normalized identity data.
The same name/id rule applies to the dataset segment:

```sql
-- Global
FROM narrative.rosetta_stone
-- Company-scoped
FROM company_data._rosetta_stone
-- Dataset-scoped, by unique_name
FROM company_data.web_events._rosetta_stone
-- Dataset-scoped, by id
FROM company_data."12345"._rosetta_stone
```

When you don't already know the `unique_name`, look it up with
`narrative_datasets_search` / `narrative_datasets_describe` before
falling back to the id.

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

The KB's troubleshooting and performance pages document the failure
modes that consistently bite first-pass queries. Apply the rules here
before validating; consult the KB for the long form.

| Gotcha | Rule | KB page |
| --- | --- | --- |
| **Wildcards / `COUNT(*)`** | NQL does **not** support `SELECT *`, `SELECT t.*`, or `COUNT(*)`. Always list columns explicitly. Use `COUNT(1)` for row counts, `COUNT(<col>)` for non-null counts. This rule applies inside CTEs and subqueries too. | `/nql/general/explicit-columns` |
| **Naked `SELECT` is not runnable** | You cannot submit a bare `SELECT` to `narrative_nql_run` and expect rows back. Every executed query must land somewhere — wrap the `SELECT` in `CREATE MATERIALIZED VIEW "<name>" AS SELECT …` (optionally with `REFRESH_SCHEDULE`, `EXPIRE`, `BUDGET`, etc.), then read the rows via `narrative_dataset_request_sample` + `narrative_datasets_describe(include=["sample"])`. Bare-`SELECT` validation passes, but execution requires the materialized-view wrapper. | `/nql/commands/create-materialized-view`, `/guides/nql/creating-materialized-views` |
| **No outer parens on the CMV body** | Write `CREATE MATERIALIZED VIEW "<name>" AS SELECT …`, **not** `… AS (SELECT …)`. The validator accepts the parenthesized form, but `narrative_nql_run` returns HTTP 500 at execution time. | `/nql/commands/create-materialized-view` |
| **Reserved keywords** | Reserved words (`type`, `value`, `user`, `order`, `group`, `select`, etc.) must be double-quoted when used as identifiers — including nested property paths like `data."value"`. | `/nql/general/reserved-keywords` |
| **Dataset IDs are numeric** | Dataset IDs in `company_data` are numeric and must be double-quoted: `company_data."123"`. Bare `company_data.123` parses as a numeric literal. | `/concepts/nql/sql-comparison` |
| **Fully qualify columns in joins** | Use `company_data."123".col` (or aliased equivalents) in `JOIN`s and `WHERE`s — ambiguous column references fail at parse. | `/guides/nql/filtering-transforming` |
| **`GEOMETRY` cannot be in `SELECT`** | Geometry types (e.g. the output of `STCIRCLE`) cannot be returned in result sets. Keep geometry expressions inside `JOIN` and `WHERE` clauses; return `latitude` / `longitude` / identifiers instead. | `/guides/nql/troubleshooting/unsupported-type-error` |
| **`\|\|` concatenation is string-only** | The `\|\|` operator requires both operands to be strings. Structured fields need `.value` extracted first; non-string types need `CAST(... AS VARCHAR)`. | `/guides/nql/troubleshooting/unsupported-type-error` |
| **Cross-data-plane queries fail** | A single query cannot reference datasets that live in different data planes. Verify dataset plane assignments before drafting joins; either query each plane separately or materialize into a common plane. | `/guides/nql/troubleshooting/cross-data-plane-queries` |
| **Pass `data_plane_id` to validate, run, and get_job** | All three tools accept `data_plane_id` and all three default to the company default plane when it's omitted — usually wrong on multi-plane tenants. Capture the dataset's plane from `narrative_datasets_describe` (or `narrative_data_planes_list`) once, and pass the same value to every call. Omitting it on validate is the common cause of validator-only "Unknown Table" errors on numeric-id references like `company_data."38206"` (run accepts what validate rejects). | `/reference/integrations/mcp-server`, `/guides/nql/troubleshooting/cross-data-plane-queries` |
| **`OR` in `JOIN` clauses** | `ON a.x = b.x OR a.y = b.y` defeats hash-join optimization and can run 100× slower. Restructure with `CROSS JOIN UNNEST([…])` on a flattened key column, or `UNION` two single-key joins. | `/guides/nql/query-optimization/avoid-or-in-join` |
| **Filter before joining** | Push filters into CTEs / subqueries on each side of the join, not after. Cuts the rows hashed and the rows scanned. | `/cookbooks/nql/performance-patterns` |
| **Prefer `APPROX_COUNT_DISTINCT`** | Cheaper and faster than `COUNT(DISTINCT col)`; exact at low cardinality, near-exact at scale. Reserve `COUNT(DISTINCT col)` for `HAVING` / `CASE WHEN` threshold logic. | `/cookbooks/nql/performance-patterns` |
| **`QUALIFY` over subquery dedup** | `QUALIFY ROW_NUMBER() OVER (...) = 1` is the idiomatic NQL dedup; cheaper than a `WHERE rn = 1` wrapper around a `ROW_NUMBER()` subquery. | `/cookbooks/nql/performance-patterns` |
| **Top-N inside a `CREATE MATERIALIZED VIEW`** | A materialized view stores an unordered bag of rows — `ORDER BY` in the body affects insertion order at best, not what later reads return. For "top N by aggregate" patterns inside a CMV, use `QUALIFY ROW_NUMBER() OVER (ORDER BY <measure> DESC) <= N` instead of `ORDER BY <measure> DESC LIMIT N`. Outside a CMV (an ad-hoc `SELECT` you'd then sample), `ORDER BY … LIMIT` is fine. | `/cookbooks/nql/performance-patterns` |
| **Percentile / distribution summaries** | NQL on Snowflake does not currently support `APPROX_PERCENTILE` (function not registered, HTTP 422) or `PERCENTILE_CONT(p) WITHIN GROUP` (validates but 500s at run). Use bucketed counts (`SUM(CASE WHEN x >= threshold THEN 1 ELSE 0 END)`) or row-position derivation for exact percentiles. See the percentile reference below. | n/a — see `references/PERCENTILE_DISTRIBUTION.md` |

### Validation error → fix cheat sheet

| Error symptom | Likely cause | Fix |
| --- | --- | --- |
| "syntax error at or near 'type'" | Unquoted reserved word | Quote as `"type"` |
| "column not found" | Wrong identifier name / casing | Re-check schema via `narrative_datasets_describe` |
| "function does not exist" | Wrong function name (e.g., `LCASE`) | Use the function list above |
| "No match found for function signature `date_parse`/`parse_datetime`" | Function not exposed | Use `to_timestamp(text, format)` or `CAST(... AS timestamp)` |
| "No match found for function signature `APPROX_PERCENTILE`" or run-time 500 on `PERCENTILE_CONT` | Percentile functions not available on the Snowflake data plane | Bucketed counts or row-position derivation — see `references/PERCENTILE_DISTRIBUTION.md` |
| Validate-only "Unknown Table" on `company_data."<numeric_id>"` that run accepts | Validate call omitted `data_plane_id` and fell back to the company default plane | Pass `data_plane_id` to `narrative_nql_validate` matching the dataset's plane — same value as you'll pass to `narrative_nql_run` |
| "cannot cast string to long" | Implicit coercion | Wrap with `CAST(... AS long)` or `NULLIF` |
| "unexpected ELSE without CASE" | Mismatched CASE/END | Count `CASE … END` pairs |
| "wildcard not supported" / "SELECT \* not supported" | Used `SELECT *` or `COUNT(*)` | Enumerate columns; use `COUNT(1)` or `COUNT(<col>)` |
| "Unsupported GEOMETRY type" | `GEOMETRY` returned in `SELECT` | Move geometry to `JOIN` / `WHERE` only; project `latitude` / `longitude` / ids |
| "String Concatenation" type error | `\|\|` mixing non-string types | `CAST(<x> AS VARCHAR)`, or extract `.value` from structured fields |
| "Cross-Data Plane Query" error | Datasets in different planes | Query each plane separately, or materialize into one plane |

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
