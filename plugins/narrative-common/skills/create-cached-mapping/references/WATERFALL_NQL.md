# The waterfall query

How the resolved view is shaped, what changes when a tier is enabled or
disabled, and why the one cost rule is not negotiable. Read this when
generating or reviewing the waterfall NQL. The full annotated query
lives in [`../assets/templates/waterfall-skeleton.sql`](../assets/templates/waterfall-skeleton.sql).

Everything about tier behavior and the short-circuit here was proven
end to end on 98 distinct keys in Narrative Demos (company 1634); job
IDs are in [Proven runs](#proven-runs) so any claim can be re-read
rather than trusted.

---

## The one rule

`AI_COMPLETE` must run against a relation a `WHERE` has already reduced
to the rows nothing cheaper resolved.

```sql
-- the only form that works
llm_in AS (SELECT ... FROM resolved WHERE resolver IS NULL),
llm    AS (SELECT ... AI_COMPLETE(...) FROM llm_in)
-- then LEFT JOIN llm back onto resolved

-- these all call the LLM on every row
CASE WHEN resolver IS NOT NULL THEN x ELSE AI_COMPLETE(...) END
COALESCE(x, AI_COMPLETE(...))
llm AS (SELECT ... AI_COMPLETE(...) FROM resolved)   -- CTE, no WHERE
```

Snowflake does not guarantee short-circuit evaluation of an external
function inside `CASE` or `COALESCE`. It evaluates the branch for every
row and discards the losing one. The output is byte-identical either
way — which is precisely what makes this dangerous. The only visible
difference is the bill.

CTE vs. subquery makes no difference. A CTE without a `WHERE` is just
as bad. It is the `WHERE` that does the work, not the syntax wrapping
it.

If you are tempted to "clean up" the `llm_in` CTE: folding it into a
`CASE` turned 64 model calls into 98 on a 98-row demo, and it scales
with the table rather than with the fall-through set.

### How this was proven

You cannot prove it from output values, so the proof rigs an unwanted
call to be *fatal*: swap in a model that doesn't exist
(`openai-gpt-does-not-exist-9`) and force every row to resolve in an
earlier tier. A passing job means the LLM was never invoked; a failing
job means it was.

| Probe | Job | Outcome |
|---|---|---|
| rules → ML → LLM | `37bb942a` | LLM never invoked |
| rules → LLM | `3151c7e0` | LLM never invoked |
| ML → LLM | `b1577cf4` | LLM never invoked |
| **negative control** — same query, the `WHERE` deleted | `a8edf8d9` | LLM invoked on all 98 rows |

The negative control is the whole argument. Three passing probes prove
nothing without it — a probe that cannot fail is not a probe.
`a8edf8d9` differs from `37bb942a` by exactly one line.

### Every expensive tier gets its own reduce CTE

Not just the LLM. An earlier implementation ran the classifier on all
98 keys and applied the rules afterward, so the 7 rule-resolved keys
each paid for a model call they didn't need. That is what `ml_in` is
for. The classifier is cheaper than the LLM, not free.

---

## The skeleton

```
keys      -- SELECT DISTINCT <input expr>, anti-joined vs the cache   always
rules     -- CASE ... END AS rule_value                               tier 1, optional
ml_in     -- WHERE rule_value IS NULL          <- reduce before paying
ml / ml2  -- CALL_MODEL_FUNCTION PREDICT / PREDICT_PROBA              tier 2, optional
resolved  -- resolver, ml_conf, resolved_value                        always
llm_in    -- WHERE resolver IS NULL            <- the short-circuit
          -- QUALIFY ROW_NUMBER() OVER (ORDER BY input_0) <= <cap>    the row cap
llm       -- AI_COMPLETE(...)                                         always last
SELECT ... FROM resolved LEFT JOIN llm ON llm.input_0 = resolved.input_0
```

The output schema is identical for every tier combination:

| Column | Meaning |
|---|---|
| `input_0` | the join key — the same expression the mapping uses |
| `resolver` | `rule` / `ml` / `llm`, or `NULL` when the row was cut by the cap |
| `ml_conf` | classifier confidence; `CAST(NULL AS DOUBLE)` when no ML tier ran |
| `mapped_value` | the canonical value, or `NULL` if unresolved |

Holding that schema stable regardless of which tiers are enabled is
what lets one cache-fill task serve every configuration.

---

## What changes between combinations

Enabling or disabling a tier adds or removes CTEs. It never rewrites
the rest of the query. `llm_in`, `llm`, and the final `SELECT` are
byte-identical across all three combinations below.

### Rules → ML → LLM

The reference implementation. All CTEs present, exactly as the
skeleton shows.

### Rules → LLM (no classifier)

- Delete `ml_in`, `ml`, `ml2`.
- Replace the merge CTE with one that reads the rules alone, keeping
  `ml_conf` as a typed NULL so the output schema doesn't shift:

  ```sql
  resolved AS (
    SELECT
      r.input_0,
      CAST(NULL AS DOUBLE) AS ml_conf,
      CASE WHEN r.rule_value IS NOT NULL THEN 'rule' ELSE NULL END AS resolver,
      r.rule_value AS resolved_value
    FROM rules r
  ),
  ```

- Drop the lookup join that turned a class index into a name. There is
  no class index any more.

### ML → LLM (no rules)

- Delete `rules`.
- `ml` reads `FROM keys k` directly. With no tier above it there is
  nothing to reduce against, so there is no `ml_in`.

  ```sql
  resolved AS (
    SELECT
      m2.input_0,
      m2.ml_conf,
      CASE WHEN m2.ml_conf >= <THRESHOLD> THEN 'ml'           ELSE NULL END AS resolver,
      CASE WHEN m2.ml_conf >= <THRESHOLD> THEN lk.class_name  ELSE NULL END AS resolved_value
    FROM ml2 m2
    LEFT JOIN company_data.<LOOKUP_DATASET> lk ON lk.idx = m2.pred_idx
  ),
  ```

### Tier order is a real decision, not just cost

Rules → ML → LLM resolves **27** keys by ML. ML → LLM resolves **28**.
The extra one is a key the rules catch in the full waterfall — the
classifier would also have answered it above threshold, but the rule
wins because it runs first. Reordering tiers changes answers, not only
spend. The order is fixed at Rules → Classifier → LLM for this reason:
cheapest and most deterministic first, and the user gets to decide what
a rule overrides by writing the rule.

### Rules-only or ML-only (no LLM)

The skeleton permits it — delete `llm_in` and `llm`, and drop the join
and the enum arms from the final `SELECT`. This is **not** in the
proven set; every proven combination ends in an LLM tier. It is a
reasonable shape (a pure rules table is just a lookup), but validate it
and say plainly that it is untested. Every key that no tier resolves
lands in the cache as nothing at all, so the attribute reads NULL for
it.

---

## The cache anti-join

`keys` excludes values the cache already holds:

```sql
keys AS (
  SELECT DISTINCT <INPUT_EXPR_0> AS input_0
  FROM company_data.<SOURCE_DATASET> s
  LEFT JOIN company_data.<CACHE_DATASET> c
    ON c.input_0 = <INPUT_EXPR_0>
  WHERE <INPUT_EXPR_0> IS NOT NULL
    AND c.input_0 IS NULL
)
```

Three things about this form:

- **Not `NOT IN`.** Cache columns are nullable by design — the reader's
  null-safe join matches a NULL source key against a NULL cache key, so
  the cache legitimately stores NULLs. A single NULL makes `NOT IN`
  evaluate to UNKNOWN for every row, which silently empties the view
  instead of raising. The `LEFT JOIN … IS NULL` form has no such trap.
- **`DISTINCT` is load-bearing.** The cache is append-mode, so a key
  could appear more than once; without `DISTINCT` the join fans out.
- **Multi-column keys extend naturally.** Add one
  `<INPUT_EXPR_i> AS input_i` per input expression and one `ON`
  conjunct each. No separator encoding is involved — the cache has one
  typed column per input expression.

This anti-join is an extension of the proven work, not part of it. The
demo deduped only at INSERT time, *after* the waterfall had already
paid the LLM for keys it had answered on a previous run. Moving the
filter up into `keys` applies the same "reduce before you pay" rule
that makes `ml_in` necessary. It validates, and the logic is
straightforward, but no scheduled run has yet demonstrated the cost
behavior over time — say so when reporting.

---

## Enum validation

The LLM must return a value from the attribute's enum or the cache
fills with junk. Generate one `CASE` arm per allowed value:

```sql
CASE
  WHEN t.resolver IS NOT NULL                       THEN t.resolved_value
  WHEN UPPER(TRIM(llm.llm_raw)) = 'MIXED BREED'     THEN 'Mixed Breed'
  -- one arm per enum value
  WHEN llm.input_0 IS NOT NULL                      THEN '<FALLBACK_VALUE>'
  ELSE NULL
END AS mapped_value
```

Generate the arms from **the attribute's enum**, never from a
classifier's class lookup. The demo validated against a 128-breed
lookup while the attribute enum had 130 values — the 128 plus
`Mixed Breed` and `Unknown`. A correct LLM answer of "Mixed Breed" was
therefore coerced to "Unknown", silently. Any classifier trained on a
subset of the enum reproduces that bug.

Strict validation still costs near-misses: an LLM answering "Standard
Poodle" becomes the fallback because the canonical value is "Poodle".
Prefer prompting the model with the full enum and `temperature: 0` over
loosening the match. If near-misses are common enough to matter, that
is a case for a fuzzy reconciliation tier, not for accepting off-enum
values into the cache.

---

## Proven runs

98 distinct keys from `vet_intake_raw` (38281), plane
`b42b5e8e-e7e2-48da-b577-79218c9ea280`.

| Combination | Job | rule | ml | llm | unresolved |
|---|---|---|---|---|---|
| Rules → ML → LLM | `2d13bcfd` | 7 | 27 | 64 | 0 |
| Rules → LLM | `be5e01cb` | 7 | — | 91 | 0 |
| ML → LLM | `fdb8f644` | — | 28 | 70 | 0 |
| Rules → ML → LLM, cap = 5 | `9d4a5214` | 7 | 27 | **5** | **59** |

The cap run is the full waterfall with one character changed
(`<= 10000` → `<= 5`): exactly 5 keys reached the LLM and 59 came back
NULL. The cap holds, and an under-filled cache reads as "not answered
yet" rather than as a wrong answer.

Cache leg, same workflow and same NQL, differing only in the cache's
status: `pending` failed in 1.5s with no job spawned; `active` produced
job `f8622136` with `inserted_rows: 98`. End-to-end read afterward
(job `e2585d29`) returned 100 rows, 100 resolved, 0 NULL.

### Model notes

- `CALL_MODEL_FUNCTION(..., 'PREDICT', key)` returns a class **index**,
  not a name — map it through the lookup dataset.
- `PREDICT` carries no confidence. `PREDICT_PROBA` does: read
  `proba_<predicted index>`. That value drives the threshold gate.
- Cortex model ids matter. `claude-3-5-sonnet` was unavailable and
  `claude-3-7-sonnet` deprecated; `openai-gpt-5` works. Verify before
  defaulting to anything else.
