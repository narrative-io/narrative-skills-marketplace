# Knowledge base research

When the local references and the `narrative-mcp` data tools aren't
enough — you need official guidance on Rosetta Stone confidence
scoring, the normalization model, an NQL function/operator reference,
or a worked NQL pattern — query the **`narrative-knowledge-base`**
MCP server. It exposes Narrative's docs site as a virtualized,
read-only filesystem.

## The two tools

### `search_narrative_i_o_knowledge_base`

Semantic search across every docs page. Use for conceptual / open
questions ("how is confidence scored", "what NQL functions exist for
strings"). Returns ranked titles + paths.

```
search_narrative_i_o_knowledge_base(query: "rosetta stone confidence scoring")
```

The returned paths are virtual (e.g., `/concepts/rosetta-stone/confidence-scoring`).
Append `.mdx` and pass to `query_docs_filesystem_...` to read the
full page.

### `query_docs_filesystem_narrative_i_o_knowledge_base`

Shell-style queries against a virtualized FS rooted at `/`. Supports
`rg` (ripgrep), `grep`, `find`, `tree`, `ls`, `cat`, `head`, `tail`,
`jq`, etc. **Stateless** — `cd` does not persist between calls; chain
with `&&` or use absolute paths.

Use for:

- Exact keyword / regex matching (`rg -nC2 "LATERAL VIEW" /`)
- Reading a full page (`cat /concepts/rosetta-stone/normalization-model.mdx`)
- Discovering structure (`tree /concepts/nql -L 1`)
- Bounded reads to control context size (`head -120 /path/file.mdx`)
- OpenAPI spec extraction (`cat /openapi/spec.json | jq '.paths | keys'`)

## Rosetta Stone — recommended entry points

The KB groups Rosetta Stone material under `/concepts/rosetta-stone/`
and `/getting-started/`. Useful pages:

| Path | When to read |
| --- | --- |
| `/concepts/rosetta-stone/overview.mdx` | First time you're explaining what Rosetta Stone is in a summary or warning |
| `/concepts/rosetta-stone/how-it-works.mdx` | Confirming the attribute → mapping → normalized-output pipeline before generating a mapping |
| `/concepts/rosetta-stone/normalization-model.mdx` | Choosing between `value_mapping` and `object_mapping`; understanding property paths |
| `/concepts/rosetta-stone/confidence-scoring.mdx` | Calibrating the confidence ranges in step 7 against the official rubric |
| `/getting-started/normalize-data.mdx` | End-to-end walkthrough — sanity-check the procedure if a flow feels off |
| `/getting-started/evaluate-mappings.mdx` | Worked example of the evaluation flow |
| `/api-reference/dataset-mappings/` | Underlying REST contract for the mapping objects you emit |
| `/api-reference/mappings/` | Attribute-level mapping endpoints |

Starting queries:

```
search_narrative_i_o_knowledge_base(query: "rosetta stone value mapping vs object mapping")
search_narrative_i_o_knowledge_base(query: "rosetta stone confidence levels guidance")
query_docs_filesystem_...(command: "head -200 /concepts/rosetta-stone/normalization-model.mdx")
query_docs_filesystem_...(command: "rg -nC3 -i 'property_mappings' /concepts/rosetta-stone /api-reference/dataset-mappings")
```

## NQL — recommended entry points

NQL material lives under `/concepts/nql/`, `/cookbooks/nql/`, and
`/api-reference/nql/`. Useful pages:

| Path | When to read |
| --- | --- |
| `/concepts/nql/design-philosophy.mdx` | First exposure to NQL — what it is, what it isn't |
| `/concepts/nql/sql-comparison.mdx` | Translating standard SQL idioms; double-quoting, qualified table names |
| `/concepts/nql/type-system.mdx` | Cast/coerce questions; deciding `cast(... as double)` vs `cast(... as bigint)` |
| `/concepts/nql/query-templates.mdx` | Reusable templates for common selects |
| `/concepts/nql/materialized-views.mdx` | When the user asks to materialize a mapped projection |
| `/cookbooks/nql/common-queries.mdx` | Worked patterns — coalesce, case-when, lower/upper, hashing |
| `/cookbooks/nql/performance-patterns.mdx` | If `narrative_nql_run` is slow on a validation test |
| `/getting-started/first-nql-query.mdx` | Smoke check for `company_data."<id>"` syntax |
| `/api-reference/nql/` | Endpoint contracts mirroring `narrative_nql_validate` / `narrative_nql_run` |

For NQL **gotchas / troubleshooting** specifically — when a mapping
expression validates locally but fails at run time, or when you're
unsure whether a pattern is supported — go to these pages before
asking the user:

| Path | Covers |
| --- | --- |
| `/guides/nql/troubleshooting.mdx` | Index of the canonical error catalog |
| `/guides/nql/troubleshooting/unsupported-type-error.mdx` | `GEOMETRY`-in-`SELECT`, `\|\|` concatenation type errors, structured-field `.value` extraction, `CAST(... AS VARCHAR)` |
| `/guides/nql/troubleshooting/cross-data-plane-queries.mdx` | "Single query cannot span data planes" — relevant when a mapping crosses tenants |
| `/nql/general/explicit-columns.mdx` | Why `SELECT *` and `COUNT(*)` are rejected; idiomatic replacements (`COUNT(1)`, explicit column lists) |
| `/nql/general/reserved-keywords.mdx` | The double-quote rule for `type`, `value`, `user`, `order`, etc. |
| `/nql/commands/create-materialized-view.mdx` | Wrapper required to actually run a `SELECT`; full options reference (`REFRESH_SCHEDULE`, `EXPIRE`, `BUDGET`, `PARTITIONED_BY`, `MERGE ON`) |
| `/guides/nql/query-optimization/avoid-or-in-join.mdx` | Why `OR` in `JOIN` clauses kills performance; `UNNEST` / `UNION` rewrites |
| `/cookbooks/nql/performance-patterns.mdx` | `APPROX_COUNT_DISTINCT`, `QUALIFY`, filter-before-join, price-filter early |

Starting queries:

```
search_narrative_i_o_knowledge_base(query: "NQL string functions lower upper trim")
search_narrative_i_o_knowledge_base(query: "NQL case when expression syntax")
search_narrative_i_o_knowledge_base(query: "NQL cast bigint double timestamp")
search_narrative_i_o_knowledge_base(query: "NQL gotchas troubleshooting")
query_docs_filesystem_...(command: "rg -nC3 -i 'cast\\(' /concepts/nql /cookbooks/nql | head -80")
query_docs_filesystem_...(command: "head -200 /concepts/nql/sql-comparison.mdx")
query_docs_filesystem_...(command: "cat /guides/nql/troubleshooting/unsupported-type-error.mdx")
query_docs_filesystem_...(command: "cat /cookbooks/nql/performance-patterns.mdx")
```

## Heuristics

- **Search first, read second.** `search_narrative_i_o_knowledge_base`
  gives you the shortlist; `query_docs_filesystem_...` with `head` /
  `cat` reads the page. Don't `cat` blind — pages can be long.
- **Bound your reads.** Prefer `head -N` over `cat` when you only need
  the top of a doc. Pipe `rg` into `head` for big result sets.
- **Append `.mdx`** to paths returned from search before passing them
  to the filesystem tool.
- **Chain with `&&`** when you want to operate in a subdirectory;
  the filesystem tool is stateless across calls.
- **Quote the answer, don't paraphrase.** When you cite KB content in
  a `warnings[]` entry or in the `summary`, quote a short verbatim
  excerpt so the user can audit it.
- **Graceful degradation.** If `narrative-knowledge-base` isn't
  available, fall back to the local reference files and note in the
  summary that KB lookups were skipped.
