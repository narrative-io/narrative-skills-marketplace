-- Waterfall skeleton for a cached_mapping's resolved view.
--
-- Substitute every <MACRO> and delete the CTE pairs for tiers the user
-- did not configure. Deleting a tier removes its CTEs and nothing
-- else: `llm_in`, `llm`, and the final SELECT are identical across
-- every combination, which is what lets one cache-fill task serve them
-- all. See references/WATERFALL_NQL.md for the per-combination diffs.
--
-- Macros:
--   <RESOLVED_VIEW>      name for this view, e.g. resolved_canine_breed
--   <SOURCE_DATASET>     dataset holding the messy raw values
--   <CACHE_DATASET>      the mapping's auto-provisioned cache
--   <INPUT_EXPR_0>       the mapping's first input_expression, verbatim
--   <CLASSIFIER>         registered model name
--   <CLASSIFIER_VERSION> model version, or NULL for the default
--   <LOOKUP_DATASET>     class-index -> class-name lookup
--   <THRESHOLD>          ML confidence gate, default 0.5
--   <LLM_MODEL>          Cortex model id, default openai-gpt-5
--   <LLM_ROW_CAP>        LLM calls per refresh, default 10000
--   <FALLBACK_VALUE>     enum value for off-enum LLM answers
--
-- The input expression appears in three places and must be byte-
-- identical in all of them, and identical to the mapping's
-- `input_expressions` entry. If they diverge the cache never hits and
-- the attribute silently reads NULL forever.

CREATE MATERIALIZED VIEW "<RESOLVED_VIEW>"
DISPLAY_NAME = '<Human-Readable Title — not the unique name>'
DESCRIPTION = '<What it normalizes, from which dataset, via which tiers, and that cached keys are excluded.>'
AS
WITH keys AS (
  -- Distinct un-cached, non-null keys.
  --
  -- The LEFT JOIN is an anti-join, deliberately not `NOT IN`: cache
  -- columns are nullable by design, and one NULL row makes `NOT IN`
  -- evaluate to UNKNOWN for every row, silently emptying the view
  -- rather than erroring. DISTINCT also absorbs fan-out from duplicate
  -- cache rows, since the cache is append-mode.
  --
  -- This anti-join is what makes a scheduled fill affordable. Without
  -- it every refresh re-asks the LLM about every unresolved key and
  -- discards the answer at INSERT time.
  --
  -- Read RAW COLUMNS here. Resolving `_rosetta_stone.<attribute>` for
  -- the attribute this mapping populates would compile into a join
  -- against the very cache this query fills, so the query would read
  -- its own partial output.
  --
  -- Multi-column key: add one `<INPUT_EXPR_i> AS input_i` per input
  -- expression, in the mapping's order, and one ON conjunct each.
  SELECT DISTINCT <INPUT_EXPR_0> AS input_0
  FROM company_data.<SOURCE_DATASET> s
  LEFT JOIN company_data.<CACHE_DATASET> c
    ON c.input_0 = <INPUT_EXPR_0>
  WHERE <INPUT_EXPR_0> IS NOT NULL
    AND c.input_0 IS NULL
),

-- ─── TIER 1: rules (optional) ──────────────────────────────────────
-- Cheap, deterministic, exact. Runs on everything. Keys the rules
-- catch never reach a model, so a rule outranks even a confident
-- classifier — which means tier order changes answers, not just cost.
rules AS (
  SELECT
    k.input_0,
    CASE k.input_0
      WHEN '<raw_value>' THEN '<canonical_enum_value>'
      -- one WHEN arm per rule the user configured
      ELSE NULL
    END AS rule_value
  FROM keys k
),

-- ─── REDUCE before tier 2 ──────────────────────────────────────────
-- The classifier is cheaper than the LLM, not free. Without this it
-- runs on rule-resolved keys too. Omit this CTE only when there is no
-- tier above the classifier — then `ml` reads FROM keys directly.
ml_in AS (
  SELECT r.input_0 FROM rules r WHERE r.rule_value IS NULL
),

-- ─── TIER 2: ML classifier (optional) ──────────────────────────────
-- PREDICT returns a class INDEX, not a name — map it through the
-- lookup dataset. PREDICT carries no confidence; PREDICT_PROBA does,
-- under the key `proba_<predicted index>`.
ml AS (
  SELECT
    m.input_0,
    CAST(PARSE_JSON(CALL_MODEL_FUNCTION('<CLASSIFIER>', '<CLASSIFIER_VERSION>', 'PREDICT', m.input_0))['prediction'] AS LONG) AS pred_idx,
    CALL_MODEL_FUNCTION('<CLASSIFIER>', '<CLASSIFIER_VERSION>', 'PREDICT_PROBA', m.input_0) AS proba_json
  FROM ml_in m
),
ml2 AS (
  SELECT
    ml.input_0,
    ml.pred_idx,
    CAST(PARSE_JSON(ml.proba_json)[CONCAT('proba_', CAST(ml.pred_idx AS STRING))] AS DOUBLE) AS ml_conf
  FROM ml
),

-- ─── Merge the cheap tiers ─────────────────────────────────────────
-- `resolver IS NULL` is the contract the LLM tier reads: it means
-- nothing cheaper answered this key. Keep `ml_conf` in the output even
-- when no ML tier ran — as `CAST(NULL AS DOUBLE)` — so the schema is
-- the same for every combination.
resolved AS (
  SELECT
    r.input_0,
    m2.ml_conf,
    CASE
      WHEN r.rule_value IS NOT NULL   THEN 'rule'
      WHEN m2.ml_conf >= <THRESHOLD>  THEN 'ml'
      ELSE NULL
    END AS resolver,
    CASE
      WHEN r.rule_value IS NOT NULL   THEN r.rule_value
      WHEN m2.ml_conf >= <THRESHOLD>  THEN lk.class_name
      ELSE NULL
    END AS resolved_value
  FROM rules r
  LEFT JOIN ml2 m2 ON m2.input_0 = r.input_0
  LEFT JOIN company_data.<LOOKUP_DATASET> lk ON lk.idx = m2.pred_idx
),

-- ═══════════════════════════════════════════════════════════════════
-- THE SHORT-CIRCUIT. Do not fold this CTE into a CASE or a COALESCE.
--
-- AI_COMPLETE is only affordable because this WHERE has already cut
-- the relation down to the fall-through rows. Snowflake does not
-- short-circuit an external function inside CASE/COALESCE: it
-- evaluates the branch for every row and discards the loser. The
-- output is byte-identical either way — only the bill changes, which
-- is exactly what makes the mistake so easy to ship.
--
-- CTE vs. subquery is irrelevant. A CTE with no WHERE is just as bad.
-- It is the WHERE that does the work, not the syntax around it.
--
-- Two more rules live here:
--   * The prompt must be a COLUMN. AI_COMPLETE rejects an inline
--     CONCAT with "Invalid UDF(ai_complete) call: '' prompt is
--     invalid".
--   * The cap must be QUALIFY, never ORDER BY ... LIMIT. A
--     materialized view stores an unordered bag of rows, so LIMIT does
--     not bound what later reads return. Keep the ORDER BY so which
--     rows survive is deterministic.
-- ═══════════════════════════════════════════════════════════════════
llm_in AS (
  SELECT
    t.input_0,
    CONCAT('<PROMPT_TEXT — instruction plus the full enum, ending with a trailing space>', t.input_0) AS ptext
  FROM resolved t
  WHERE t.resolver IS NULL
  QUALIFY ROW_NUMBER() OVER (ORDER BY t.input_0) <= <LLM_ROW_CAP>
),

-- ─── TIER 3: the LLM. Always last. ─────────────────────────────────
llm AS (
  SELECT
    s.input_0,
    AI_COMPLETE('<LLM_MODEL>', s.ptext, '{"temperature":0}', '{}', FALSE) AS llm_raw
  FROM llm_in s
)

SELECT
  t.input_0,
  CASE
    WHEN t.resolver IS NOT NULL   THEN t.resolver
    WHEN llm.input_0 IS NOT NULL  THEN 'llm'
    ELSE NULL                     -- cut by the row cap; not an error
  END AS resolver,
  t.ml_conf,
  -- Enum validation, one arm per allowed value, so an off-enum answer
  -- becomes <FALLBACK_VALUE> instead of junk in the cache. Generate
  -- these arms from the attribute's enum — not from a classifier's
  -- class lookup, which omits any enum value the model wasn't trained
  -- on. That gap is how a correct "Mixed Breed" silently became
  -- "Unknown".
  CASE
    WHEN t.resolver IS NOT NULL                       THEN t.resolved_value
    WHEN UPPER(TRIM(llm.llm_raw)) = '<ENUM_UPPER_1>'  THEN '<ENUM_VALUE_1>'
    -- one arm per enum value
    WHEN llm.input_0 IS NOT NULL                      THEN '<FALLBACK_VALUE>'
    ELSE NULL
  END AS mapped_value
FROM resolved t
LEFT JOIN llm ON llm.input_0 = t.input_0
