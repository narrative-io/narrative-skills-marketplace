-- The synthetic half: every part view from 02-synthetic-part.sql in one
-- persistent dataset.
--
-- The parts carry EXPIRE and _nio_interactive and disappear within a
-- day. This view is half the deliverable, so it gets neither: it stays
-- visible and queryable, which is what makes a later "score on real rows
-- only" or "rebuild just the synthetic half" possible.
--
-- Substitute before validating:
--
--   <SYNTH_NAME>  e.g. dog_breed_train_synthetic
--   <PART_N>      each part view, one SELECT arm per part
--
-- Column lists must name the same columns in the same order on every
-- arm. NQL has no SELECT *, and a mismatched order across UNION ALL
-- either fails on type or silently swaps two columns of the same type.
--
-- Use a name that does not already exist. Re-issuing CREATE
-- MATERIALIZED VIEW against an existing name completes in about two
-- seconds, enqueues no job, and leaves the old rows in place —
-- WRITE_MODE = 'overwrite' does not override it, and the run reports
-- success. Confirm the row count from the job result, not the status.

CREATE MATERIALIZED VIEW "<SYNTH_NAME>"
DISPLAY_NAME = '<Human Title> — Synthetic Labeled Rows'
DESCRIPTION = 'Invented <LABEL_INPUT>-shaped values written to fill the <ATTRIBUTE_NAME> classes that <VIEW_NAME_REAL> covers thinly or not at all. No row here exists in <SOURCE>. Surface forms mimic the source conventions.'
TAGS = ('training_data', 'classifier', 'synthetic')
AS
SELECT
  company_data."<PART_1>".input_0 AS input_0,
  company_data."<PART_1>".label AS label,
  company_data."<PART_1>".training_source AS training_source,
  company_data."<PART_1>".labeled_by AS labeled_by,
  company_data."<PART_1>".label_confidence AS label_confidence,
  company_data."<PART_1>".input_freq AS input_freq
FROM company_data."<PART_1>"
UNION ALL
SELECT
  company_data."<PART_2>".input_0 AS input_0,
  company_data."<PART_2>".label AS label,
  company_data."<PART_2>".training_source AS training_source,
  company_data."<PART_2>".labeled_by AS labeled_by,
  company_data."<PART_2>".label_confidence AS label_confidence,
  company_data."<PART_2>".input_freq AS input_freq
FROM company_data."<PART_2>"
