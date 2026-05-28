# Validation error → fix cheat sheet

When `narrative_nql_validate` returns an error, look up the message
text here for the canonical fix. Each row maps a verbatim or
near-verbatim error symptom to the most likely cause and the
shortest fix that resolves it. For deeper context on the underlying
rule, follow the link to [`NQL_GOTCHAS.md`](NQL_GOTCHAS.md) or the KB.

| Error symptom | Likely cause | Fix |
| --- | --- | --- |
| "syntax error at or near 'type'" | Unquoted reserved word | Quote as `"type"` |
| "syntax error at or near '!='" / "'!'" | Used `!=` for not-equals | Replace with `<>` — NQL only accepts the standard SQL inequality operator |
| "column not found" | Wrong identifier name / casing | Re-check schema via `narrative_datasets_describe` |
| "function does not exist" | Wrong function name (e.g., `LCASE`) | Use the supported function list in the syntax-essentials snippet |
| "No match found for function signature `date_parse`/`parse_datetime`" | Function not exposed | Use `to_timestamp(text, format)` or `CAST(... AS timestamp)` |
| "No match found for function signature `APPROX_PERCENTILE`" or run-time 500 on `PERCENTILE_CONT` | Percentile functions not available on the Snowflake data plane | Bucketed counts or row-position derivation — see [`PERCENTILE_DISTRIBUTION.md`](PERCENTILE_DISTRIBUTION.md) |
| Validate-only "Unknown Table" on `company_data."<numeric_id>"` that run accepts | Validate call omitted `data_plane_id` and fell back to the company default plane | Pass `data_plane_id` to `narrative_nql_validate` matching the dataset's plane — same value as you'll pass to `narrative_nql_run` |
| "cannot cast string to long" | Implicit coercion | Wrap with `CAST(... AS long)` or `NULLIF` |
| "unexpected ELSE without CASE" | Mismatched CASE/END | Count `CASE … END` pairs |
| "wildcard not supported" / "SELECT \* not supported" | Used `SELECT *` or `COUNT(*)` | Enumerate columns; use `COUNT(1)` or `COUNT(<col>)` |
| "Unsupported GEOMETRY type" | `GEOMETRY` returned in `SELECT` | Move geometry to `JOIN` / `WHERE` only; project `latitude` / `longitude` / ids |
| "String Concatenation" type error | `\|\|` mixing non-string types | `CAST(<x> AS VARCHAR)`, or extract `.value` from structured fields |
| "Cross-Data Plane Query" error | Datasets in different planes | Query each plane separately, or materialize into one plane |

If the error message doesn't appear in this table, fall back to
[`NQL_GOTCHAS.md`](NQL_GOTCHAS.md) (the full failure-mode catalog) and
the `narrative-knowledge-base` MCP server.
