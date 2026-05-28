# NQL gotchas catalog

The recurring failure modes that bite first-pass NQL queries, with the
canonical fix for each and a pointer back to the knowledge base for the
long form. Read this when a query fails validation (or fails at run
time after passing validation) and the symptom doesn't match the
shorter cheat sheet in [`NQL_VALIDATION_ERRORS.md`](NQL_VALIDATION_ERRORS.md).

Apply the rules here before validating; consult the linked KB pages
when you need the underlying rationale or a worked example.

| Gotcha | Rule | KB page |
| --- | --- | --- |
| **Wildcards / `COUNT(*)`** | NQL does **not** support `SELECT *`, `SELECT t.*`, or `COUNT(*)`. Always list columns explicitly. Use `COUNT(1)` for row counts, `COUNT(<col>)` for non-null counts. This rule applies inside CTEs and subqueries too. | `/nql/general/explicit-columns` |
| **Naked `SELECT` is not runnable** | You cannot submit a bare `SELECT` to `narrative_nql_run` and expect rows back. Every executed query must land somewhere — wrap the `SELECT` in `CREATE MATERIALIZED VIEW "<name>" AS SELECT …` (optionally with `REFRESH_SCHEDULE`, `EXPIRE`, `BUDGET`, etc.), then read the rows via `narrative_dataset_request_sample` + `narrative_datasets_describe(include=["sample"])`. Bare-`SELECT` validation passes, but execution requires the materialized-view wrapper. | `/nql/commands/create-materialized-view`, `/guides/nql/creating-materialized-views` |
| **No outer parens on the CMV body** | Write `CREATE MATERIALIZED VIEW "<name>" AS SELECT …`, **not** `… AS (SELECT …)`. The validator accepts the parenthesized form, but `narrative_nql_run` returns HTTP 500 at execution time. | `/nql/commands/create-materialized-view` |
| **Not-equals is `<>`, not `!=`** | NQL only accepts the SQL-standard `<>` inequality operator. `!=` fails to parse — write `WHERE "status" <> 'active'`, never `!=`. | `/concepts/nql/sql-comparison` |
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
| **Percentile / distribution summaries** | NQL on Snowflake does not currently support `APPROX_PERCENTILE` (function not registered, HTTP 422) or `PERCENTILE_CONT(p) WITHIN GROUP` (validates but 500s at run). Use bucketed counts (`SUM(CASE WHEN x >= threshold THEN 1 ELSE 0 END)`) or row-position derivation for exact percentiles. See [`PERCENTILE_DISTRIBUTION.md`](PERCENTILE_DISTRIBUTION.md). | n/a — see [`PERCENTILE_DISTRIBUTION.md`](PERCENTILE_DISTRIBUTION.md) |

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
