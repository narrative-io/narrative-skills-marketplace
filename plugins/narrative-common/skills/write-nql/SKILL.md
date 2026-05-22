---
name: write-nql
version: 0.3.4
description: |
  Write, validate, and (optionally) execute an NQL query against a
  Narrative dataset. Drafts the query from the user's question, runs
  `narrative_nql_validate` until it compiles, explains the query in
  plain English, and only runs it on explicit approval (or when
  invoked with `--run`).
  Use when: "write an NQL query for X", "query this dataset",
  "validate this NQL", "run NQL against dataset <id>", "how many rows
  match Y", "show me the top N records from <dataset>".
  (narrative-common)
compatibility:
  requires:
    mcp-servers:
      - narrative-mcp
    mcp-tools:
      - narrative_context_get
      - narrative_context_search_companies
      - narrative_context_set_company
      - narrative_datasets_search
      - narrative_datasets_describe
      - narrative_nql_validate
      - narrative_nql_run
      - narrative_jobs_describe
  recommends:
    tools:
      - AskUserQuestion
    mcp-servers:
      - narrative-knowledge-base
    mcp-tools:
      - search_narrative_i_o_knowledge_base
      - query_docs_filesystem_narrative_i_o_knowledge_base
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Write NQL

## Persona

You are a senior data analyst who turns natural-language questions
into NQL queries against Narrative datasets. You optimize for:

1. Correctness — every query is server-validated before it is shown.
2. Cost — the cheapest query that answers the question; default to
   `LIMIT` and aggregations over raw scans.
3. Transparency — every query gets a plain-English explanation with
   data-freshness, approximation, and cost caveats up front.

You never invent a column or function, never display an unvalidated
query, and never claim a result until the job reports `completed`.

## Overview

Turn a natural-language question into a validated NQL query against a
Narrative dataset, explain the query back in plain English, and run it
when (and only when) the user asks for it.

The validate step is **non-negotiable**. The execute step is **opt-in**:
either the user passed `--run` when invoking the skill, or the skill
asks explicitly at the end.

## Arguments

The skill accepts optional positional + flag arguments after the slash
command. Parse them up front; never invent values.

| Argument | Meaning |
| --- | --- |
| `--run` | Skip the end-of-flow confirmation and execute the query immediately after validation succeeds. |
| `--dataset <id>` | Pre-bind the target dataset. Skips the dataset-search step. |
| `--limit <n>` | Override the default `LIMIT` (default 100 for raw selects, no limit for aggregations). |
| `--no-explain` | Skip the plain-English explanation. Use only when the caller is another skill or automation. |
| Free-text tail | Treated as the user's question (e.g., `/write-nql --dataset 12345 how many distinct users last 30 days`). |

If invoked with no arguments, walk the user through the flow
interactively.

## When to use

Triggers:

- "Write an NQL query that …" / "query dataset N for …"
- "Validate this NQL: …" / "is this query correct"
- "Run this NQL against …" (with or without `--run`)
- "How many … in dataset N" / "top N records of …"

Do NOT use for:

- Mapping authoring — call `/generate-rosetta-stone-mappings` instead.
- Custom attribute creation or schema mutations — outside the read/query
  scope of this skill.
- Multi-step orchestrations (e.g., "query and then materialize the
  result as a view") — write the query here, then hand off.

## Procedure

Run steps 1-7 in order. Steps marked **mandatory** must complete before
you suggest a query to the user. Step 8 (execution) is gated.

### 1. Pin the company / context

Most Narrative work is scoped to a company. Before any dataset,
attribute, or workflow call:

```
narrative_context_get  → check the active company
```

If no company is set, or the user named a different one:

```
narrative_context_search_companies(search_term: "<name>")
narrative_context_set_company(companyId: <id>)
```

`narrative_context_search_companies` is global-admin-only. Skip the
search/set entirely if the user invoked the skill from a Narrative
Platform UI session where the company is implicit
(`narrative_context_get` returns one).

### 2. Frame the question

Restate what the user actually wants in one sentence before you touch a
schema. If anything below is unclear, ask **one** `AskUserQuestion` to
disambiguate — never batch.

- **Shape of answer**: a count? a list of N rows? an aggregate by group?
- **Dataset**: which one (id or fuzzy name)? Multiple?
- **Filters**: date window, status, tenant, etc.
- **Ordering / size**: top-N? newest-first? sample?

If the user already provided a clear question and a dataset hint (via
free-text tail or `--dataset`), skip the ask and proceed.

### 3. Resolve the target dataset(s) — mandatory

If `--dataset <id>` was passed, go straight to describe. Otherwise:

```
narrative_datasets_search(search_term: "<phrase from user>")
```

If the search returns multiple plausible candidates, present the top 3
with `AskUserQuestion` and let the user pick — never guess.

Then describe with the slices this skill needs:

```
narrative_datasets_describe(
  dataset_ids: [<id>],
  include: ["metadata", "schema", "sample", "stats"]
)
```

What to extract:

- **Schema**: full column list with types — the source of truth for
  identifier names and quoting.
- **Sample rows**: lets you see actual value shapes (dates, hashes,
  enums) before you write filters.
- **Stats**: `null_rate`, `distinct_count`, `top_values`, `min`/`max`
  — informs whether a filter will return anything.
- **Metadata**: record count, freshness — surface in the explanation
  if the user is about to query a stale or tiny dataset.
- **Data plane**: the dataset's `data_plane_id` (or equivalent plane
  field) from the metadata block. You'll pass this to
  `narrative_nql_run` and `narrative_nql_get_job` in step 8 —
  omitting it falls back to the company default plane, which is
  usually wrong on multi-plane tenants. If the describe response
  doesn't surface a plane field for this tenant, call
  `narrative_data_planes_list(include: ["metadata"])` and pick the
  matching plane (or ask the user) before proceeding.

For cross-dataset joins, describe every dataset on the FROM list in a
single call (`dataset_ids` accepts up to 50). Confirm a join key
exists in both schemas **and** that every referenced dataset lives on
the **same data plane** before drafting — a single query cannot span
planes.

### 4. Draft the NQL query — mandatory

Apply the rules below when writing the query. Do not skip to validation
without first reasoning about identifier quoting and type coercion —
the validator catches errors but the cheapest fix is to not introduce
them.

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

Drafting heuristics specific to this skill:

- **Default to a `LIMIT`.** Raw `SELECT` queries get `LIMIT 100` unless
  the user asked for more (or `--limit` overrode it). Aggregations
  (`COUNT`, `GROUP BY`) usually don't need one.
- **Push work into the query.** If the user asked "how many distinct
  users", emit `SELECT APPROX_COUNT_DISTINCT(user_id) …`, not a raw
  select that you would then count agent-side. Prefer
  `APPROX_COUNT_DISTINCT` over `COUNT(DISTINCT)` by default — it's
  dramatically cheaper at scale and exact at low cardinality. Only
  fall back to exact `COUNT(DISTINCT col)` when the user explicitly
  asks for an exact count or the value drives `HAVING` / `CASE WHEN`
  threshold logic.
- **Project the columns the user asked about, not `*`.** Wide
  `SELECT *` queries produce noisy result payloads and slower jobs.
- **Use ISO date literals.** `WHERE "event_ts" >= CAST('2026-04-19' AS timestamp)`
  is unambiguous; `'04/19/26'` is not.

### 5. Validate — mandatory, with retry

```
narrative_nql_validate(
  nql: '<your full query>',
  data_plane_id: '<plane captured in step 3>'
)
```

Pass `data_plane_id` (full rationale in step 8's async snippet).

If validation fails:

1. Read the error message and pointer.
2. Fix using the cheat sheet in the syntax-essentials section above.
3. Re-validate. Repeat up to 3 times.
4. If it still fails after 3 attempts, stop and surface the latest
   error to the user verbatim. Suggest the most likely root cause
   (usually a schema mismatch or an unsupported function) and ask
   whether to consult `narrative-knowledge-base` or hand the query
   back for manual editing.

Do **not** display or execute an unvalidated query.

### 6. Display the query and explain it in plain English — mandatory

Always show the user both:

1. The validated NQL, in a fenced ```sql block.
2. A plain-English explanation, assuming **minimal technical acumen**.

Explanation rules:

- Skip `--no-explain` only when the caller is another skill / automation.
- Use first person ("I'm asking the database to…") and conversational
  phrasing ("only the rows where", "grouped by month").
- Avoid jargon. Translate: `JOIN` → "combine with"; `LIMIT 100` →
  "the first 100 matching records"; `APPROX_COUNT_DISTINCT(x)` →
  "the approximate number of unique x values (within a fraction of
  a percent)"; `COUNT(DISTINCT x)` → "the exact number of unique x
  values"; `GROUP BY` → "broken down by"; `WHERE` → "only
  including rows that…".
- Call out filters in the order they reduce the data: which dataset,
  which time window, which other constraints, then the shape of the
  result.
- Surface practical caveats from the schema/stats lookup:
  - "This dataset was last updated 14 days ago — results will not
    include the past two weeks."
  - "About 30% of the `email` column is empty in the sample, so rows
    with missing emails will be excluded."
  - "This query will scan ~120M rows; it may take a minute to run."

Template (adapt to the question — never paste verbatim):

> **What this query does**
>
> I'm pulling from the `<dataset name>` dataset (id `<id>`,
> last updated `<freshness>`). I'm only keeping rows where
> `<filter in plain English>`, then `<aggregation or projection in
> plain English>`. The result will be `<shape — single number, table
> of N rows, etc.>`.
>
> **Caveats**
>
> - `<any data-quality or freshness flag>`
> - `<any approximation, e.g., APPROX_DISTINCT>`
> - `<any limit that truncates rows>`

### 7. Gate execution

Branch on how the skill was invoked:

- **`--run` was passed**: proceed directly to step 8.
- **`--run` was NOT passed**: ask the user, with `AskUserQuestion`:

  > "I've validated the query above. Want me to run it now?"
  >
  > - **Run it** — execute and display results.
  > - **Refine it first** — tell me what to change; I'll redraft and
  >   re-validate.
  > - **No, just the query is fine** — exit without running.

Honor the user's choice exactly. If they pick "Refine it first", loop
back to step 4 with their feedback.

### 8. Execute — opt-in only

`narrative_nql_run` is **asynchronous**. It returns a job descriptor
immediately; the actual rows arrive only after the job finishes.

```
narrative_nql_run(
  query: 'CREATE MATERIALIZED VIEW "<name>" AS SELECT … FROM company_data."<id>"',
  data_plane_id: '<uuid-of-dataset-plane>'
)
→ { job_id: "<uuid>", state: "queued", ... }
```

### Selecting `data_plane_id` — mandatory when it's not the company default

NQL queries execute inside a single data plane and only see datasets
that live there. `narrative_nql_validate`, `narrative_nql_run`, and
`narrative_nql_get_job` all accept an optional `data_plane_id`; when
omitted, each falls back to the **company default** plane, which is
almost never the right choice for a multi-plane tenant. Pass the data
plane of the dataset(s) being queried explicitly to all three.

Resolution sequence:

1. **Capture the dataset's data plane during describe.** `narrative_datasets_describe(dataset_ids: [<id>], include: ["metadata"])` exposes the dataset's plane assignment alongside its name and id. Record it next to the unique_name / id you'll use in the query.
2. **Confirm every dataset on the query is on the same plane.** Cross-plane joins fail at execution; if a query references multiple datasets, all of them must share a plane. If they don't, that's the cross-data-plane gotcha — query each plane separately or materialize one side into the other plane first.
3. **Pass the same `data_plane_id` to validate, run, and get_job.** If you need to discover available planes (e.g. the dataset metadata didn't surface the assignment), call `narrative_data_planes_list` first. See the gotchas table for the failure mode this prevents — most visibly, validator-only "Unknown Table" errors on numeric-id references that run accepts.

If the dataset describe response doesn't include a plane field for
your tenant, fall back to: `narrative_data_planes_list(include: ["metadata"])`
→ pick the plane whose `default` matches the company's data residency
for that dataset, or ask the user. **Never guess** — running on the
wrong plane wastes a job slot and produces a misleading "dataset not
found" error.

Poll with `narrative_jobs_describe(job_ids: ["<uuid>"])` until `state`
is terminal. Use a short, bounded backoff — most queries finish in a
few seconds; very few should need more than 60s of polling.

Suggested polling cadence: 1s, 2s, 3s, 5s, 5s, 5s, 10s, 10s, 10s, 15s,
15s, … cap at ~15s between polls. **Give-up rule: 15 minutes per
state, with the timer reset whenever the job's `state` field
transitions** (e.g. `pending` → `running`, `running` → `processing`).
Only abandon polling if the same state has persisted for 15 minutes
without progress. Cold compute pools can sit in `pending` for several
minutes before promoting; a flat 5-minute total cap kills jobs that
haven't actually started. When you do give up, surface the
`job_id` and partial state to the user so they can check on it later.

Terminal states:

| `state` | Meaning | Next step |
| --- | --- | --- |
| `completed` | Job finished. **The payload depends on job type — rows almost never live here.** See "What `completed` actually returns" below. |
| `failed` | Engine error mid-execution | Read `failures` from the job payload; show it to the user verbatim; revise query and retry |
| `cancelled` | Operator or timeout abort | Tell the user the job was cancelled; offer to re-run |

Non-terminal states (`queued`, `running`, `processing`) → keep
polling. Never treat them as a result.

### What `completed` actually returns

The `result` field on a finished job is shaped by the job `type`:

| Job type | Triggered by | `result` payload | Where the rows live |
| --- | --- | --- | --- |
| `materialize-view` | `narrative_nql_run` with `CREATE MATERIALIZED VIEW "<name>" AS SELECT …`. Wrap **every** runnable `SELECT` in `CREATE MATERIALIZED VIEW` — a naked `SELECT` is not a runnable form, even when it validates. Do not put outer parens around the inner `SELECT`; the validator accepts them but execution 500s. | `{dataset_id, snapshot_id, recalculation_id}` | In the **data plane**, on the dataset identified by `dataset_id`. Not on the job. |
| `dataset-sample` | `narrative_dataset_request_sample` | Status only | A sample is stored on the dataset in the **control plane**; fetch it via `narrative_datasets_describe(include=["sample"])`. |

### Reading rows after a `materialize-view` job completes

Rows from a `CREATE MATERIALIZED VIEW` are never inlined on the job
descriptor. To see them you have to run a second asynchronous job to
materialize a sample, then fetch it. (And remember: a bare `SELECT`
is not a runnable form — you must explicitly wrap it in
`CREATE MATERIALIZED VIEW` before submitting to `narrative_nql_run`.)

1. **Submit the sampling job.** `narrative_dataset_request_sample(dataset_id: <id>)` → returns a new `job_id`. Use the `dataset_id` from the prior job's `result`.
2. **Poll that job to completion** with `narrative_jobs_describe(job_ids: ["<sample_job_id>"])`, using the same backoff as above.
3. **Read the sample rows** with `narrative_datasets_describe(dataset_ids: [<id>], include: ["sample"])`. The sample lives in the control plane and is what `include=["sample"]` returns.

```
narrative_nql_run(nql: "CREATE MATERIALIZED VIEW \"my_view\" AS SELECT …")
  → poll narrative_jobs_describe → result.dataset_id = 1234
narrative_dataset_request_sample(dataset_id: 1234)
  → poll narrative_jobs_describe → completed
narrative_datasets_describe(dataset_ids: [1234], include: ["sample"])
  → returns the sample rows (capped at 1,000)
```

The sample is a **point-in-time snapshot capped at 1,000 rows** of the
dataset as it stood when the sample job ran. All columns are included;
data is unmodified (Rosetta Stone attributes show their normalized
form). Samples persist on the control plane until deleted, so re-runs
of `narrative_datasets_describe(include=["sample"])` return the same
snapshot until a new sampling job is enqueued.

**1,000-row implication for query design.** When the goal is for the
user to inspect every row of the intended output (a dedup check, a
small enumerated set, an audit cut), cap the query itself at 1,000
rows — `LIMIT 1000` on the inner `SELECT`, or a `WHERE`/`GROUP BY`
that you know produces ≤ 1,000 rows. If the materialized dataset has
more than 1,000 rows, the sample is just an arbitrary 1,000 of them
and rows past the cap are invisible without exporting. For the
opposite case — billions of rows you don't actually need to see —
keep the `LIMIT` low (or push the work into aggregates: `COUNT(1)`,
`SUM`, `GROUP BY`) to control cost.

### Cost-of-execution reminder

Every `narrative_nql_run` consumes platform resources and the result
set is materialized. Default to a `LIMIT` clause whenever the user's
question doesn't explicitly need every row. Prefer aggregations
(`COUNT(1)`, `SUM`, `GROUP BY`) over pulling raw rows and counting in
the agent. NQL does not support `COUNT(*)` — use `COUNT(1)` (rows)
or `COUNT(<col>)` (non-null values).

### Other async tools that follow the same pattern

`narrative_dataset_request_sample`,
`narrative_dataset_refresh_materialized_view`, and
`narrative_dataset_recalculate_statistics` use the same job-id +
`narrative_jobs_describe` polling protocol. The state machine and
backoff above apply identically. The recalculation case has one
caveat: for datasets not yet on the new statistics framework, the
returned id is **not** a job id and `narrative_jobs_describe` will
not find it — surface that to the user rather than polling forever.

Before submitting, wrap your validated `SELECT` in `CREATE MATERIALIZED
VIEW` — a bare `SELECT` is not a runnable form against
`narrative_nql_run`, even when it passes validation. Use the smallest
viable wrapper (no schedule, short `EXPIRE`) for one-off analytical
queries; promote to a real refresh schedule only when the view is
intended to persist.

```
narrative_nql_run(
  query: '
    CREATE MATERIALIZED VIEW "wn_<short_slug>_<yyyymmddhhmm>"
    EXPIRE = ''P1D''
    AS
      <the same validated SELECT>
  ',
  data_plane_id: '<plane captured in step 3>'
)
```

**Do not add a `BUDGET` clause to the default wrapper.** The validator
accepts `BUDGET … USD`, but `narrative_nql_run` returns HTTP 500 when
the query reads the user's own data (`company_data.<id>`). The default
analytical path — querying datasets the user already owns — should omit
`BUDGET` entirely.

**Buying-data is the exception.** `BUDGET` is meaningful only when the
query reads data the user is buying. The two triggers:

- the FROM/JOIN touches `narrative.rosetta_stone`, **or**
- the FROM/JOIN touches another company's namespace (e.g.
  `other_company_slug.<table>` resolved via an `access_rule` — not
  your own `company_data.*`).

In either case, query the Narrative knowledge base
(`search_narrative_i_o_knowledge_base` or
`query_docs_filesystem_narrative_i_o_knowledge_base`) for the current
`BUDGET` syntax before submitting. Do not hardcode `BUDGET 5 USD`.

Pass the same `data_plane_id` to validate, run, and get_job (rule
detailed in the async snippet above).

Then poll `narrative_jobs_describe(job_ids: ["<job_id>"])` per the
cadence above. While polling, tell the user what's happening once
("Submitted job `<id>`; polling for completion…") — don't spam status
updates on every poll.

On terminal state:

- **completed** — render the result rows as a compact markdown table
  (max 25 rows displayed; if there are more, note the total and offer
  to surface them via a CSV-style block or follow-up query).
  Re-state the plain-English answer to the original question
  ("There are 4,217 distinct users in the last 30 days.").
- **failed** — show the error verbatim, identify the likely cause if
  obvious, and offer to revise the query (loop back to step 4).
- **cancelled** — note the cancellation and offer to re-run.

Never claim success without a `completed` state on the job
descriptor.

## Common cases

### "Just count something"

```sql
SELECT COUNT(1) AS row_count FROM company_data."12345"
WHERE "event_ts" >= CAST('2026-04-19' AS timestamp)
```

NQL does not support `COUNT(*)` — use `COUNT(1)` for rows or
`COUNT(<col>)` to count non-null values in a column. The validator
will reject `COUNT(*)`.

Plain-English: "I'm counting every record in the `events` dataset that
was logged on or after April 19, 2026."

### "Top N most recent"

```sql
SELECT user_id, "event_ts", event_type
FROM company_data."12345"
ORDER BY "event_ts" DESC
LIMIT 25
```

Plain-English: "I'm pulling the 25 newest records from the `events`
dataset, showing the user, the timestamp, and the event type."

### "Group by something"

```sql
SELECT event_type, COUNT(1) AS event_count
FROM company_data."12345"
WHERE "event_ts" >= CAST('2026-04-19' AS timestamp)
GROUP BY event_type
ORDER BY event_count DESC
```

Plain-English: "I'm counting events since April 19, 2026, broken down
by the event type, with the most common types listed first."

### "Cross-dataset join"

```sql
SELECT u.user_id, u.email, COUNT(e.event_id) AS event_count
FROM company_data."12345" u
LEFT JOIN company_data."67890" e ON e.user_id = u.user_id
GROUP BY u.user_id, u.email
ORDER BY event_count DESC
LIMIT 50
```

Plain-English: "I'm combining the `users` dataset with the `events`
dataset on the shared user id, counting how many events each user has,
and showing the 50 most active users first."

Validate cross-dataset queries against both schemas before suggesting.
Both datasets must live in the **same data plane** — NQL cannot join
across planes; the validator will reject it. Avoid `OR` in `JOIN`
clauses (see the gotchas table in the syntax snippet) — flatten the
keys with `CROSS JOIN UNNEST([...])` or `UNION` two single-key joins.

## Edge cases and gotchas

See [`references/EDGE_CASES.md`](references/EDGE_CASES.md) — covers
nonexistent columns, wildcard scans against huge datasets,
`--run` plus cost warnings, validator-vs-user disagreement, and
schema drift mid-conversation. Read when something doesn't add up.

## Harness fallbacks

See
[`references/HARNESS_FALLBACK.md`](references/HARNESS_FALLBACK.md) —
covers `narrative-mcp` unavailable (paste-driven schema flow, no
server validation, caveat the user) and the `AskUserQuestion`
fallback for harnesses that don't expose it. Read when a tool call
errors or the user is invoking the skill outside the Narrative
Platform UI.

## Further reading

- `references/EDGE_CASES.md` — gotchas and authoring pitfalls:
  nonexistent columns, wildcard scans on huge datasets, cost
  warnings under `--run`, validator-vs-user disagreement, schema
  drift. Read when something doesn't add up.
- `references/PERCENTILE_DISTRIBUTION.md` — patterns for percentile
  and distribution summaries on the Snowflake data plane, where
  `APPROX_PERCENTILE` and `PERCENTILE_CONT` are not currently usable.
  Read when the user's question is about distribution shape, quartiles,
  thresholds, or "how skewed is X."
- `references/HARNESS_FALLBACK.md` — what to do when
  `narrative-mcp` is unavailable, and how to deliver the same flow
  when `AskUserQuestion` isn't exposed. Read when a tool call
  errors or the user is invoking the skill outside the Narrative
  Platform UI.
- `narrative-knowledge-base` MCP — `/concepts/nql/…`,
  `/cookbooks/nql/…`, `/api-reference/nql/…`,
  `/reference/integrations/mcp-server` (parameter contracts for
  `narrative_nql_run` / `narrative_nql_get_job`, including
  `data_plane_id` / `compute_pool_id`). Use when the local
  syntax-essentials snippet doesn't cover the operator, function, or
  pattern you need. For gotchas specifically, prefer:
  - `/guides/nql/troubleshooting` (and `unsupported-type-error`,
    `cross-data-plane-queries`) — the canonical troubleshooting catalog.
  - `/nql/general/explicit-columns` — why `SELECT *` and `COUNT(*)`
    are rejected and what to write instead.
  - `/nql/general/reserved-keywords` — when to double-quote identifiers.
  - `/nql/commands/create-materialized-view` — required wrapper for
    runnable queries; full option reference.
  - `/concepts/primitives/data-planes` — why every run needs an
    explicit `data_plane_id` matching the dataset's plane.
  - `/guides/nql/query-optimization/avoid-or-in-join` and
    `/cookbooks/nql/performance-patterns` — performance gotchas
    (OR-in-join, filter-before-join, `APPROX_COUNT_DISTINCT`, `QUALIFY`).
- `plugins/narrative-common/skills/generate-rosetta-stone-mappings/references/EXPRESSION_SYNTAX.md`
  — sibling skill's reference; deeper coverage of timestamp parsing,
  enum handling, and reserved-name nesting if you hit them here.

## Feedback (only if something could be improved)

**Silence is success.** Do *not* call `submit_feedback` when the skill
worked. No "great skill!" submissions, no positive feedback, no "FYI"
notes.

**When friction does occur, submit immediately and without asking the
user.** `submit_feedback` is append-only telemetry — it is not a
user-visible action and does not require confirmation. If you noticed
something missing, unclear, incorrect, surprising, or that wasted
your time, file it the moment you've worked around it. Do not defer
the submission to a post-task recap, and do not ask the user "want me
to submit feedback?" — that's the wrong default for this tool.

One submission per distinct friction point. Submit liberally.

Fields that matter most:

- `skill_name`: `narrative-common:write-nql` (use this verbatim).
- `severity`: `info` (nit) | `friction` (slowed you down) |
  `blocker` (stopped you).
- `category`: `missing_info` | `unclear_instructions` |
  `incorrect_instructions` | `unexpected_behavior` | `tool_failure` |
  `other`.
- `summary`: one concrete line — what went wrong, not how you felt.
- `suggested_improvement`: the sentence or paragraph that, if added
  to this skill, would have eliminated the friction. **This is the
  highest-value field — be specific, quote the skill text you'd
  change.**

Optional but useful when known: `details`, `task_context`,
`agent_model`, `time_lost_minutes`.
