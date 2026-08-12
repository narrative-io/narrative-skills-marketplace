-- Creates the synthetic dataset and puts the first row in it.
--
-- INSERT cannot create a dataset, so something has to exist before the
-- ExecuteDml steps can append to it. This statement is that something.
-- It carries one genuine synthetic row rather than zero rows, which
-- avoids depending on an empty materialized view behaving sensibly.
--
-- The literal row is written as a CTE with no FROM, then selected from.
-- That is the construction the AI-enrichment cookbook uses, so it is
-- the one with evidence behind it. Do not reach for
-- `FROM (VALUES (...), (...)) AS t(a, b)` here: the single-column form
-- of that appears in working queries, but the multi-column form is not
-- documented, and this path does not need it.
--
-- Substitute before validating:
--
--   <VIEW_NAME>   e.g. dog_breed_train_synthetic
--   <INPUT_0>     the first synthetic input value
--   <LABEL>       the class that value belongs to
--
-- Column names and types must match 01-real-labeled.sql exactly, or the
-- UNION ALL in 04-union.sql will not line up.

CREATE MATERIALIZED VIEW "<VIEW_NAME>"
DISPLAY_NAME = '<Human Title> — Synthetic Labeled Rows'
DESCRIPTION = 'Invented <LABEL_INPUT>-shaped values written to fill the classes that <VIEW_NAME_REAL> covers thinly or not at all. No row here exists in the source data.'
TAGS = ('training_data', 'classifier', 'synthetic')
WRITE_MODE = 'overwrite'
AS
WITH seed AS (
  SELECT
    '<INPUT_0>' AS input_0,
    '<LABEL>' AS label
)
SELECT
  seed.input_0 AS input_0,
  seed.label AS label,
  'synthetic' AS training_source,
  'synthetic_seed' AS labeled_by,
  CAST(1.0 AS double) AS label_confidence,
  CAST(1 AS long) AS input_freq
FROM seed
