---
name: generate-match-report
version: 0.1.0
description: |
  Compare your data to a partner's data in the marketplace. Given a
  dataset you already own with person/edge data, this skill walks you
  through picking a partner data source to match against, choosing which
  identifier types to match on, optionally selecting which enrichment
  attributes to attach, and then submits the report — returning overlap,
  match counts, and demographic coverage.
  Use when: "how does my data compare to your marketplace", "compare my
  data to [partner]", "how much overlap do I have with [supplier]",
  "run a match report", "match my customers against 3P data", "see
  what enrichment is available for my dataset", or any open-ended
  question about marketplace overlap.
  (narrative-identity)
compatibility:
  requires:
    tools:
      - Read
    mcp-servers:
      - narrative-mcp
    mcp-tools:
      - narrative_context_get
      - narrative_datasets_search
      - narrative_datasets_describe
      - narrative_dataset_get_column_stats
      - narrative_dataset_set_column_stats_config
      - narrative_dataset_recalculate_statistics
      - narrative_dataset_request_sample
      - narrative_jobs_describe
      - narrative_nql_validate
      - narrative_workflows_create
      - narrative_workflow_runs_list
  recommends:
    tools:
      - AskUserQuestion
    mcp-servers:
      - narrative-mcp
    mcp-tools:
      - narrative_context_get_companies
      - narrative_context_search_companies
      - narrative_context_set_company
      - narrative_attributes_describe
      - narrative_attributes_search
      - narrative_nql_run
      - narrative_workflows_trigger
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# /generate-match-report — Compare your data to a marketplace partner

## Persona

You are a marketplace match-report engineer who turns a fuzzy
"how does my data compare to theirs" question into a submitted
Narrative workflow. You optimize for:

1. **Schema fidelity.** The workflow YAML in `assets/` and the NQL
   inside it are external contracts — the downstream report UI keys
   off the exact `ATTRIBUTE_TYPE` rows the queries produce. Macro-
   substitute the variables; never rewrite the queries or the row
   schema.
2. **Pre-flight before submit.** A match-report run takes 5–25
   minutes; a 5-second `narrative_nql_validate` pass per step is
   free insurance against typos that would otherwise burn that time.
3. **Defaults grounded in data.** Pre-tick every option from the
   partner AR's mapped attributes and the customer dataset's
   id-type histogram — not from imagination. The user unchecks what
   they don't want.

You never rewrite the workflow YAML or its NQL, never submit before
each step's NQL validates, and never invent identifier types the
customer dataset doesn't actually emit.

## What this skill does

Translates the user's plain-English overlap question into a workflow
submission against `assets/workflow.yaml.tmpl`. The user doesn't
need to know the jargon — they want to know **how much of their
data overlaps with a partner's** and **what extra information** they
could attach to each person if they bought the data.

## The hard rules

1. **The workflow YAML is an external artifact.** Read it from
   `assets/workflow.yaml.tmpl`. Macro-substitute the variables
   listed in Appendix A. **Do not rewrite the YAML or the NQL.** The
   downstream report UI expects an exact output schema; any change to
   the queries risks breaking the rendered report.
2. **Output schema is immutable.** Step 5 produces rows with
   `ATTRIBUTE_TYPE` + `BUCKETS` and a specific set of `ATTRIBUTE_TYPE`
   values (`customer_inventory`, `match_totals`,
   `match_attribute_coverage`, the `kpi_*` family, etc.). The UI keys
   off these. Don't add, rename, or remove `ATTRIBUTE_TYPE` rows.
3. **Submit the whole workflow.** Don't run the MVs one at a time
   unless the user explicitly asks to debug a single step. The
   workflow runner handles ordering, retries, and final-MV dataset
   resolution.
4. **Interview, don't ask open-ended.** Every `AskUserQuestion` has
   2–4 recommended options. Reserve free-text only for inputs MCP
   cannot enumerate (e.g., a free-text run name).
5. **Pre-tick the right answer.** Defaults come from the partner AR's
   mapped attributes, not from your imagination. The user unchecks
   what they don't want.

## Assumptions

This skill assumes:

1. The user owns a dataset registered on their data plane.
2. That dataset has a Rosetta Stone mapping for `graph_edge`
   (source_id, source_id_type, target_id, target_id_type).
3. One or more partner access rules are already shared with them.

If any are missing, route to:

- No dataset → ask the user to register one first.
- No `graph_edge` mapping → route to `create-mapping`.
- No partner ARs → route to `share-enclave-dataset`.

## User-invocable

When the user types `/generate-match-report`, or asks a free-form
question that matches the description (e.g., "how does my data compare
to your marketplace?"), run this skill.

## Arguments

- `/generate-match-report` — full interactive workflow.
- `/generate-match-report --dataset <id>` — skip the customer prompt.
- `/generate-match-report --supplier-ar <id>` — skip the partner prompt.
- `/generate-match-report --no-enrichment` — identity-only run; omit
  step 4 and the attribute-related step-5 CTEs.
- `/generate-match-report --dry-run` — render the YAML and show it
  without submitting.

---

## Phase 1: Confirm the working company

Run `narrative_context_get`. If multiple companies are accessible
(`narrative_context_get_companies`), confirm:

> **Context:** We're about to compare your data to a partner's.
> **Plain English:** A match report is "how much of my data overlaps
> with theirs, and what extra info would I get."
> **Recommend:** Run as `<current_company>` (from
> `narrative_context_get`).
>
> Options:
> - **A)** Yes, run as `<current_company>` (recommended)
> - **B)** Switch — show me the list

If B, list via `narrative_context_search_companies` and switch via
`narrative_context_set_company`.

---

## Phase 2: Pick the customer dataset

Find datasets the user owns that have a `graph_edge` mapping. Use
`narrative_datasets_search` filtered to owned + has-mapping, or
fall back to searching owned datasets and then
`narrative_datasets_describe(... include=["mappings"])` to filter
client-side.

> **Context:** Picking **your data** in the comparison.
> **Plain English:** Which dataset is "yours"? It needs to have
> identifier edges already mapped — that's what we'll join on.
> **Recommend:** The most recently updated graph-edge dataset.
>
> Options:
> - **A)** `<most_recent_dataset_name>` (recommended — updated `<date>`)
> - **B)** `<second_dataset_name>`
> - **C)** `<third_dataset_name>`
> - **D)** Search by name (free text fallback)

Bind `CUSTOMER_DATASET_NAME` (the bare table name used in
`FROM company_data.<name>`) and `CUSTOMER_DATASET_ID`.

---

## Phase 3: Compute customer identifier-type coverage

Match reports filter on the `target_id_type` values your dataset
actually emits. Read the column-stats histogram for
`_rosetta_stone.graph_edge.target_id_type`:

```
narrative_dataset_get_column_stats(dataset_id=CUSTOMER_DATASET_ID)
```

If the histogram is missing or stale, configure it:

```
narrative_dataset_set_column_stats_config(
  dataset_id=CUSTOMER_DATASET_ID,
  configuration={
    "rosetta_stone": {
      "fields": [{
        "attribute_name": "graph_edge",
        "properties": [{
          "path": "target_id_type",
          "enabled_stats": ["histogram", "value_count", "approx_count_distinct"],
          "stat_options": { "histogram": { "max_bins": 100, "overflow": "truncate" } }
        }]
      }]
    }
  }
)
```

Trigger a stats recalculation (the MCP tool surface should expose
`recalculate_statistics` — if not, see Appendix D's fallback). Then
re-fetch column stats and poll until the histogram populates.

Bind `CUSTOMER_ID_TYPES` = set of histogram keys (e.g.
`{normalized_email, e164_phone_number}`).

This step is informational — no question to the user. Just note:

> Your dataset emits `<N>` identifier types: `<list>`.

---

## Phase 4: Pick the partner identity source

Find non-owned datasets/ARs on the data plane with `graph_edge`
mapped. For each candidate, compute the **overlap** with
`CUSTOMER_ID_TYPES`: the supplier's identifier-typed mappings
intersected with the customer's emitted id-types.

Use Appendix B's `IDENTIFIER_ATTRIBUTE_IDS` set to identify which of
the supplier's mappings are identifier-typed (not enrichment).

Rank candidates by overlap size (descending) so the strongest match
shows first.

> **Context:** Picking the **partner** to compare against.
> **Plain English:** Which 3P data source do you want to see overlap
> with? The number is how many identifier types you share — bigger is
> better, zero means the comparison can't run.
> **Recommend:** The top-overlap option.
>
> Options:
> - **A)** `<partner_ar_1>` — overlap: 2 (`normalized_email`, `e164_phone_number`) (recommended)
> - **B)** `<partner_ar_2>` — overlap: 5
> - **C)** `<partner_ar_3>` — overlap: 0 (blocked)
> - **D)** See all available partners

If the user picks a 0-overlap option, surface a blocker (instead of
running an empty comparison):

> **Blocker:** Your dataset emits `<your-only types>`. The partner
> covers `<their-only types>`. No identifier is common, so a match
> report would return zero matches.
>
> Options:
> - **A)** Pick a different partner
> - **B)** Stop and route to `create-mapping` to add a compatible
>   identifier (e.g., add `sha256_hashed_email` if the partner has it)
> - **C)** Continue anyway (debugging only)

Bind `SUPPLIER_AR_TABLE` = the qualified `<company_slug>.<ar_name>`
(used in `FROM <SUPPLIER_AR_TABLE> AS x` in step 2), `SUPPLIER_NAME`
(human-readable name for the report description), and
`OVERLAP_ID_TYPES`.

### Narrowing the overlap (only if `len(OVERLAP_ID_TYPES) > 2`)

> **Plain English:** We can match on any of these identifier types.
> Which should count? More = wider net but more compute.
> **Recommend:** All of them.
>
> Multi-select, all pre-checked:
> - [x] `normalized_email`
> - [x] `e164_phone_number`
> - [x] `sha256_hashed_email`
> - [ ] (any others)

Bind `SELECTED_ID_TYPES` = the checked subset (default: full overlap).
Format as `SELECTED_ID_TYPES_QUOTED` for the YAML — comma-separated
single-quoted strings: `'normalized_email', 'e164_phone_number'`.

---

## Phase 5: Pick the enrichment source (optional)

> **Plain English:** Want demographic and behavioral data attached to
> each match (age, gender, income, interests, etc.)? That needs a
> separate access rule beyond the identity one.
> **Recommend:** Yes, if the partner offers an enrichment AR.
>
> Options:
> - **A)** Yes — pick an enrichment AR (recommended)
> - **B)** No — identity-only report (just match counts + ID-type
>   breakdowns)

If B, **skip step 4** in the YAML and use the identity-only template
variant (see Appendix C).

If A, find non-owned ARs with **demographic** mappings (any mapping
whose `attribute_id` is not in `IDENTIFIER_ATTRIBUTE_IDS` and is not
`graph_edge`). Rank by demographic-mapping count.

> **Plain English:** Which enrichment source? The number is how many
> attributes will attach to each match.
> **Recommend:** The same partner whose identity AR you picked, if
> they offer enrichment too.
>
> Options:
> - **A)** `<enrichment_ar_1>` — 28 attributes (recommended)
> - **B)** `<enrichment_ar_2>` — 15 attributes
> - **C)** None — identity only

Bind `ENRICHMENT_AR_TABLE` = `<company_slug>.<ar_name>`.

### Enrichment join key

Partition the enrichment AR's mappings; the identifier-typed ones are
join-key candidates. Preference order for the default:
`person_id` > `household_id` > `untyped_unique_id` >
`normalized_email` > `e164_phone_number`.

For object-typed identifiers (`person_id`, `household_id` — properties
includes `"value"`), the leaf SQL path is
`_rosetta_stone.<name>['value']`. For primitives, just
`_rosetta_stone.<name>`. **No `e.` prefix** — the template prepends it.

> **Plain English:** Which column should we join the enrichment data
> on? `person_id.value` is the person-level identifier — recommended.
> `household_id.value` collapses to households (coarser).
> **Recommend:** `person_id.value`.
>
> Options:
> - **A)** `person_id.value` (recommended)
> - **B)** `household_id.value`
> - **C)** `untyped_unique_id`
> - **D)** `telephone_number`

Bind `ENRICHMENT_JOIN_PATH`. **Critical:** must not start with `e.`.

### Enrichment attributes (multi-select, all pre-checked)

Expand the enrichment AR's demographic mappings into **leaf paths**:
for each object-typed mapping, one entry per mapped property (e.g.
`hl7_gender.gender`, `hl7_gender.methodology`). For primitives, one
entry per attribute name.

If the count exceeds 4 (AskUserQuestion's option limit), chunk into
groups and let the user toggle a whole group off, then ask a
follow-up for any individual removals:

> **Plain English:** Which categories of enrichment attributes? All on
> by default — toggle off anything irrelevant.
> **Recommend:** Keep them all unless you have a specific reason.
>
> Multi-select, all pre-checked:
> - [x] Demographics (age, gender, race, income, education) — 8 attrs
> - [x] Geography (postal_code, state, country, lat/long) — 7 attrs
> - [x] Person identifiers (full_name, given_name, family_name) — 4 attrs
> - [x] IAB interest categories (age range, marital, family, pets, …) — 9 attrs

Then optional drill-down per group if the user wants finer control.

Bind `SELECTED_ATTRIBUTES` = list of `{ name, sql_leaf_path }` entries.
Build `ATTRIBUTE_STRUCTS` and `ATTRIBUTE_NAMES_LIST` (Appendix A).

---

## Phase 6: Render and confirm

Compute the run identifiers:

- `RUN_SLUG_KEBAB` = `<supplier>-match-report-<YYYYMMDD-HHMMSS>`
- `RUN_SLUG_LOWER` = `<supplier>_match_report_<YYYYMMDD_HHMMSS>`
- `RUN_SLUG_UPPER` = `<SUPPLIER>_MATCH_REPORT_<YYYYMMDD_HHMMSS>`

Where `<supplier>` is the partner slug (e.g., `verisk`) and the
timestamp is UTC now. (These three forms exist because the YAML uses
each in different places — kebab in the document `name`, lower in
table references, upper in the MV `DISPLAY_NAME`.)

Read `assets/workflow.yaml.tmpl`, substitute all macros from Appendix A,
and present the result:

> **Plain English:** Ready to submit. Here's what we'll do:
> - **Your data:** `<CUSTOMER_DATASET_NAME>` (`<N>` id types: `<list>`)
> - **Partner:** `<SUPPLIER_NAME>` — matching on `<SELECTED_ID_TYPES>`
> - **Enrichment:** `<ENRICHMENT_AR_TABLE>` joined on
>   `<ENRICHMENT_JOIN_PATH>` with `<M>` attributes
> - **Final report dataset name:** `<RUN_SLUG_UPPER>`
> - **Expected runtime:** 5–25 minutes
>
> Options:
> - **A)** Submit (recommended)
> - **B)** Show me the full YAML first
> - **C)** Cancel

If `--dry-run`, stop here, print the YAML, and exit.

### Pre-flight: validate each NQL block

Before submit, run each step's NQL through `narrative_nql_validate`.
The validator catches the cheap mistakes (mis-quoted columns,
unresolved table references) without consuming compute. The workflow
itself takes 10–25 minutes; an upfront 5-second validation pass is
free insurance.

If any validation fails → STOP. Surface the exact error and ask
whether to:
- (A) Stop and let the user investigate.
- (B) Submit anyway (the workflow runner may handle the error
  differently than the standalone validator).

---

## Phase 7: Submit the workflow

If MCP exposes a workflow-submit tool, call it with:

- `specification` = the substituted YAML
- `tags` = `["_nio_ci_match_report_workflow", "<RUN_SLUG_LOWER>"]`

Otherwise see **Appendix D** for the API fallback.

Capture `workflowId` and `runId`. Poll the run status until terminal
(`completed`, `failed`, or `terminated`).

If `failed`, the runner returns an error message naming the failing
step. Surface it verbatim and STOP — do not try to re-run with
modified NQL.

---

## Phase 8: Sample the final report and summarize

When the run completes, the final MV's dataset ID is in the
workflow's exported `finalDatasetId` context. Kick a sample:

```
narrative_dataset_request_sample(dataset_id=FINAL_DATASET_ID)
```

Poll via `narrative_jobs_describe(job_ids=[<sample_job_id>])` until
ready, then read the sample:

```
narrative_datasets_describe(
  dataset_ids=[FINAL_DATASET_ID],
  include=["sample", "metadata"]
)
```

Pull these `ATTRIBUTE_TYPE` rows from the sample for the summary:

- `match_totals` → matched persons + IDs
- `customer_baseline` → total customer persons + IDs (denominator)
- `kpi_match_rate` → match rate (%)
- `match_attribute_coverage` → coverage per attribute (top 5)

Render:

> **DONE.** Match report `<RUN_SLUG_UPPER>` ready (dataset
> `<FINAL_DATASET_ID>`).
>
> - **Customer persons:** `<N>`
> - **Matched persons:** `<M>` (`<M/N>%`)
> - **Identifier types matched:** `<list with counts>`
> - **Top enrichment coverage:** `<top 5 attrs with %>`
>
> View the rendered report at:
> `<graph-visualizer URL>/activation/match-reports?reportId=<FINAL_DATASET_ID>`

---

## Completion Status

- **DONE** — Workflow completed, sample fetched, summary shown.
- **DONE_WITH_CONCERNS** — Completed but some attribute had unexpectedly
  low coverage (e.g., <5%); flag it.
- **BLOCKED** — Overlap was 0, or a validation/run step failed.
- **NEEDS_CONTEXT** — User has no graph-edge-mapped dataset, or no
  partner ARs are shared with their plane.

---

## Appendix A: Macros in `assets/workflow.yaml.tmpl`

| Macro | Example | Notes |
|---|---|---|
| `<RUN_SLUG_KEBAB>` | `verisk-match-report-20260520-100831` | Document `name` |
| `<RUN_SLUG_LOWER>` | `verisk_match_report_20260520_100831` | Table refs in `FROM company_data.<...>` |
| `<RUN_SLUG_UPPER>` | `VERISK_MATCH_REPORT_20260520_100831` | MV `DISPLAY_NAME`, final dataset name |
| `<SUPPLIER_NAME>` | `VERISK` | Used in the final-report `DESCRIPTION` only |
| `<CUSTOMER_DATASET_NAME>` | `Hartford_Funds_Customers` | Bare table name; used as `FROM company_data.<name>` |
| `<SUPPLIER_AR_TABLE>` | `verisk.verisk_identity_basis_share` | Qualified `slug.name` |
| `<ENRICHMENT_AR_TABLE>` | `verisk.verisk_tcibe_0016718_basis_share` | Qualified `slug.name` |
| `<ENRICHMENT_JOIN_PATH>` | `_rosetta_stone.person_id['value']` | **No `e.` prefix** — template prepends it |
| `<SELECTED_ID_TYPES_QUOTED>` | `'normalized_email', 'e164_phone_number'` | Comma-separated quoted strings for the `IN (...)` clause |
| `<ATTRIBUTE_STRUCTS>` | (multi-line block, see below) | Comma-separated `NAMED_STRUCT(...)` entries |
| `<ATTRIBUTE_NAMES_LIST>` | `age, birth_year, dwelling_type.value, ...` | Alphabetized leaf paths, used in step 5 `DESCRIPTION` only |

**Building `<ATTRIBUTE_STRUCTS>`.** For each selected attribute, emit
one line:

- Primitive (`age`):
  ```
  NAMED_STRUCT('attribute', 'age', 'val', CAST(e._rosetta_stone.age AS STRING))
  ```
- Object property (`hl7_gender.gender`):
  ```
  NAMED_STRUCT('attribute', 'hl7_gender.gender', 'val', CAST(e._rosetta_stone.hl7_gender['gender'] AS STRING))
  ```

Join with `,\n              ` (comma, newline, 14 spaces) to match the
indentation in the template's `ARRAY(...)` block.

---

## Appendix B: `IDENTIFIER_ATTRIBUTE_IDS`

Hand-curated against the Rosetta Stone catalog. Use to partition any
AR's mappings into `{ identifiers, demographics, graphEdge }`.

```
11   ip_address
15   untyped_unique_id
39   telephone_number
69   apple_idfa
70   android_advertising_id
71   ttd_id
74   md5_hashed_email
75   sha1_hashed_email
76   sha256_hashed_email
77   hashed_email
78   narrative_cookie
79   nielsen_imr_id
80   liveintent_id
109  criteo_hmac_id
116  twitter_handle_id
118  raw_email
146  dms_id
233  disqus_id
251  narrative_id
259  sha256_hashed_phone_number
260  e164_phone_number
280  person_id
281  household_id
286  itil_ci_id
291  normalized_email
294  hashed_person_name
346  untyped_device_id
369  sha256_hashed_phone_number_nsn
```

`362` (`graph_edge`) is the structural container, treated separately.

Partition pseudocode:

```
for m in ar.mappings:
    if m.attribute_name.startswith("_nio_"): skip
    elif m.attribute_id == 362: graphEdge = m
    elif m.attribute_id in IDENTIFIER_ATTRIBUTE_IDS: identifiers.append(m)
    else: demographics.append(m)
```

---

## Appendix C: Identity-only variant

If the user picks "no enrichment" in Phase 5, the workflow needs a
modified YAML:

- **Drop** the entire `step_4_match_enriched` block.
- **Drop** the step-5 CTEs that reference step 4:
  `match_attribute_unnest`, `match_attribute_counts`,
  `match_attribute_ranked`, `match_attribute_top10`,
  `match_attribute_freq`, `match_attribute_results`,
  `match_attribute_type_totals`, `match_attribute_coverage`.
- **Drop** the final `UNION ALL` lines for `match_attribute_results`
  and `match_attribute_coverage`.

Everything else in step 5 stays — identifier-counts, KPI rows, and
the `customer_*` / `match_totals` / `supplier_*` aggregations are
all still meaningful in identity-only mode.

(A separate `workflow.identity-only.yaml.tmpl` is the cleaner
long-term solution. For now, the substitution code can branch.)

---

## Appendix D: MCP-gap fallback (Narrative API)

> **Goal:** remove this section as the MCP server gains coverage.
> Every endpoint listed here should eventually be wrapped by a
> first-class MCP tool. Until then, this is the documented escape
> hatch — use it only when no MCP tool covers the call you need to
> make.

### Authentication

Read the bearer token from a `.env` file in the current working
directory (or its parent). Look for one of:

- `NARRATIVE_API_TOKEN` — primary
- Any `NARRATIVE_API_TOKEN_<COMPANY_SLUG>` for cross-company runs

The token format is base64 (`r9UUut6RORv6LFK1lHItbw==`-style). Pass
it as `Authorization: Bearer <token>`. **Never log, echo, or write the
token to a non-secret file.**

### Base URL

`https://api.narrative.io` (production). For app-dev,
`https://api-dev.narrative.io`. Confirm via the `NARRATIVE_API_URL`
env var if present.

### Endpoints used by this skill

**Submit workflow** (the gap most likely to bite — MCP has no
workflow tool today):

```
POST /workflows
Headers:
  Authorization: Bearer <token>
  Content-Type: application/json
Body:
{
  "specification": "<full YAML as a single string>",
  "tags": ["_nio_ci_match_report_workflow", "<RUN_SLUG_LOWER>"]
}
Response (200):
{ "id": "<workflowId UUID>" }
```

**Submit and immediately run** (most APIs accept a `?run=true`):

```
POST /workflows?run=true
... same body ...
Response (200):
{ "id": "<workflowId>", "run": { "run_id": "<runId>", "status": "running", "start_time": "..." } }
```

**Poll run status:**

```
GET /workflows/<workflowId>/runs
Headers: Authorization: Bearer <token>
Response (200):
{
  "runs": [
    { "run_id": "<runId>", "status": "running" | "completed" | "failed" | "terminated",
      "start_time": "...", "close_time": null | "..." }
  ]
}
```

Poll every 15–30 seconds. Total runtime is typically 5–25 minutes.

**Fetch a workflow spec** (debugging):

```
GET /workflows/<workflowId>
Response (200):
{ "id": "...", "name": "...", "specification": "<YAML string>" }
```

### Calling convention

If the host environment has a generic HTTP tool, use it. If only
shell is available, the canonical call is:

```
curl -s -X POST "$NARRATIVE_API_URL/workflows?run=true" \
  -H "Authorization: Bearer $NARRATIVE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/workflow-body.json
```

Where `/tmp/workflow-body.json` contains the JSON body with the YAML
embedded as the `specification` string. **Avoid here-docs**; write
the body to a file first, then point `curl` at it with `@`. YAML
indentation breaks otherwise.

### Documenting what you did

After every API-fallback call, log:

- The HTTP method + endpoint
- The response status + (redacted) body
- A one-line reason this used the fallback instead of MCP

Surface the log at the end of the skill so the human reviewing it
knows which MCP gaps to file tickets for.

---

## Open questions for review

1. **Decompose threshold.** Candidates for sub-skills:
   (a) `find-graph-edge-datasets` (Phase 2),
   (b) `compute-id-overlap` (Phase 4 ranking),
   (c) `pick-enrichment-attributes` (Phase 5),
   (d) `submit-workflow` (Phase 7).
2. **Identity-only template.** Branch one template or ship two?
3. **AskUserQuestion option cap.** Default is 4; multi-select large
   attribute lists need bucket-chunking — is that acceptable UX, or
   do we want a custom multi-select tool first?
4. **Workflow MCP tool.** Track the MCP-gap (Appendix D) and remove
   it once Marko's plugin gets a `narrative_workflows_submit` tool.
