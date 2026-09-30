<!-- AUTO-GENERATED from NQL_GENERATION.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# Generating the waterfall NQL

The mechanics of turning the phase-4 configuration into a validated
query: prompt construction, enum validation arms, view naming, and the
two-pass validation the cache's late arrival forces.

Read this in phase 5, alongside
[`../assets/templates/waterfall-skeleton.sql`](../assets/templates/waterfall-skeleton.sql)
(what to substitute into) and [`WATERFALL_NQL.md`](WATERFALL_NQL.md)
(why each CTE exists, and the per-combination diffs).

## Building the prompt

The prompt is a **column** produced in `llm_in`, never an inline
expression — `AI_COMPLETE` rejects the latter outright. Build it with
`CONCAT('<static instruction>', t.input_0)` and put everything static in
the literal.

The instruction needs five things, in this order:

1. What the value is and what to turn it into ("normalize a free-text
   dog breed entry to a fixed canonical vocabulary").
2. **Every enum value, verbatim** — exact casing, accents, parentheses.
   This is the single highest-leverage part of the prompt: a model shown
   the vocabulary answers in it, and an answer outside it becomes the
   fallback.
3. "Return EXACTLY one value from this list, copied
   character-for-character, and NOTHING else."
4. When to use the special members — the catch-all and the
   unidentifiable case, named explicitly.
5. The label the key is concatenated onto, ending in a trailing space:
   `... Entry: `.

Pass `'{"temperature":0}'` as the model parameters. Determinism matters
more than variety here: the same messy key should resolve the same way
across refreshes, or the cache becomes a record of which day a value
happened to be seen.

A long enum makes a long literal. That is fine — the cost is paid per
call regardless, and truncating the list to save prompt tokens trades a
known small cost for silent misclassification.

## Generating the enum validation arms

One `CASE` arm per allowed value, matching on `UPPER(TRIM(llm.llm_raw))`
and returning the value verbatim:

```sql
WHEN UPPER(TRIM(llm.llm_raw)) = 'MIXED BREED' THEN 'Mixed Breed'
```

Generate the arms from **the attribute's enum**. Not from a classifier's
class lookup — that omits any enum member the model wasn't trained on,
which is how a correct "Mixed Breed" was silently coerced to "Unknown"
in the original demo. The lookup dataset's only job is translating the
classifier's numeric class index into a name.

`UPPER(TRIM(...))` absorbs the two variations models actually produce:
surrounding whitespace and inconsistent casing. It will not absorb
"Standard Poodle" for "Poodle", and it shouldn't — see the near-miss
note in [`WATERFALL_NQL.md`](WATERFALL_NQL.md).

The final arm before `ELSE NULL` is the fallback: any row that reached
the LLM and matched no enum value. Keep `ELSE NULL` distinct from it —
NULL means "no tier answered this key" (cut by the row cap), while the
fallback means "the LLM answered and the answer was unusable." Collapsing
them loses the ability to tell an unfilled cache from a failing prompt.

## Naming the resolved view

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

For a resolved view specifically, the description should name the source
dataset, the tiers in play with their thresholds, and the fact that
already-cached keys are excluded — that last clause is what tells a
future reader why the view's row count is smaller than the source's
distinct count.

## Validating in two passes

The cache does not exist until the mapping is created in phase 7, but the
`keys` anti-join references it by name. That splits validation:

| Pass | When | What is validated |
|---|---|---|
| 1 | Phase 5 | The whole query **with the `keys` anti-join omitted** — every tier, the prompt column, the `QUALIFY` cap, the enum arms. |
| 2 | Phase 7 | The complete query, anti-join included, against the real cache name. |

Pass 1 covers where mistakes actually live. Pass 2 exists because the
anti-join is the one clause the two versions differ by, and it touches a
dataset that did not exist when pass 1 ran. Do not skip it.

This skill **generates** its NQL rather than macro-substituting an
external artifact, so the auto-fix path applies: read the error, correct
the query, re-validate.

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

## Do not run the query to check it

`narrative_nql_validate` compiles without executing. `narrative_nql_run`
executes — and for this query, executing means paying for classifier and
LLM calls across the whole fall-through set. Never substitute one for the
other, and never "just try it" to see whether it works.
