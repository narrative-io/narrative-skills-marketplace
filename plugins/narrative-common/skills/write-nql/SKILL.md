---
name: write-nql
version: 0.1.0
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
    tools:
      - AskUserQuestion
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
    mcp-servers:
      - narrative-knowledge-base
    mcp-tools:
      - search_narrative_i_o_knowledge_base
      - query_docs_filesystem_narrative_i_o_knowledge_base
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Write NQL

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

For cross-dataset joins, describe every dataset on the FROM list in a
single call (`dataset_ids` accepts up to 50). Confirm a join key exists
in both schemas before drafting.

### 4. Draft the NQL query — mandatory

Apply the rules below when writing the query. Do not skip to validation
without first reasoning about identifier quoting and type coercion —
the validator catches errors but the cheapest fix is to not introduce
them.

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

Drafting heuristics specific to this skill:

- **Default to a `LIMIT`.** Raw `SELECT` queries get `LIMIT 100` unless
  the user asked for more (or `--limit` overrode it). Aggregations
  (`COUNT`, `GROUP BY`) usually don't need one.
- **Push work into the query.** If the user asked "how many distinct
  users", emit `SELECT COUNT(DISTINCT user_id) …`, not a raw select
  that you would then count agent-side.
- **Project the columns the user asked about, not `*`.** Wide
  `SELECT *` queries produce noisy result payloads and slower jobs.
- **Use ISO date literals.** `WHERE "event_ts" >= CAST('2026-04-19' AS timestamp)`
  is unambiguous; `'04/19/26'` is not.

### 5. Validate — mandatory, with retry

```
narrative_nql_validate(nql: '<your full query>')
```

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
  "the first 100 matching records"; `COUNT(DISTINCT x)` → "the number
  of unique x values"; `GROUP BY` → "broken down by"; `WHERE` → "only
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
  nql: 'select … from company_data."<id>" limit 100'
)
→ { job_id: "<uuid>", state: "queued", ... }
```

Poll with `narrative_jobs_describe(job_ids: ["<uuid>"])` until `state`
is terminal. Use a short, bounded backoff — most queries finish in a
few seconds; very few should need more than 60s of polling.

Suggested polling cadence: 1s, 2s, 3s, 5s, 5s, 5s, 10s, 10s, 10s, 15s,
15s, … cap at ~15s between polls, give up at 5 minutes total wall
time and surface the partial state to the user.

Terminal states:

| `state` | Meaning | Next step |
| --- | --- | --- |
| `completed` | Rows are available on the job descriptor | Read `result` / `rows` / `output_url` from the job payload |
| `failed` | Engine error mid-execution | Read `error` from the job payload; show it to the user verbatim; revise query and retry |
| `cancelled` | Operator or timeout abort | Tell the user the job was cancelled; offer to re-run |

Non-terminal states (`queued`, `running`, `processing`) → keep
polling. Never treat them as a result.

### Cost-of-execution reminder

Every `narrative_nql_run` consumes platform resources and the result
set is materialized. Default to a `LIMIT` clause whenever the user's
question doesn't explicitly need every row. Push aggregations into
the query (`COUNT(*)`, `SUM`, `GROUP BY`) instead of pulling raw rows
back and counting in the agent.

### Other async tools that follow the same pattern

`narrative_dataset_request_sample` and
`narrative_dataset_recalculate_statistics` use the same job-id +
`narrative_jobs_describe` polling protocol. The state machine and
backoff above apply identically.

Submit the validated query:

```
narrative_nql_run(nql: '<the same validated NQL>')
```

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
SELECT COUNT(*) FROM company_data."12345"
WHERE "event_ts" >= CAST('2026-04-19' AS timestamp)
```

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
SELECT event_type, COUNT(*) AS event_count
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

## Edge cases and gotchas

- **The user asks about a column that doesn't exist.** Don't fabricate
  a similarly named column. Surface the closest matches from the
  schema with `AskUserQuestion` and let them confirm.
- **The user asks for a wildcard scan against a huge dataset.** If
  `metadata.record_count` is large (>50M) and no filter is present,
  warn explicitly in the explanation and propose a sample (`TABLESAMPLE
  BERNOULLI(1)`) or a tighter filter before running.
- **`--run` plus a query that scans everything.** Honor `--run`, but
  still surface the cost warning in the explanation *before*
  submitting the job.
- **Validator says the query is fine but the user disagrees.** Treat
  the user's interpretation as the source of truth for intent. Loop
  back to step 4; do not argue.
- **MCP gives a non-deterministic schema.** Re-describe before
  blaming the validator if columns "disappear" between calls; the
  platform may have updated the dataset mid-conversation.

## Harness fallbacks

If `narrative-mcp` is unavailable:

- Ask the user to paste the dataset's schema (column names + types)
  and 10-25 sample rows.
- With that context pasted in, draft the query and apply the syntax
  rules above manually. You cannot validate without the server — add
  a global caveat in the explanation that the query has *not* been
  server-validated and the user should sanity-check before running it
  through the Narrative UI.
- Never silently degrade. If validation was skipped, say so
  explicitly.

## Further reading

- `narrative-knowledge-base` MCP — `/concepts/nql/…`,
  `/cookbooks/nql/…`, `/api-reference/nql/…`. Use when the local
  syntax-essentials snippet doesn't cover the operator, function, or
  pattern you need.
- `plugins/narrative-common/skills/generate-rosetta-stone-mappings/references/EXPRESSION_SYNTAX.md`
  — sibling skill's reference; deeper coverage of timestamp parsing,
  enum handling, and reserved-name nesting if you hit them here.
