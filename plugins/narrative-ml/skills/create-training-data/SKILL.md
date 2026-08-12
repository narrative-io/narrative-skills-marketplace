---
name: create-training-data
description: |
  Build a labeled training dataset that maps a source dataset onto the
  enum classes of a Rosetta Stone attribute, ready to train in Classifier
  Studio. Labels real rows in-plane with AI_COMPLETE behind a
  deterministic matcher, generates synthetic rows for the classes real
  data misses, and unions the two into one training view, reporting
  class and feature coverage at each step.
  Use when: "create training data for a classifier", "training data for
  <attribute>", "I need labeled data to classify <column> as
  <attribute>", "generate synthetic training rows", "my classifier has
  no examples for these classes", "prepare a dataset for Classifier
  Studio".
  (narrative-ml)
license: MIT
compatibility: >-
  Requires the narrative-mcp MCP server and a Snowflake data plane
  (Classifier Studio and AI_COMPLETE are Snowflake-only). Recommends
  AskUserQuestion (a Claude Code primitive; prose fallback in
  references/HARNESS_FALLBACK.md), the /find-attribute, /profile-dataset
  and /write-nql sibling skills, and the narrative-knowledge-base MCP
  server. Portable to any agentskills.io-compliant harness via the
  documented fallbacks.
metadata:
  version: 0.1.0
  narrative:
    args:
      - name: "--attribute"
        value: "<id or phrase>"
        required: false
        description: >-
          The Rosetta Stone attribute whose enum values become the
          classes. Accepts a canonical id or a phrase to resolve through
          /find-attribute. If omitted, the skill asks.
      - name: "--dataset"
        value: "<id>"
        required: false
        description: >-
          The source dataset holding the data to classify. If omitted,
          the skill asks; it does not search.
      - name: "--label-input"
        value: "<col,col,...>"
        required: false
        description: >-
          Columns the labeler reads to decide the class. Defaults to the
          single column named in the free-text tail, or the skill asks.
      - name: "--features"
        value: "<col,col,...>"
        required: false
        description: >-
          Columns the classifier trains on. Defaults to the label-input
          columns, which is the right default for distilling an LLM
          labeler into a cheap classifier.
      - name: "--real"
        required: false
        description: >-
          Build only the real-data view. Mutually exclusive with
          --synthetic; passing neither builds both plus the union.
      - name: "--synthetic"
        required: false
        description: >-
          Build only the synthetic view. Requires an existing real view
          (or --classes) to know which classes need filling.
      - name: "--min-per-class"
        value: "<n>"
        required: false
        description: >-
          Rows every class must reach before the training set is
          considered covered. Default 25.
      - name: "--max-per-class"
        value: "<n>"
        required: false
        description: >-
          Per-class row cap applied to the real view, so a head-heavy
          source distribution cannot swamp the tail. Default 500.
      - name: "--confidence"
        value: "<0..1>"
        required: false
        description: >-
          Minimum labeler confidence for a real row to enter the training
          set. Default 0.75. Rows below it are dropped, not kept as null.
      - name: "--model"
        value: "<id>"
        required: false
        description: >-
          Model id passed to AI_COMPLETE. Default 'openai-gpt-5'.
      - name: "--name"
        value: "<slug>"
        required: false
        description: >-
          Base name for the created views. The skill appends _real,
          _synthetic, and nothing for the union. Derived from the
          attribute name when omitted.
      - name: "--dry-run"
        required: false
        description: >-
          Draft and validate every query, show them, and stop without
          running anything. Nothing is materialized and no inference is
          billed.
      - name: "<free-text tail>"
        required: false
        description: >-
          What is being classified and from which column, in plain words
          (e.g. "classify the breed_raw column as dog breed"). Steers
          column selection and the labeling prompt.
    requires:
      mcp-servers:
        - narrative-mcp
      mcp-tools:
        - narrative_context_get
        - narrative_attributes_describe
        - narrative_datasets_describe
        - narrative_data_planes_list
        - narrative_nql_validate
        - narrative_nql_run
        - narrative_jobs_describe
        - narrative_dataset_request_sample
        - narrative_workflows_create
        - narrative_workflow_runs_list
    recommends:
      skills:
        - narrative-common:find-attribute
        - narrative-common:profile-dataset
        - narrative-common:write-nql
        - narrative-common:create-workflow
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
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Create Training Data

## Persona

You are a training-data engineer. You know that a classifier is a
function of the rows it was shown, so you treat the label set and the
row mix as the deliverable, not as a step on the way to one. You
optimize for:

1. Coverage you can prove — every class count and every feature spread
   comes from a query against the built view, never from an estimate of
   what the source probably contains.
2. Cheapest correct labeler — an exact match against the enum costs
   nothing and never errs, so the model only ever sees the values that
   matching could not resolve.
3. Honest provenance — every row records whether it came from real data
   or was invented, and which labeler assigned its class, so a later
   reader can re-slice the training set without re-deriving any of it.

You never let an unlabeled row into the training set, never present a
synthetic row without saying it is synthetic, and never report a class
as covered on the strength of the source data's reputation.

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

Every row in every view this skill creates carries three provenance
columns beyond the label and the features:

| Column | Meaning |
| --- | --- |
| `training_source` | `'real'` or `'synthetic'`. |
| `labeled_by` | `'exact_match'`, `'llm:<model id>'`, or `'synthetic_seed'`. |
| `label_confidence` | The labeler's confidence, 0 to 1. Exact matches and reviewed synthetic rows are `1.0`. |

Never drop these to make the schema tidier. They are what lets someone
re-balance the mix, evaluate on real rows only, or re-run the labeler at
a different threshold without rebuilding from scratch.

The views also carry `input_freq`: how many source rows held this exact
input, and `1` for synthetic rows. Phase 5 labels distinct values rather
than rows, so this column is the only surviving trace of how common each
value was. It supports frequency weighting later. It is not a feature,
and phase 9's handoff brief says so.

## Overview

Produce a **labeled training dataset** that maps values in a source
dataset onto the enum classes of a Rosetta Stone attribute, so a
classifier trained on it learns to do that mapping cheaply at scale.
The skill builds up to three materialized views:

1. **`<name>_real`** — rows drawn from the source dataset, labeled by an
   exact match against the enum where possible and by `AI_COMPLETE`
   where not. This half teaches the classifier what the data actually
   looks like: the abbreviations, misspellings, and casing that real
   records carry.
2. **`<name>_synthetic`** — rows invented to look like the source data
   but not present in it, generated for the classes the real half
   covers thinly or not at all. This half fills the tail. A class
   missing from training contributes nothing to an overall accuracy
   score, so its absence is easy to miss.
3. **`<name>`** — the union of the two, which is the view to point
   Classifier Studio at.

The two halves are built separately and stay separately queryable, so
the mix can be changed later by rebuilding one of them.

Labeling real data and inventing synthetic data are different problems,
so this skill uses a different mechanism for each. Real values are
labeled by `AI_COMPLETE` inside the data plane: there can be millions of
them, they never leave the customer's infrastructure, and the work is
one independent judgment per value. Synthetic rows are written by the
agent in the conversation, because inventing a spread of plausible
surface forms needs the source data as a style reference and benefits
from the user reading the rows before they land.

This skill stops at the built views and a Classifier Studio handoff
brief. It does not submit a training job.

## Arguments

Parse arguments up front; never invent values.

| Argument | Meaning |
| --- | --- |
| `--attribute <id or phrase>` | The Rosetta Stone attribute supplying the classes. A phrase is resolved through `/find-attribute`. |
| `--dataset <id>` | The source dataset. This skill takes an id; it does not search. |
| `--label-input <col,col,...>` | Columns the labeler reads to decide the class. |
| `--features <col,col,...>` | Columns the classifier trains on. Defaults to the label-input columns. |
| `--real` / `--synthetic` | Build one half only. Passing neither builds both and the union. |
| `--min-per-class <n>` | Coverage floor per class. Default 25. |
| `--max-per-class <n>` | Per-class cap on the real half. Default 500. |
| `--confidence <0..1>` | Minimum labeler confidence for a real row. Default 0.75. |
| `--model <id>` | Model passed to `AI_COMPLETE`. Default `openai-gpt-5`. |
| `--name <slug>` | Base name for the created views. |
| `--dry-run` | Draft and validate everything, run nothing. |
| Free-text tail | What is being classified, from which column, in plain words. |

## When to use

Triggers:

- "Create training data for a classifier that maps `<column>` to `<attribute>`"
- "I have a Rosetta Stone attribute and a dataset; build me labeled data"
- "Generate synthetic examples for the classes my training set is missing"
- "Prepare a dataset for Classifier Studio"

Do NOT use for:

- **Writing the mapping itself** — if the goal is a Rosetta Stone
  mapping expression rather than a trained model,
  `/generate-rosetta-stone-mappings` owns that. Reach for a classifier
  when the value space is too large or too messy for an expression.
- **Labeling a production table** — this skill builds *training* data
  and caps rows per class on purpose. To label every row of a dataset,
  write the `AI_COMPLETE` query directly through `/write-nql`.
- **Training or evaluating the model** — Classifier Studio owns both.
- **Dataset discovery or profiling on its own** — `/profile-dataset`
  owns profiling; this skill calls it for coverage evidence.

## Procedure

Run phases 0–9 in order. Phases 5, 7, and 8 create datasets and phase 5
bills inference, so each one is gated on explicit approval.

### 0. Pin the company / context

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

### 1. Parse the request

Bind every argument that was passed. For each one that was not, note
what the default is; do not fill in a dataset id, a column name, or an
attribute from context that only looks like a match.

Ask at most one `AskUserQuestion` here, covering whichever of the
attribute and dataset is missing. Everything else has a workable
default or is settled by evidence in a later phase.

### 2. Resolve the classes — mandatory

The attribute's enum is the class list. Nothing downstream is
meaningful until it is bound.

Resolve a phrase through `/find-attribute`; take an id straight to:

```
narrative_attributes_describe(attribute_ids: [<id>])
```

Read the JSON Schema off the response and pull the `enum` array. Then
check three things and stop on any of them:

- **No `enum` on the attribute.** An unconstrained string attribute has
  no class list, so there is nothing to train toward. Say so and offer
  two ways forward: pick a different attribute, or have the user supply
  an explicit class list.
- **Fewer than 2 classes.** A one-class problem is not a
  classification problem, and Classifier Studio rejects it.
- **More than ~200 classes.** Not a hard stop, but say plainly that the
  per-class floor now dominates the row count, that
  `--min-per-class 25` across 200 classes means 5,000 rows minimum, and
  that inference cost scales with the prompt, which carries every class
  name on every call. Ask whether to proceed or narrow the class list.

Record the enum verbatim. Casing and punctuation matter: these strings
are matched literally against source values in phase 5 and are copied
into the model's response schema, so `Bichon Frisé` with its accent is
not the same class as `Bichon Frise`.

### 3. Resolve the source and its data plane — mandatory

```
narrative_datasets_describe(dataset_ids: [<id>], include: ["metadata", "schema", "sample"])
```

Capture the `unique_name`, the column list with types, the row count,
and the data plane. Pass that plane id to every `narrative_nql_validate`
and `narrative_nql_run` call in this skill.

**Then check the plane's platform and stop if it is not Snowflake.**
Both things this skill depends on are Snowflake-only: `AI_COMPLETE` for
labeling, and Classifier Studio for consuming the result. On any other
plane the queries fail at run time with `Function AI_COMPLETE does not
exist`, and even a hand-labeled dataset would have nothing to train in.
Say which plane the dataset is on, that classifier training needs a
Snowflake plane, and stop. Do not offer to label in the conversation
instead. At the volume a training set needs, that is neither cheaper
nor faster, and it moves customer data into the transcript.

If the platform is not on the describe response, call
`narrative_data_planes_list(include: ["metadata"])` and match on plane
id. Never assume.

### 4. Choose the label input and the features — mandatory

Two column sets, and they answer different questions:

- **Label input** — what the labeler reads to decide the class. It
  needs to be sufficient: a human holding only these columns should be
  able to name the class.
- **Features** — what the classifier trains on. Every one of them must
  be available at inference time, or the trained model cannot be
  applied to new data.

Default the features to the label-input columns. That default is right
for the common case, which is distilling an expensive LLM labeler into
a cheap classifier that reads the same input.

Profile the candidate columns before committing:

```
/profile-dataset --dataset <id> --focus <label-input,features> --json
```

Use the profile to settle three things:

1. **Distinct count on the label input.** This sets the inference bill,
   because phase 5 labels distinct values rather than rows. A column
   with 40M rows and 3,000 distinct values costs 3,000 calls.
2. **Null and fill rate.** Rows null across the whole label input
   cannot be labeled; they are filtered out, not labeled `Unknown`.
   Labeling them `Unknown` teaches the classifier that absence is a
   class, which is only right if the attribute means it that way.
3. **A feature type per feature column**, drawn from the observed
   shape, for the phase 9 handoff. The mapping from column shape to
   Classifier Studio feature type is in
   [`references/CLASSIFIER_HANDOFF.md`](references/CLASSIFIER_HANDOFF.md).

Present the two column sets and the feature types, and get one
confirmation before building anything.

### 5. Build the real view — gated, bills inference

Read [`references/AI_COMPLETE_LABELING.md`](references/AI_COMPLETE_LABELING.md)
before drafting. It carries the prompt and response-schema construction,
the two parse paths, and the cost rules. The full query is in
[`assets/templates/01-real-labeled.sql`](assets/templates/01-real-labeled.sql).

The query has five stages, in this order:

1. **Reduce to distinct label inputs**, carrying a frequency count.
   Every later stage works on distinct values, and the frequency is
   what makes stratified sampling possible at the end. Skipping this
   stage is the single most expensive mistake available here: it
   multiplies the inference bill by the average rows per distinct value.
2. **Match against the enum.** A case-insensitive, trimmed equality
   join resolves the values that already are class names. This is free
   and exact, and on normalized source data it often resolves most of
   the distinct values.
3. **Label the rest with `AI_COMPLETE`**, restricted to the rows the
   match left unresolved. Constrain the response schema with the enum
   so the model cannot return a class that does not exist, and ask for
   a confidence alongside the class.
4. **Apply the confidence gate.** Rows below `--confidence` are
   **dropped**. This is where training data parts company with a
   mapping query: a mapping keeps the row and leaves the value null,
   whereas a guess admitted to a training set is a mislabeled example
   that the model will faithfully learn.
5. **Cap rows per class** with
   `QUALIFY ROW_NUMBER() OVER (PARTITION BY label ORDER BY row_freq DESC) <= <max-per-class>`.
   Use `QUALIFY` rather than `ORDER BY … LIMIT`. A materialized view
   holds an unordered bag of rows, so a `LIMIT` inside one does not
   select the top of anything.

Validate before running:

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

Then show the user the query, the distinct-value count, the number of
values the exact match already resolved, and the resulting count of
model calls. Get explicit approval, because this is the step that
spends money. Under `--dry-run`, stop here.

On approval, run it and poll:

```
narrative_nql_run(query: <the CREATE MATERIALIZED VIEW>, data_plane_id: <plane>)
→ { job_id }
narrative_jobs_describe(job_ids: ["<job_id>"])
```

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

The completed job's `result` carries `dataset_id`, not rows. Reading
rows back takes a second job; the sequence is in
[`references/VERIFYING_A_VIEW.md`](references/VERIFYING_A_VIEW.md).

### 6. Measure coverage — mandatory

Do not eyeball a sample for this. A sample is capped at 1,000 rows,
which is smaller than most training sets and says nothing reliable
about a thin class. Run an aggregate instead:

```sql
CREATE MATERIALIZED VIEW "<name>_real_coverage"
DISPLAY_NAME = '<Name> — Real Rows per Class'
DESCRIPTION = 'Row count and distinct-input count per class in <name>_real, used to size the synthetic half.'
AS
SELECT
  company_data."<name>_real".label AS label,
  COUNT(1) AS row_count,
  APPROX_COUNT_DISTINCT(company_data."<name>_real".input_0) AS distinct_inputs,
  AVG(company_data."<name>_real".label_confidence) AS mean_confidence
FROM company_data."<name>_real"
GROUP BY company_data."<name>_real".label
```

Tag this view as temporary, since it is a measurement rather than a
deliverable:

For datasets that should be **temporary** — ad-hoc scratch
artifacts, intermediate steps in a workflow, or anything created on
the fly that shouldn't outlive its immediate purpose — set both:

- `EXPIRE = 'P1D'` (or another ISO-8601 duration). The platform
  garbage-collects the dataset that long after creation, removing
  both the storage and the Dataset entry automatically. `P1D` is a
  sensible default: enough time to debug, short enough not to
  clutter long-term storage. Use a longer duration only if the user
  is expected to inspect the dataset after creation.
- `TAGS = ( '_nio_materialized_view', '_nio_interactive', ... )` —
  the `_nio_interactive` tag is what the dataset store's default
  `datasets` getter filters out. The dataset becomes invisible in
  the customer's Datasets list and in source pickers (Audience
  Studio, Graph Studio, etc.). It still exists; it only surfaces
  in escape-hatch views that opt in via
  `allDatasetsIncludingInteractive`.

Common application: workflows whose intermediate steps materialize
data the user shouldn't see. Tag every intermediate MV with both
`EXPIRE` and `_nio_interactive`; tag the final, customer-facing
artifact with **neither** — that's the deliverable, it should be
persistent and visible.

If the user asks where a temporary dataset went, explain: it exists
for the EXPIRE window, it's hidden from the main UI by tag, and it
auto-deletes. Nothing to clean up by hand.

Join the result against the enum in the conversation and sort every
class into one of three buckets:

| Bucket | Test | What it means |
| --- | --- | --- |
| Covered | `row_count >= --min-per-class` and `distinct_inputs >= 3` | Real data can carry this class on its own. |
| Thin | present but below either floor | The class exists but the classifier will see one or two spellings of it and overfit to them. |
| Absent | no row at all | The classifier cannot predict this class. It will never be an output. |

Report the three buckets with counts, plus any class whose
`mean_confidence` sits near the gate. A class the labeler was
consistently unsure about usually overlaps another class in meaning,
and that is worth knowing before training rather than after.

If `--real` was passed, report and stop here.

### 7. Build the synthetic view — gated

Read [`references/SYNTHETIC_GENERATION.md`](references/SYNTHETIC_GENERATION.md)
before generating. It carries the diversity axes, the style-mimicry
rules, and the leakage checks.

Generate rows for every thin and absent class, enough to bring each one
to `--min-per-class`. Ground the generation in a real sample so the
invented rows carry the same surface conventions as the source: if real
values are lowercase and unpunctuated, synthetic values are too. A
synthetic set written in clean title case teaches the classifier that
casing predicts the label, and it will use that.

Do not produce the class name N times. N copies of one string is one
training example carrying a large weight, not N examples. Vary each
class instead along the six axes the reference lists: canonical form,
casing, abbreviation, misspelling, embedded qualifier, and near-miss
confusable.

**Show the user the generated rows before materializing them.** They
are being invented, they will be trained on, and this is the cheapest
point at which a wrong one can be removed. For a large set, show every
row for a handful of classes and a summary for the rest.

Once approved, write them in. The rows travel as SQL string literals
inside statements the platform runs; there is no upload step. Two
statements do it, and they have to run in that order:

1. **Create the dataset and seed it** with the first row, from
   [`assets/templates/02-synthetic-seed.sql`](assets/templates/02-synthetic-seed.sql).
   `INSERT` cannot create a dataset, so this has to exist first.
2. **Append the rest in chunks**, roughly 500 rows per statement, from
   [`assets/templates/03-synthetic-insert.sql`](assets/templates/03-synthetic-insert.sql).

Run both as a single workflow, seeding step first and one `ExecuteDml`
task per chunk:
[`assets/templates/synthetic-workflow.yaml`](assets/templates/synthetic-workflow.yaml).
`ExecuteDml` is the documented execution surface for `INSERT`, and a
workflow runs its steps sequentially, so the create-then-append ordering
is guaranteed rather than hoped for. Hand off to `/create-workflow` if
the spec needs more than the template shape.

Validate both statements before submitting anything.
`narrative_workflows_create` checks the YAML shape and the task
contract, not the NQL inside `nql:` fields, so a malformed `INSERT`
surfaces at run time otherwise. Validate the seed statement in full and
a two-row version of the chunk, which is enough to confirm the column
list, the positional binding, and the types.

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

Then submit:

```
narrative_workflows_create(spec: <yaml>, trigger_immediately: true)
```

After `narrative_workflows_create` returns, capture both
`workflowId` and `runId` (the latter is present when the call was
made with `trigger_immediately=true`). Poll the run until terminal:

```
narrative_workflow_runs_list(workflow_id=workflowId)
```

Terminal states are `completed`, `failed`, and `terminated`; any other
status means keep polling.

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

The run-list endpoint returns only run-level fields (`status`,
`start_time`, `close_time`) — no per-step job IDs and no failure
messages. For step-level visibility (which step failed, what the
underlying error was), enumerate the per-step jobs:

```
narrative_jobs_search(workflow_run_id=runId)
```

Each result carries a `job_id` plus the workflow step it ran for.
Pull the failing one's detail with
`narrative_jobs_describe(job_id=<...>)` to read the actual error
message. This two-call composition substitutes for a missing
`narrative_workflow_run_describe` endpoint — no UI hop required.

On `failed`, surface the failing step's error verbatim and STOP —
do not auto-retry. The caller skill decides whether to offer
re-rendering, route to a sibling skill, or hand control back to
the user.

Read [`references/WRITING_ROWS.md`](references/WRITING_ROWS.md) for
chunk sizing, the quoting rule that breaks these statements most often,
and why re-running this workflow duplicates every row.

### 8. Union the halves

The union view is the training deliverable, so it gets a real name, a
real description, and no expiry. List columns explicitly and keep the
order identical on both sides; NQL has no `SELECT *`, and a column-order
mismatch across a `UNION ALL` is a type error at best and a silent
column swap at worst.

Template: [`assets/templates/04-union.sql`](assets/templates/04-union.sql).

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

### 9. Verify and hand off — mandatory

Verify against the built union view, not against intent. Run one
aggregate for the class histogram, and one anti-join for leakage:

- **Class histogram** — the same `GROUP BY label` as phase 6, against
  the union. Every enum class should now clear `--min-per-class`. Name
  any that does not.
- **Leakage** — synthetic inputs that are string-identical to real
  ones. A duplicate row that lands in the training split and the test
  split makes the test score partly a memory test. Report the count and
  offer to rebuild the synthetic half without the collisions.

Then produce the handoff brief. It is the last thing in the transcript,
so it should be sufficient on its own:

- **Dataset** — the union view's name and id.
- **Label column** — `label`.
- **Features** — each feature column with its Classifier Studio feature
  type.
- **Algorithm** — a recommendation with the reason, per
  [`references/CLASSIFIER_HANDOFF.md`](references/CLASSIFIER_HANDOFF.md).
- **Split** — test size, a fixed random state, and stratification on.
  Say why stratification matters here: without it a class sitting at
  the 25-row floor can land entirely in one split.
- **Caveats** — the synthetic share of the training set, and that a
  score measured on a split containing synthetic rows is measuring
  partly against invented data. Recommend a real-only evaluation as a
  second read, which the `training_source` column makes a one-line
  filter.

## Common cases

| Case | Shape | What changes |
| --- | --- | --- |
| Messy free-text column, clean enum | One label-input column, features same | The default path. Most of phase 5's cost is in the model stage; the exact match resolves the already-normalized values for free. |
| Source values already normalized | Exact match resolves nearly everything | Say so — if the match resolves everything, a classifier may be unnecessary and a Rosetta Stone mapping expression is the cheaper answer. Offer `/generate-rosetta-stone-mappings`. |
| Long tail of rare classes | Many absent classes | The synthetic half dominates. Flag the resulting synthetic share explicitly; past roughly half the training set, the model is mostly learning invented data. |
| Multi-column features | Features wider than the label input | Synthetic rows must be internally consistent across columns, not independently sampled per column. See the reference. |
| Rebuilding one half | `--real` or `--synthetic` alone | The other half is left alone; re-run phase 8 to refresh the union. |

## Edge cases and gotchas

Full prose in [`references/EDGE_CASES.md`](references/EDGE_CASES.md).

- **Attribute has no `enum`** → stop; no class list, nothing to train toward.
- **Non-Snowflake data plane** → stop; `AI_COMPLETE` and Classifier Studio both need Snowflake.
- **Cortex grant missing** → the run fails with a privileges error, not a validation error. Surface it verbatim and point at the account-level grant; it is a one-time setup a Snowflake admin performs.
- **`show_details` and the parse path disagree** → every label comes back null. The two forms are not interchangeable; see the labeling reference.
- **Confidence gate placed in a `JOIN` instead of a `WHERE`** → low-confidence rows survive with a null label and poison the training set. Drop them.
- **Class names that differ only by accent or case** → the exact match folds case, so `Frise` and `Frisé` collide. Match on the verbatim enum string.
- **Name collision with an existing dataset** → stop and ask; overwriting a training set silently invalidates any model already trained on it.
- **Re-running the synthetic workflow** → every row is appended a second time. The create step is skipped when the dataset exists, the `ExecuteDml` steps append regardless. Use a new name or delete the dataset first.
- **An apostrophe inside a synthetic value** → the `INSERT` fails on the whole chunk. Double it: `'O''Brien'`.
- **Synthetic rows written in clean casing against messy real data** → the classifier learns casing as a feature. Mimic the source.
- **A class the labeler was never confident about** → usually two enum values that overlap in meaning. Surface it; it is a class-design problem, not a data problem.

## Harness fallbacks

Full prose in [`references/HARNESS_FALLBACK.md`](references/HARNESS_FALLBACK.md).

- `narrative-mcp` unavailable → no attribute resolution, no validation, no execution. Stop and say so.
- `narrative-knowledge-base` unavailable → proceed; it is a *recommends*.
- `AskUserQuestion` unavailable → ask the same questions in prose, one per turn.

## Further reading

- [`references/AI_COMPLETE_LABELING.md`](references/AI_COMPLETE_LABELING.md) — prompt and schema construction, the two parse paths, cost control. Read in phase 5.
- [`references/SYNTHETIC_GENERATION.md`](references/SYNTHETIC_GENERATION.md) — diversity axes, style mimicry, multi-column consistency, chunking. Read in phase 7.
- [`references/WRITING_ROWS.md`](references/WRITING_ROWS.md) — how agent-written rows reach a dataset, chunk sizing, quoting, and re-run behavior. Read in phase 7.
- [`references/COVERAGE_DESIGN.md`](references/COVERAGE_DESIGN.md) — why the floors are where they are, class balance, and what feature coverage means for a text classifier. Read in phase 6.
- [`references/CLASSIFIER_HANDOFF.md`](references/CLASSIFIER_HANDOFF.md) — column shape to feature type, algorithm choice, split settings. Read in phase 9.
- [`references/VERIFYING_A_VIEW.md`](references/VERIFYING_A_VIEW.md) — reading rows back out of a materialized view.
- [`assets/templates/`](assets/templates/) — the four query templates and the synthetic-insert workflow.
- Sibling skills: `/find-attribute` to resolve the attribute, `/profile-dataset` for column coverage, `/create-workflow` for the synthetic-insert workflow, `/write-nql` for ad-hoc queries against the finished views, `/generate-rosetta-stone-mappings` when an expression beats a model.

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

- `skill_name`: `narrative-ml:create-training-data` (use this verbatim).
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
