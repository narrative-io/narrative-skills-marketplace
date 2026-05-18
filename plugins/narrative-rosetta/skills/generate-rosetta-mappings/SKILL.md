---
name: generate-rosetta-mappings
version: 0.1.0
description: |
  Generate, evaluate, and improve Rosetta Stone attribute mappings for
  a Narrative dataset by progressively calling the narrative-mcp server
  (datasets, attributes, NQL) instead of stuffing schema + sample +
  catalog into a static prompt.
  Use when: "map this dataset to Rosetta Stone", "suggest normalized
  attributes for dataset N", "evaluate the mappings on dataset N", "why
  is this mapping low confidence", "fix this expression", "improve this
  NQL mapping expression".
  Do NOT use for: dataset-to-dataset joins (use NQL skills), generating
  dataset descriptions (use a description skill), or editing the literal
  LLM prompt files at utils/llm/templates — this skill replaces those
  prompts at runtime, it does not author them.
  (narrative-rosetta)
allowed-tools:
  - Read
  - AskUserQuestion
---

# Generate Rosetta Stone Mappings

## Why this skill exists

The original Rosetta Stone mapping prompt
(`utils/llm/templates/mapping-generation.ts`) front-loads the *entire*
dataset markdown (schema + sample + every column's stats) and the
*entire* Rosetta Stone attribute catalog into a single LLM call. That
works in a server-side pipeline with a 64k-token budget and pre-rendered
markdown, but it's the wrong default for an interactive agent: most
columns only need one or two candidate attributes inspected, and most
mappings only need one round-trip to validate.

This skill replaces the static prompt with a **progressive-disclosure
loop** over the `narrative-mcp` server. The agent fetches only the
schema slice, sample rows, column stats, and attribute definitions it
actually needs to make each decision — and validates every expression
it writes with `narrative_nql_validate` (and optionally
`narrative_nql_run`) before suggesting it.

Without this skill an agent will either (a) try to write mappings from
column names alone, (b) hallucinate Rosetta Stone attribute IDs, or (c)
emit SQL that fails NQL validation. Don't.

## When to use

Triggers:

- "Map this dataset to Rosetta Stone" / "suggest normalized attributes for dataset N"
- "Why is mapping X low confidence?" / "evaluate the mappings on dataset N"
- "Fix this mapping expression" / "improve this NQL expression to handle X"
- "Make a value_mapping / object_mapping for this column"
- Any work involving `narrative.rosetta_stone."<attribute>"` and a specific source dataset

Do NOT use for:

- Authoring or editing the literal prompt files under
  `utils/llm/templates/` — that is a code change, not a runtime skill.
- Pure NQL query authoring with no mapping intent — go to NQL skills.
- Custom-attribute *creation* — call this skill first to confirm no
  Rosetta Stone attribute already covers the column, then hand off.

## Procedure

Run these steps in order. Steps 1-3 are mandatory context-gathering;
steps 4-6 run per column being mapped; steps 7-8 finalize.

### 1. Pin the company / context

Mappings are scoped to a company. Before any dataset call:

```
narrative_context_get  → check the active company
```

If no company is set, or the user named a different one:

```
narrative_context_search_companies(query: "<name>")
narrative_context_set_company(company_id: <id>)
```

Skip if the user already invoked the skill from a Narrative Platform UI
session where the company is implicit (`narrative_context_get` returns
one).

### 2. Resolve and describe the target dataset

If the user gave a dataset ID, go straight to describe. Otherwise:

```
narrative_datasets_search(query: "<phrase from user>")
```

Then:

```
narrative_datasets_describe(dataset_id: <id>)
```

What to extract from the response:

- Column list with types (this is the source-of-truth schema)
- Existing mappings (if `mappings[]` is non-empty, the task is
  evaluation or incremental — see `## Evaluate existing mappings`)
- Dataset name, record count, freshness — used for the summary

**Stop and confirm with the user if**: the dataset has 50+ columns and
the user gave no scoping hint. Ask which columns or which Rosetta
Stone domain (identity, demographics, behavior, geo, etc.) they care
about. Mapping a 200-column dataset blind is rarely what they meant.

### 3. Pull sample rows and column stats

For each column you intend to evaluate (or all columns if the dataset
is small):

```
narrative_dataset_request_sample(dataset_id: <id>, limit: 25)
narrative_dataset_get_column_stats(dataset_id: <id>, column: <name>)
```

Batch these — do not call `get_column_stats` 200 times for a 200-column
dataset. If stats are missing, call
`narrative_dataset_recalculate_statistics` and proceed with sample data
only, noting it in a `data_quality` global warning.

What to look for in stats:

- `null_rate` — high null rates (>30%) → per-suggestion `data_quality` warning
- `distinct_count` and `top_values` — clue to enum-like columns
- `min`/`max` — clue to numeric ranges, timestamps, identifiers

What to look for in sample rows:

- Email shape (`@` symbol), phone shape, hash length (32 = MD5, 40 = SHA1, 64 = SHA256)
- ISO timestamp shape, US ZIP shape, IATA codes, etc.
- Whether a column is a literal type discriminator (e.g., `'email'`, `'phone'`, `'sha256_email'`)

### 4. Find candidate Rosetta Stone attributes

For each column (or column cluster — see "object_mapping" below):

```
narrative_attributes_search(query: "<column semantic, e.g. 'email identifier'>", limit: 5)
```

Then, for each promising hit:

```
narrative_attributes_describe(attribute_id: <id>)
```

This is the **only** way to learn the attribute's:

- Type (primitive vs object)
- Property paths (for object attributes — e.g., `type`, `value`, `context.source`)
- Enum constraints (`{value1|value2|value3}` in the describe output)
- Required vs optional properties

Do NOT guess attribute IDs from memory. The catalog changes; describe
every candidate before mapping to it.

### 5. Decide value_mapping vs object_mapping

| Source shape | Target attribute | Use |
| --- | --- | --- |
| Single column → primitive attribute (email, phone, age, country) | Primitive | `value_mapping` |
| Single column → object attribute where only `value` matters | Object with type/value | `object_mapping` with literal `type` + `value` |
| Multiple columns → one structured attribute (e.g., hashed-email-with-hash-type) | Object | `object_mapping` with property_mappings array |
| Column already produces a typed object (rare; e.g., a struct column) | Object | `object_mapping` mirroring the struct |

`value_mapping` shape:

```json
{
  "attribute_id": 123,
  "mapping": {
    "type": "value_mapping",
    "expression": "LOWER(email_column)"
  },
  "confidence": 95,
  "reasoning": "Column name and '@' pattern in all sampled values clearly indicate email.",
  "warnings": []
}
```

`object_mapping` shape:

```json
{
  "attribute_id": 456,
  "mapping": {
    "type": "object_mapping",
    "property_mappings": [
      { "path": "type",  "expression": "'sha256_email'", "confidence": 100, "reasoning": "Literal discriminator; all sampled hashes are 64 chars." },
      { "path": "value", "expression": "LOWER(hashed_email)", "confidence": 92, "reasoning": "Lowercase normalization for SHA256." }
    ]
  },
  "warnings": []
}
```

### 6. Validate every expression with NQL

Before adding any expression to your output:

```
narrative_nql_validate(
  dataset_id: <id>,
  expression: "<your expression>"
)
```

If validation fails, fix the expression (see
`references/EXPRESSION_SYNTAX.md`) and re-validate. Do **not** suggest a
mapping with an expression that has not been validated.

Optionally, for high-stakes mappings or when the user asked to test:

```
narrative_nql_run(
  dataset_id: <id>,
  query: "SELECT <expression> AS mapped, <source_column> AS source FROM <dataset> LIMIT 25"
)
```

Use the run results to:

- Confirm the transformation produces what you expected on real data
- Catch silent type coercions (e.g., string → null because of a
  malformed cast)
- Drop confidence by ≥20 points and add an `enum_mismatch` warning if
  the output values don't match the target attribute's enum

### 7. Score confidence

| Range | Use when |
| --- | --- |
| 95-100 | Clear semantic match (column name + all-sample-pattern matches), well-known standard (email, ISO timestamp, US state code, SHA256 hash). |
| 85-94 | Strong pattern with minor ambiguity (e.g., `id` column that is *probably* a user identifier given the sample). |
| 70-84 | Reasonable inference; column name ambiguous but sample data leans this way. |
| Below 70 | Multiple valid interpretations or sparse evidence. Include the suggestion but flag for user verification. |

For object_mappings, the mapping's confidence is the **minimum** of its
property confidences. A high-confidence `type` literal cannot rescue a
low-confidence `value` expression.

### 8. Emit the response object

Return the same JSON shape the prompt at
`utils/llm/templates/mapping-generation.ts` produces — agents calling
this skill from a Narrative Platform UI workflow expect that contract.
The relevant TypeScript type is `MappingGenerationResponseSchema` in
`utils/llm/schemas/responses/mapping-generation.ts`.

```json
{
  "type": "final_answer",
  "data": {
    "summary": "<2-4 sentence overview, first person 'I'>",
    "suggested_mappings": [ /* one entry per mapped column */ ],
    "warnings": [ /* dataset-wide concerns */ ]
  }
}
```

If you found nothing mappable, return an empty `suggested_mappings` and
mention custom-attribute creation in the summary — verbatim from the
generation prompt's `<custom_attributes>` section.

## Common cases

### Mapping generation (no existing mappings)

The default. Follow steps 1-8 in order. Sort suggested_mappings by
confidence descending; for object_mappings, sort by the minimum
property confidence.

### Evaluate existing mappings

If `narrative_datasets_describe` returns a non-empty `mappings[]` array,
or the user said "evaluate" / "rate" / "why is X low confidence":

1. Skip the attribute-search step — the target attribute is already
   chosen. Just `narrative_attributes_describe` it.
2. For each existing mapping, call `narrative_nql_run` against sample
   data to see what the mapping actually produces.
3. Score confidence per the table above, using *execution evidence*
   not just static reasoning.
4. Emit `MappingEvaluationResponseSchema` shape — the template at
   `utils/llm/templates/mapping-evaluation.ts` is the contract.
5. For object_mappings, include `property_scores[]` with one entry per
   property_mapping path.
6. Include a `suggested_fix` on any recommendation that has a concrete,
   testable replacement expression. Validate every `suggested_fix`
   expression with `narrative_nql_validate` first.

### Improve a single mapping expression

If the user pasted an expression and feedback (e.g., "lowercase the
emails, our match rate is bad"):

1. `narrative_dataset_request_sample` for the relevant column.
2. Generate a single revised expression.
3. `narrative_nql_validate` it. If it fails, fix and revalidate.
4. Return `MappingImprovementResponseSchema` shape — see
   `utils/llm/templates/mapping-improvement.ts`.

Do not re-run the full generation flow for a one-line improvement.

## Edge cases and gotchas

- **Reserved SQL identifiers MUST be double-quoted.** `type`, `value`,
  `user`, `order`, `group`, `select` are reserved. Write
  `column."type"`, never `column.type`. See `references/EXPRESSION_SYNTAX.md`.
- **Enum constraints are case-sensitive.** `'SHA256'` does NOT match
  `'sha256_email'`. When source values don't match the enum, generate
  a `CASE WHEN` and lower confidence. See `references/ENUM_HANDLING.md`.
- **Null handling is automatic at runtime.** Do NOT add `COALESCE` to
  mask nulls and do NOT flag null inputs as edge cases. Nulls in test
  results from null inputs are expected.
- **Object-mapping property_mappings is replace-all.** When suggesting
  a fix to one property of an object mapping, include *every* existing
  property_mapping in the suggested mapping — the API replaces the whole
  array.
- **Custom attributes are a fallback, not a primary path.** Only mention
  them in the summary when (a) zero Rosetta Stone matches exist for the
  dataset, or (b) several columns are clearly proprietary
  (internal_id, custom_metric_x, etc.).
- **Don't paraphrase the attribute catalog.** If you'd benefit from the
  attribute description, just call `narrative_attributes_describe` —
  don't reason from the search snippet alone.
- **Mapping confidence ≠ NQL validity.** A 100% valid NQL expression
  can still be a low-confidence mapping (e.g., `name` column → first
  name attribute vs full name attribute). Validate syntactically, then
  score semantically.
- **Token economy.** Don't pull `narrative_dataset_request_sample` with
  `limit > 50`. 25 rows are enough to spot every pattern this skill
  needs.

## Voice

The generation/evaluation prompts deliberately use first person ("I
analyzed 12 columns…") and conversational language ("cleaned up", not
"normalized"). Keep that tone in the `summary` field and in
`reasoning` fields — these strings are user-facing in the Narrative
Platform UI's Rosetta Stone normalization tab.

## Harness fallbacks

If `narrative-mcp` is unavailable:

- Ask the user to paste the dataset's schema + 10-25 sample rows + the
  Rosetta Stone attribute IDs they're considering (or to run
  `curl https://api.narrative.io/datasets/<id>` and paste the response).
- With that context pasted in, apply steps 5-8 of the procedure
  manually — you can't validate NQL syntactically without the server,
  so add a global warning saying expressions were not
  server-validated and confidence is reduced by 10 points across the
  board.
- Never silently degrade. If you can't validate, say so explicitly in
  the summary.

## Further reading

- `references/EXPRESSION_SYNTAX.md` — the SQL/NQL quoting,
  function, and CASE WHEN rules the original prompt's
  `EXPRESSION_SYNTAX_INSTRUCTIONS` section codifies. Read when an
  expression fails `narrative_nql_validate` or when mapping a column
  with a reserved-word name.
- `references/ENUM_HANDLING.md` — generation-vs-evaluation rules for
  enum-constrained attributes, including the CASE WHEN transformation
  patterns. Read when `narrative_attributes_describe` shows
  `{value1|value2|...}` constraints on the target attribute or
  property.
