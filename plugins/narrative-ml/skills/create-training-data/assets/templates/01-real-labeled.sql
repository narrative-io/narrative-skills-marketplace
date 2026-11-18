-- Real training rows: distinct source values, resolved by exact match
-- against the enum first and by AI_COMPLETE only for what is left.
--
-- Substitute every <PLACEHOLDER> before validating:
--
--   <VIEW_NAME>        view name, e.g. dog_breed_train_real
--   <SOURCE>           source dataset reference, e.g. company_data."38206"
--   <LABEL_INPUT>      column the labeler reads, e.g. breed_raw
--   <ENUM_ROWS>        one ('Class Name') row per enum value, comma-separated
--   <PROMPT_PREFIX>    the labeling prompt, ending with 'Entry: '
--   <RESPONSE_FORMAT>  the JSON response_format string, enum-constrained
--   <MODEL>            model id, e.g. openai-gpt-5
--   <MIN_CONFIDENCE>   e.g. 0.75
--   <MAX_PER_CLASS>    e.g. 500
--
-- Both <PROMPT_PREFIX> and <RESPONSE_FORMAT> are single-quoted SQL string
-- literals, so any apostrophe inside them has to be doubled.

CREATE MATERIALIZED VIEW "<VIEW_NAME>"
DISPLAY_NAME = '<Human Title> — Real Labeled Rows'
DESCRIPTION = 'Distinct <LABEL_INPUT> values from <SOURCE>, labeled with the <ATTRIBUTE_NAME> classes by exact match and by <MODEL> above <MIN_CONFIDENCE> confidence. Capped at <MAX_PER_CLASS> rows per class.'
TAGS = ('training_data', 'classifier', 'real')
WRITE_MODE = 'overwrite'
AS
WITH enum_vals AS (
  SELECT "value" FROM (VALUES
    <ENUM_ROWS>
  ) AS enum_rows("value")
),
distinct_inputs AS (
  SELECT
    TRIM(<SOURCE>.<LABEL_INPUT>) AS input_0,
    COUNT(1) AS row_freq
  FROM <SOURCE>
  WHERE <SOURCE>.<LABEL_INPUT> IS NOT NULL
    AND TRIM(<SOURCE>.<LABEL_INPUT>) <> ''
  GROUP BY TRIM(<SOURCE>.<LABEL_INPUT>)
),
matched AS (
  SELECT
    distinct_inputs.input_0 AS input_0,
    distinct_inputs.row_freq AS row_freq,
    enum_vals."value" AS matched_label
  FROM distinct_inputs
  LEFT JOIN enum_vals ON UPPER(distinct_inputs.input_0) = UPPER(enum_vals."value")
),
llm_in AS (
  SELECT
    matched.input_0 AS input_0,
    matched.row_freq AS row_freq,
    CONCAT('<PROMPT_PREFIX>', matched.input_0) AS prompt_text
  FROM matched
  WHERE matched.matched_label IS NULL
),
llm_raw AS (
  SELECT
    llm_in.input_0 AS input_0,
    llm_in.row_freq AS row_freq,
    AI_COMPLETE(
      '<MODEL>',
      llm_in.prompt_text,
      '{"temperature":0}',
      '<RESPONSE_FORMAT>',
      FALSE
    ) AS response
  FROM llm_in
),
llm_out AS (
  SELECT
    llm_raw.input_0 AS input_0,
    llm_raw.row_freq AS row_freq,
    CAST(PARSE_JSON(llm_raw.response)['value'] AS STRING) AS raw_label,
    CAST(PARSE_JSON(llm_raw.response)['confidence_score'] AS DOUBLE) AS confidence
  FROM llm_raw
),
llm_labeled AS (
  SELECT
    llm_out.input_0 AS input_0,
    llm_out.row_freq AS row_freq,
    enum_vals."value" AS label,
    llm_out.confidence AS label_confidence
  FROM llm_out
  JOIN enum_vals ON UPPER(enum_vals."value") = UPPER(TRIM(llm_out.raw_label))
  WHERE llm_out.confidence >= <MIN_CONFIDENCE>
),
labeled AS (
  SELECT
    matched.input_0 AS input_0,
    matched.row_freq AS row_freq,
    matched.matched_label AS label,
    CAST(1.0 AS double) AS label_confidence,
    'exact_match' AS labeled_by
  FROM matched
  WHERE matched.matched_label IS NOT NULL
  UNION ALL
  SELECT
    llm_labeled.input_0 AS input_0,
    llm_labeled.row_freq AS row_freq,
    llm_labeled.label AS label,
    llm_labeled.label_confidence AS label_confidence,
    'llm:<MODEL>' AS labeled_by
  FROM llm_labeled
)
SELECT
  labeled.input_0 AS input_0,
  labeled.label AS label,
  'real' AS training_source,
  labeled.labeled_by AS labeled_by,
  labeled.label_confidence AS label_confidence,
  labeled.row_freq AS input_freq
FROM labeled
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY labeled.label
  ORDER BY labeled.row_freq DESC
) <= <MAX_PER_CLASS>
