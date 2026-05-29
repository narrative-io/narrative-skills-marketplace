---
name: write-nql
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
license: MIT
compatibility: >-
  Requires the narrative-mcp MCP server. Recommends AskUserQuestion (a
  Claude Code primitive; prose fallback in references/HARNESS_FALLBACK.md)
  and the narrative-knowledge-base MCP server. Portable to any
  agentskills.io-compliant harness via the documented fallbacks.
metadata:
  version: 0.5.3
  args:
    - name: "--run"
      required: false
      description: >-
        Skip the end-of-flow confirmation and execute the query
        immediately after validation succeeds.
    - name: "--dataset"
      value: "<id>"
      required: false
      description: "Pre-bind the target dataset. Skips the dataset-search step."
    - name: "--limit"
      value: "<n>"
      required: false
      description: >-
        Override the default LIMIT (default 100 for raw selects, no limit
        for aggregations).
    - name: "--no-explain"
      required: false
      description: >-
        Skip the plain-English explanation. Use only when the caller is
        another skill or automation.
    - name: "<free-text tail>"
      required: false
      description: >-
        Treated as the user's question (e.g., /write-nql --dataset 12345
        how many distinct users last 30 days). With no arguments, the skill
        walks the user through the flow interactively.
  narrative:
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

## Output rules

**Don't surface `_nio_*` field names to the user.** Columns and
fields whose names start with `_nio_` (e.g., `_nio_last_modified_at`,
`_nio_sample_128`) are platform-managed internals. Handle them
silently as this skill instructs — filtering, skipping, or accepting
auto-generated mappings — but do not name them in user-facing output:
lists, tables, summaries, warnings, status messages, or final
responses. Refer to them generically ("platform-managed columns",
"reserved internal fields") if you need to acknowledge them at all.

Exception: if the user expressly asks about `_nio_*` fields, answer
normally.

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

Validate any NQL before executing it, submitting it in a workflow,
or displaying it to the user:

```
narrative_nql_validate(nql=<query>, data_plane_id=<plane>)
```

Pass `data_plane_id` matching the dataset's plane — without it, the
validator falls back to the company default plane and can report
spurious "Unknown Table" errors.

If validation fails:

1. Read the error message and pointer.
2. Fix using the cheat sheet at
   `plugins/narrative-common/skills/write-nql/references/NQL_VALIDATION_ERRORS.md`.
3. Re-validate. Repeat up to 3 times — but only if your skill
   *generates* the NQL. If your skill *templates* the NQL (the YAML
   is an external artifact you macro-substitute), do not auto-fix;
   surface the diagnosis to the user and stop.
4. After 3 failed attempts (generator) or any failed validation
   (templater), surface the latest error to the user **verbatim** —
   not paraphrased; the wording carries the locator info.

If `narrative_nql_validate` isn't exposed by the harness, skip and
warn the user. Do not substitute `narrative_nql_run`; it allocates
compute.

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
3. **Pass the same `data_plane_id` to validate, run, and get_job.** If you need to discover available planes (e.g. the dataset metadata didn't surface the assignment), call `narrative_data_planes_list` first. See the gotchas reference for the failure mode this prevents — most visibly, validator-only "Unknown Table" errors on numeric-id references that run accepts.

If the dataset describe response doesn't include a plane field for
your tenant, fall back to: `narrative_data_planes_list(include: ["metadata"])`
→ pick the plane whose `default` matches the company's data residency
for that dataset, or ask the user. **Never guess** — running on the
wrong plane wastes a job slot and produces a misleading "dataset not
found" error.

Poll with `narrative_jobs_describe(job_ids: ["<uuid>"])` until `state`
is terminal.

Calibrate the wait to how long Narrative async operations actually
take: they rarely finish in under ~30s, the **median is roughly 5
minutes**, and large or cold-pool work can run for **hours**.
Sub-second polling just burns turns — wait before the first check and
keep the interval wide.

**Prefer a non-blocking watcher over a foreground sleep.** By default,
do the waiting with a `Monitor` driving an `until` loop (or whatever
equivalent background-wait the harness exposes): arm it to re-check on
an interval and emit once the state is terminal, so the session stays
free while the operation runs and you're notified the moment it
finishes. (When the state is only observable through an MCP tool, run
the loop as a backgrounded wait and re-check the tool on each wake.)
**Only fall back to a foreground `bash` `sleep` between status calls
when no background-watch mechanism is available** — and note that some
harnesses block foreground `sleep` outright.

**Cadence.** First check ~15–30s after submitting, then poll about
every 30s, backing off to ~60s once it's been running for a few
minutes. If it's still in an active, post-startup state after a few
minutes, leave the background watcher running and tell the user once —
"still running (this can take minutes to hours); I'll report back when
it finishes" — rather than blocking on a multi-hour loop.

**Give-up rule — abandon a *stuck* operation, not a merely slow one.**
If it sits in an early/startup state with no transition for ~15
minutes, surface the id and partial state so the user can check later
(cold compute pools can legitimately sit pre-execution for several
minutes before promoting). Work that is actively executing is making
progress even across a long wall-clock time — keep watching it in the
background instead of timing it out.

For NQL jobs the early/startup states are `queued` / `pending` (where
the stuck-job give-up rule applies) and the active states are
`running` / `processing`.

Terminal states:

| `state` | Meaning | Next step |
| --- | --- | --- |
| `completed` | Job finished. **The payload depends on job type — rows almost never live here.** | See [`references/NQL_ASYNC_DEEP.md`](references/NQL_ASYNC_DEEP.md) for what `result` looks like per job type. |
| `failed` | Engine error mid-execution | Read `failures` from the job payload; show it to the user verbatim; revise query and retry |
| `cancelled` | Operator or timeout abort | Tell the user the job was cancelled; offer to re-run |

Non-terminal states (`queued`, `running`, `processing`) → keep
polling. Never treat them as a result.

> Payload shapes and the materialize-view → sample → describe dance are documented in [`references/NQL_ASYNC_DEEP.md`](references/NQL_ASYNC_DEEP.md).

Before submitting, wrap your validated `SELECT` in `CREATE MATERIALIZED
VIEW` — a bare `SELECT` is not a runnable form against
`narrative_nql_run`, even when it passes validation. Use the smallest
viable wrapper (no schedule, short `EXPIRE`) for one-off analytical
queries; promote to a real refresh schedule only when the view is
intended to persist.

Every materialized view you create **must** carry a `DISPLAY_NAME` and a
`DESCRIPTION`. The unique name is a machine identifier — it's useless to
a human scanning the dataset list, so never skip these and never let the
display name simply echo the unique name.

- **`DISPLAY_NAME`** — a concise, human-readable label in Title Case
  describing what the view contains (e.g. `Distinct Users — Last 30 Days`).
  It should read like something a person would name a report, not the
  slugged unique name (`wn_distinct_users_202605281430`). No timestamp —
  that lives in metadata and already disambiguates reruns.
- **`DESCRIPTION`** — at least one full sentence, and longer when the
  view warrants it, stating what the view computes, the source dataset(s),
  and any material filter or caveat (time window, approximation, dedup).
  Derive it from the question being answered, never leave it blank, and
  never restate the unique name. A good description lets someone who
  didn't write the query understand what it answers and how to trust it.

```
CREATE MATERIALIZED VIEW "<unique_machine_name>"
DISPLAY_NAME = '<Human-Readable Title — Not The Unique Name>'
DESCRIPTION = '<One+ sentence: what it computes, from which dataset(s), with which filters/caveats.>'
...
```

Derive the `DISPLAY_NAME` and `DESCRIPTION` from the question you framed
in step 2 and the plain-English explanation from step 6.

```
narrative_nql_run(
  query: '
    CREATE MATERIALIZED VIEW "wn_<short_slug>_<yyyymmddhhmm>"
    DISPLAY_NAME = ''<Human-Readable Title — Not The Unique Name>''
    DESCRIPTION = ''<One+ sentence: what it computes, from which dataset(s), with which filters/caveats.>''
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

## References

- [`references/EDGE_CASES.md`](references/EDGE_CASES.md) — nonexistent columns, wildcard scans on huge datasets, `--run` cost warnings, validator-vs-user disagreement, schema drift. Read when something doesn't add up.
- [`references/HARNESS_FALLBACK.md`](references/HARNESS_FALLBACK.md) — `narrative-mcp` unavailable (paste-driven schema, no server validation), `AskUserQuestion` fallback. Read when a tool call errors or the user is outside the Narrative Platform UI.
- [`references/PERCENTILE_DISTRIBUTION.md`](references/PERCENTILE_DISTRIBUTION.md) — percentile/distribution patterns on the Snowflake data plane where `APPROX_PERCENTILE` and `PERCENTILE_CONT` aren't usable. Read for distribution shape, quartiles, thresholds, skew.
- [`references/NQL_GOTCHAS.md`](references/NQL_GOTCHAS.md) — full failure-mode catalog (GEOMETRY, OR-in-JOIN, cross-plane, QUALIFY-in-CMV, percentile fallbacks, reserved keywords, dataset-id quoting). Read when a draft fails validation or a passed-validation query 500s at run.
- [`references/NQL_VALIDATION_ERRORS.md`](references/NQL_VALIDATION_ERRORS.md) — error-message → canonical-fix cheat sheet. Read when `narrative_nql_validate` returns an error and you want the shortest path to green.
- [`references/NQL_QUOTING_AND_TABLE_REFS.md`](references/NQL_QUOTING_AND_TABLE_REFS.md) — schema list (`company_data` / `<provider_slug>` / `narrative`), `unique_name`-vs-numeric-id rules, reserved-words catalog, Rosetta Stone scope syntax. Read when a happy-path `company_data.<dataset_name>` reference isn't enough.
- [`references/NQL_ASYNC_DEEP.md`](references/NQL_ASYNC_DEEP.md) — `completed` payload shape per job type, the materialize-view → sample → describe dance, sibling async tools. Read when a job finishes but you can't find the rows.
- `narrative-knowledge-base` MCP — `/concepts/nql/…`, `/cookbooks/nql/…`, `/api-reference/nql/…`, `/reference/integrations/mcp-server` for parameter contracts (`data_plane_id`, `compute_pool_id`). For gotchas: `/guides/nql/troubleshooting`, `/nql/general/explicit-columns`, `/nql/general/reserved-keywords`, `/nql/commands/create-materialized-view`, `/concepts/primitives/data-planes`, `/guides/nql/query-optimization/avoid-or-in-join`, `/cookbooks/nql/performance-patterns`.
- `plugins/narrative-common/skills/generate-rosetta-stone-mappings/references/EXPRESSION_SYNTAX.md` — sibling reference covering timestamp parsing, enum handling, reserved-name nesting.

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
