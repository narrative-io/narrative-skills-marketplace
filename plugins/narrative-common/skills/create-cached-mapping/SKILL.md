---
name: create-cached-mapping
description: |
  Set up a Rosetta Stone cached mapping that normalizes messy free-text
  values into an attribute's enum, and the scheduled workflow that
  fills its cache. Generates the rules / ML classifier / LLM waterfall
  NQL, creates the mapping, activates the cache, and hands the fill
  workflow to /create-workflow.
  Use when: "normalize these messy values into <attribute>", "set up a
  cached mapping", "clean up free-text <field> with an LLM", "fill the
  cache for <attribute>", "map raw values to the <attribute> enum".
  (narrative-common)
license: MIT
compatibility: >-
  Requires the narrative-mcp MCP server, local file Read, and Bash with
  NIO_API_TOKEN set (cache activation has no MCP equivalent; a manual
  fallback is documented in references/HARNESS_FALLBACK.md). Recommends
  AskUserQuestion (a Claude Code primitive; prose fallback documented in
  the same file) and the narrative-knowledge-base MCP server. Snowflake
  data planes only — AI_COMPLETE and CALL_MODEL_FUNCTION do not exist on
  AWS planes.
metadata:
  version: 0.1.0
  narrative:
    args:
      - name: "--dataset"
        value: "<id|name>"
        required: false
        description: >-
          The source dataset holding the messy raw values. If omitted,
          the skill asks and resolves the name via search.
      - name: "--attribute"
        value: "<id|name>"
        required: false
        description: >-
          The target Rosetta Stone attribute. Must have an enum. If
          omitted, the skill asks and delegates resolution to
          /find-attribute.
      - name: "--tiers"
        value: "<rules,ml,llm>"
        required: false
        default: "rules,ml,llm"
        description: >-
          Which resolution tiers to emit, comma-separated. Always
          applied in the fixed order rules -> ml -> llm regardless of
          how they are listed.
      - name: "--classifier"
        value: "<name:version>"
        required: false
        description: >-
          Registered model name and version for the ML tier. Pass
          `name:` alone to use the model's default version.
      - name: "--threshold"
        value: "<0.0-1.0>"
        required: false
        default: "0.5"
        description: "Minimum classifier confidence for the ML tier to win a key."
      - name: "--llm-model"
        value: "<id>"
        required: false
        default: "openai-gpt-5"
        description: "Cortex model id for the LLM tier."
      - name: "--cap"
        value: "<n>"
        required: false
        default: "10000"
        description: >-
          Maximum LLM calls per refresh. A cost ceiling: keys beyond it
          stay unresolved and are retried next run.
      - name: "--cron"
        value: "<expr>"
        required: false
        description: >-
          Cron expression (UTC) for the fill workflow's schedule. If
          omitted, the skill asks; declining produces a manual-trigger
          workflow.
      - name: "--dry-run"
        required: false
        description: >-
          Generate and display everything — waterfall NQL, fill INSERT,
          workflow spec — but create nothing server-side.
      - name: "<free-text tail>"
        required: false
        description: >-
          What the user wants normalized, e.g. "clean up the breed field
          in vet_intake_raw".
    requires:
      tools:
        - Bash
        - Read
      mcp-servers:
        - narrative-mcp
      mcp-tools:
        - narrative_context_get
        - narrative_datasets_search
        - narrative_datasets_describe
        - narrative_attributes_describe
        - narrative_nql_validate
        - narrative_mapping_create
        - narrative_data_planes_list
      skills:
        - narrative-common:create-workflow
    recommends:
      tools:
        - AskUserQuestion
      mcp-servers:
        - narrative-knowledge-base
      mcp-tools:
        - narrative_context_search_companies
        - narrative_context_set_company
        - narrative_attributes_search
        - narrative_dataset_get_column_stats
        - narrative_jobs_search
        - narrative_jobs_describe
        - search_narrative_i_o_knowledge_base
      skills:
        - narrative-common:find-attribute
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Create Cached Mapping

## Persona

You are a data engineer who makes a messy column readable as a clean
Rosetta Stone attribute, and who is accountable for the model bill that
produces it. You optimize for:

1. Cost control — the LLM only ever runs on rows nothing cheaper
   resolved. Get this wrong and the output looks identical while the
   bill multiplies, so nothing will tell you.
2. A working end state over a created record. A pending cache is worse
   than no mapping: it breaks every query touching the attribute.
3. Cheapest tier first, each expensive tier behind its own reduce step.

You never put `AI_COMPLETE` inside a `CASE` or `COALESCE`, never let an
unvalidated LLM answer reach the cache, and never report success on an
unverified read.

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

A cached mapping resolves an attribute by joining the source dataset
against a cache table at query time — cache hit gives the canonical
value, miss gives NULL. Nothing computes those values at read time,
which is the point: the expensive normalization runs ahead of time and
gets stored.

This skill builds both halves. It produces the **waterfall query** that
resolves messy keys through any mix of exact rules, an ML classifier,
and an LLM; creates the **cached mapping** (which auto-provisions the
cache); **activates** the cache; and hands the **fill workflow** to
`/create-workflow`.

The order is not rearrangeable. The cache does not exist until the
mapping is created, the fill cannot run until the cache is active, and
the waterfall's anti-join references the cache by name — so the query is
finalized after the mapping exists, not before.

## Arguments

Parse up front; never invent values. See `metadata.narrative.args` for
the full list. The ones that change behavior most:

| Argument | Meaning |
| --- | --- |
| `--dataset <id\|name>` | Source dataset with the messy values. |
| `--attribute <id\|name>` | Target attribute. Must have an enum. |
| `--tiers <rules,ml,llm>` | Which tiers to emit. Default all three; always ordered rules → ml → llm. |
| `--classifier <name:version>` | Model for the ML tier. Required if `ml` is in `--tiers`. |
| `--threshold <0.0-1.0>` | ML confidence gate. Default `0.5`. |
| `--llm-model <id>` | Cortex model id. Default `openai-gpt-5`. |
| `--cap <n>` | LLM calls per refresh. Default `10000`. |
| `--cron <expr>` | Fill schedule in UTC. Asked if omitted. |
| `--dry-run` | Generate and show everything; create nothing. |
| Free-text tail | What to normalize. |

## When to use

Triggers:

- "Normalize the free-text `<field>` in `<dataset>` into `<attribute>`"
- "Set up a cached mapping for `<attribute>`"
- "Clean up these messy values with rules and an LLM"
- "Fill / refresh the cache behind `<attribute>`"
- "Map raw values to the `<attribute>` enum"

Do NOT use for:

- **A normalization a single expression can do.** If `UPPER(country)` or
  a `CASE` over six values is enough, use
  `/generate-rosetta-stone-mappings` and get a `value_mapping`. A
  cached mapping adds a cache to keep filled, a workflow to schedule,
  and a class of silent-NULL failures. Only pay that when the
  transformation genuinely needs a model.
- **A one-off cleanup.** If the answer is needed once and not as a live
  attribute, `/write-nql` with `AI_COMPLETE` is the whole job.
- **Object-valued attributes.** The waterfall generator handles scalar
  enum-valued attributes. See
  [`references/EDGE_CASES.md`](references/EDGE_CASES.md).
- **AWS data planes.** `AI_COMPLETE` and `CALL_MODEL_FUNCTION` are
  Snowflake-only. Check the plane in Phase 2 and stop if it is not
  Snowflake.
- **Training the classifier.** That's Classifier Studio. This skill
  consumes a trained model; it does not produce one.

## Procedure

Run phases 1–10 in order. Phases marked **mandatory** must complete
before anything is created server-side. Phases 7–9 each create real
objects, so from phase 7 onward always report what already exists when
something fails.

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

### 2. Resolve the source dataset and confirm the plane — mandatory

Resolve `--dataset` (or the free-text tail) via
`narrative_datasets_search`, then `narrative_datasets_describe` with
`include: ["schema", "metadata", "mappings"]`.

Capture: the dataset's numeric id, its `name`, its data plane, and the
candidate raw columns. Note any mapping that already targets the
attribute you're about to map — a second mapping to the same attribute
is usually a mistake, so surface it and ask before continuing.

Check the plane via `narrative_data_planes_list(include: ["platform"])`.
If it is not Snowflake, stop: the waterfall cannot run there. Say so
plainly and point the user at a Model Inference job as the alternative.

### 3. Resolve the attribute and read its enum — mandatory

Resolve `--attribute` via `narrative_attributes_describe`, or hand the
user's phrasing to `/find-attribute` when only a description is known.

Then extract the **complete list of enum values, verbatim** — exact
casing, accents, parentheses. Every one of them is used twice: in the
LLM prompt and in the validation arms. Getting a single character wrong
turns a correct model answer into the fallback value.

Two hard stops:

- **No enum on the target.** A cached mapping needs a closed
  vocabulary to validate against. Stop and tell the user the attribute
  needs an enum before this can work.
- **An object-valued attribute.** Out of scope; see
  [`references/EDGE_CASES.md`](references/EDGE_CASES.md). Offer a
  scalar alternative rather than guessing at struct construction.

Pick the **fallback value** — where off-enum answers land. Prefer an
existing `Unknown`-like member. If the enum has none, ask the user which
value to use; do not invent one, and do not silently map to the first
member.

### 4. Configure the waterfall — one question per round

Collect what the tiers need. Ask via `AskUserQuestion`, one question at
a time; fill unambiguous defaults without asking.

| Input | Where it lands | Default |
|---|---|---|
| Input expression(s) over raw columns | the `keys` CTE and the mapping's `input_expressions` | ask; suggest `LOWER(TRIM(<col>))` |
| Rules (raw value → canonical value) | the `rules` CTE's `CASE` arms | ask; a tier with no rules is just omitted |
| Classifier name + version | `CALL_MODEL_FUNCTION` args | from `--classifier`; required if the ML tier is on |
| Class-index lookup dataset | the `resolved` CTE's join | ask; `PREDICT` returns an index, not a name |
| Confidence threshold | `ml_conf >= <threshold>` | `0.5` |
| LLM model | `AI_COMPLETE` args | `openai-gpt-5` |
| LLM row cap per refresh | the `QUALIFY` clause | `10000` |

Two things to get right here rather than later:

- **The input expression is the join key.** Keep it on raw columns:
  resolving the attribute this mapping populates would compile into a
  join against the cache the query is about to fill. It must also be
  byte-identical everywhere it appears — fix its exact text now and
  reuse that string, don't retype it.
- **Suggest rules from the data, don't wait to be asked.** Call
  `narrative_dataset_get_column_stats` on the raw column and offer the
  frequent values as candidate rules. The highest-frequency messy
  values are where rules pay off most, since each one permanently
  removes a key from the model's workload.

If the user configures a tier set with no LLM, tell them it is a valid
but untested shape before proceeding.

### 5. Generate and validate the NQL — mandatory

Substitute the phase-4 configuration into
[`assets/templates/waterfall-skeleton.sql`](assets/templates/waterfall-skeleton.sql),
deleting the CTE pairs for tiers that are off.

Read [`references/NQL_GENERATION.md`](references/NQL_GENERATION.md) for
the mechanics — prompt construction, enum arm generation, view naming,
and the validation protocol. Read
[`references/WATERFALL_NQL.md`](references/WATERFALL_NQL.md) for the
per-combination diffs and why each CTE exists.

The rules that hold on every run, whether or not you read further:

- **The prompt is a column**, built in `llm_in`, listing every enum
  value verbatim, at `temperature: 0`.
- **Enum arms come from the attribute's enum**, not from a classifier's
  class lookup.
- **Every expensive tier sits below a reduce CTE**, and `AI_COMPLETE`
  never appears inside a `CASE` or `COALESCE`.
- **Give the view a `DISPLAY_NAME` and a `DESCRIPTION`** — the unique
  name is a machine identifier and useless to a human scanning a list.
- **Validate before anything is shown or created.** Validation is
  two-pass, because the cache doesn't exist yet: here, validate with the
  `keys` anti-join omitted; in phase 7, validate the complete query
  against the real cache name. Retry a failure up to 3 times, then
  surface the latest error verbatim and stop. Never substitute
  `narrative_nql_run` — for this query, running it spends money on model
  calls.

### 6. Show the plan and gate creation — mandatory

Nothing has been created yet. Show, in this order:

1. **What will happen to the data**, in plain language: which column
   feeds it, which attribute it populates, and roughly how each tier
   shares the work.
2. **The cost shape.** How many distinct keys exist in the source
   column (`narrative_dataset_get_column_stats`, or a validated
   `COUNT(DISTINCT ...)`), how many the rules should absorb, and the
   worst case for the first fill — bounded by `--cap` LLM calls per
   refresh. This is the number that surprises people; lead with it, do
   not append it.
3. **The objects to be created**, as a table: the cached mapping, the
   auto-provisioned cache, the resolved view, the fill workflow.
4. **The full NQL** only if `--dry-run` was passed or the user asks.

State the caveats inline, not as a footnote:

- "Until the first fill completes, this attribute reads NULL for every
  row."
- "The cache is filled on the schedule you choose. New raw values are
  NULL until the next run."
- "Keys past the cap of `<n>` stay unresolved and are retried next run."

If `--dry-run`: stop here. Otherwise ask with `AskUserQuestion` whether
to create it, refine it, or cancel. Honor the answer exactly; never
create on an ambiguous one.

### 7. Create the mapping and capture the cache — mandatory

```
narrative_mapping_create(
  attribute_id: <id>,
  dataset_id: <id>,
  mapping: { type: "cached_mapping", input_expressions: ["<expr>", ...] }
)
```

Omit any cache dataset id — the cache is auto-provisioned, correctly
shaped, on the source's plane. Never hand-build one.

Then read the cache back with `narrative_datasets_describe` and capture
its `name`, its `id`, and its **actual schema**. The convention is
`input_0 … input_{n-1}` plus `mapped_value`, one typed column per input
expression in order — but write the columns the cache reports, not the
ones you expect. Published docs describing `input` / `output` columns or
a separator-concatenated composite key are wrong.

Now substitute the real cache name into the waterfall's anti-join,
generate the fill INSERT against the cache's real column names, and
re-validate both.

### 8. Activate the cache — mandatory

The auto-provisioned cache lands in `status: "pending"`, and a pending
dataset has no physical table. Every write path and every read of the
attribute fails against it with a misleading "not found" for a dataset
that plainly exists.

```bash
curl --request PUT "https://api.narrative.io/datasets/<CACHE_ID>/activate" \
  --header "Authorization: Bearer $NIO_API_TOKEN"
```

Then confirm with `narrative_datasets_describe` that the status is
`active`. **Do not proceed to phase 9 until it is** — a workflow
submitted against a pending cache fails in about 1.5 seconds without
spawning a job.

If `Bash` or the token is unavailable, print the command and let the
user run it, or point them at the dataset's page in the platform UI. See
[`references/HARNESS_FALLBACK.md`](references/HARNESS_FALLBACK.md).

This phase exists only because the platform has no auto-activation yet
(SC-63910). When that ships, delete it.

### 9. Hand the fill workflow to `/create-workflow`

`/create-workflow` owns the workflow mechanics: composing the spec,
resolving the plane, the approval gate, submission, and run reporting.
Do not reimplement any of it.

Invoke it with `examples/12-cached-mapping-cache-fill.yaml` as the
starting shape and these substitutions:

| Slot | Value |
|---|---|
| resolved view name + NQL | from phase 7 |
| cache dataset name | from phase 7 |
| fill INSERT | from phase 7 |
| `schedule.cron` | from `--cron`, or ask |
| data plane | the source dataset's plane |

The workflow is three sequential tasks: create the resolved view,
refresh it, then INSERT into the cache. The refresh task is load-bearing
— `CreateMaterializedViewIfNotExists` no-ops once the dataset exists, so
without it every run after the first would insert from a stale view.

When `/create-workflow` returns, report the workflow id and run id, then
add what it cannot know: the mapping id, the cache id and its active
status, and the resolved view name.

If it fails, do not retry blindly. Report that the mapping and cache
exist and are active, so the user knows what they have.

### 10. Verify a real read — mandatory before claiming success

A created workflow is not a working attribute, and a terminal
`completed` is not proof of one. Four steps, in order:

1. **Poll the run to terminal** using the ids `/create-workflow`
   returned — it submits but does not poll. Terminal states are
   `completed`, `failed`, `terminated`. On `failed`, surface the failing
   step's error verbatim and stop; do not auto-retry.
2. **Check `insertedRows`** on the `fillCache` task. Zero is a failure
   mode, not a quiet success — most often the input expression in the
   mapping and in the waterfall have drifted apart.
3. **Confirm the cache holds rows**, by describing it with
   `include: ["stats"]`.
4. **Validate a read of the attribute** — that is what proves the
   mapping compiles and the cache resolves:

   ```sql
   SELECT d.<some_id_column>, d._rosetta_stone.<attribute_name>
   FROM company_data.<source_dataset> d
   ```

   Only *run* it if the user asks, and say it costs compute first.

Report the tier breakdown from the resolved view unprompted — it tells
the user whether their rules and threshold are earning their keep.

For the polling protocol, the step-level job drill-down, and a table
mapping each "succeeded but the attribute is blank" symptom to its
cause, read
[`references/VERIFICATION.md`](references/VERIFICATION.md).

## Common cases

| Case | Configuration | Notes |
|---|---|---|
| Messy free-text with a trained classifier | rules + ml + llm | The reference shape. Rules absorb the frequent junk, the classifier handles what it was trained on, the LLM takes the tail. |
| Messy free-text, no model trained yet | rules + llm | Same skeleton minus three CTEs. Costs more per key than the full waterfall; a reasonable start before Classifier Studio. |
| Classifier exists, no obvious rules | ml + llm | No `ml_in` — with no tier above it there is nothing to reduce against. Note that a key the rules *would* have caught may now be answered by the classifier instead, which can change the value. |
| High-volume column, cost anxiety | any tiers, low `--cap` | Set the cap to what the user will tolerate per run. Unresolved keys read NULL and are retried next run; the cache fills over several runs rather than one. |
| Re-filling an existing cached mapping | skip phases 6–8 | The mapping and cache already exist. Read the cache's name and schema, generate the waterfall and fill, go straight to phase 9. |

## Edge cases and gotchas

Full prose for each in
[`references/EDGE_CASES.md`](references/EDGE_CASES.md).

- **Pending cache reports "not found"** — check status before SQL; this
  is phase 8's entire reason for existing.
- **`AI_COMPLETE` rejects an expression as its prompt** — build the
  prompt as a column in the preceding CTE.
- **Row cap must be `QUALIFY`, not `LIMIT`** — an MV stores an
  unordered bag, so `LIMIT` doesn't bound later reads.
- **`NOT IN` against the cache can silently return zero rows** — cache
  columns are nullable; use the `LEFT JOIN … IS NULL` anti-join.
- **An INSERT source may only scan this company's datasets** — the
  cross-company `narrative.rosetta_stone` table and third-party access
  rules are rejected; your own attributes are fine. Keep the waterfall
  on raw columns to avoid reading the cache it fills.
- **Input expression must be byte-identical in three places** — the
  usual cause of "the fill succeeded but the attribute is blank."
- **Multi-column keys are not concatenated** — one `input_i` column per
  input expression; read the cache's real schema.
- **Object-valued attributes** — out of scope; don't guess at struct
  construction.
- **`CreateMaterializedViewIfNotExists` no-ops on re-runs** — which is
  why the emitted workflow has a refresh task.
- **A cache is a writable table, not an MV** — `INSERT` into an MV is
  rejected.
- **Cached mappings can't target opt-out attributes, can't back a
  materialized field, and return no mapping preview** — the empty
  preview is expected, not a failure.

## Harness fallbacks

Full detail in
[`references/HARNESS_FALLBACK.md`](references/HARNESS_FALLBACK.md).

- **`narrative-mcp` unavailable** — render-only. Generate the NQL from
  user-supplied context, warn that nothing was validated, stop before
  mapping creation.
- **No activation path (`Bash` or token missing)** — print the `curl`
  command or point at the platform UI, and do not submit the fill
  workflow until the user confirms the cache is active.
- **`narrative-knowledge-base` unavailable** — proceed; the references
  here carry everything required.
- **`narrative_attributes_describe` fails** — stop and ask the user to
  paste the enum values. Never invent them.
- **`narrative_nql_validate` unreachable** — surface the NQL with an
  explicit "not validated" warning and require confirmation. Never
  substitute `narrative_nql_run`; for this query it spends money on
  model calls.
- **`AskUserQuestion` unavailable** — ask in prose, one question per
  turn.

## Further reading

- [`references/WATERFALL_NQL.md`](references/WATERFALL_NQL.md) — the one
  cost rule and how it was proven, the skeleton, per-combination diffs,
  the cache anti-join, enum validation, and the proven run table with
  job ids. Read in phase 5.
- [`references/NQL_GENERATION.md`](references/NQL_GENERATION.md) — prompt
  construction, enum arm generation, view naming, the two-pass
  validation protocol. Read in phase 5.
- [`references/VERIFICATION.md`](references/VERIFICATION.md) — polling,
  step-level job drill-down, the tier-breakdown query, and symptom →
  cause for a fill that "worked" but left the attribute blank. Read in
  phase 10.
- [`references/EDGE_CASES.md`](references/EDGE_CASES.md) — every known
  failure mode, including the ones that fail silently.
- [`references/HARNESS_FALLBACK.md`](references/HARNESS_FALLBACK.md) —
  degraded-mode behavior per tool.
- [`assets/templates/waterfall-skeleton.sql`](assets/templates/waterfall-skeleton.sql)
  — the annotated query to substitute into.
- Sibling skills: `/create-workflow` (owns the fill workflow, and ships
  the `12-cached-mapping-cache-fill.yaml` example this skill composes
  against), `/find-attribute` to resolve the attribute,
  `/generate-rosetta-stone-mappings` when an expression would do,
  `/write-nql` for a one-off cleanup.
- `narrative-knowledge-base` MCP — `/reference/rosetta-stone/mapping-types`
  (mapping shapes and cached-mapping constraints),
  `/nql/functions/ai-functions` (`AI_COMPLETE`,
  `CALL_MODEL_FUNCTION`), `/cookbooks/nql/ai-enrichment` (Cortex grants
  and cross-region setup), `/reference/ui/classifier-studio` (training
  the model this skill consumes).

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

- `skill_name`: `narrative-common:create-cached-mapping` (use this verbatim).
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
