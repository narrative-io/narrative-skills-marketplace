-- The training deliverable: real rows and synthetic rows in one view.
--
-- Substitute before validating:
--
--   <VIEW_NAME>            the training view name, e.g. dog_breed_train
--   <VIEW_NAME_REAL>       e.g. dog_breed_train_real
--   <VIEW_NAME_SYNTHETIC>  e.g. dog_breed_train_synthetic
--
-- Column lists on both sides must name the same columns in the same
-- order. NQL has no SELECT *, and a mismatched order across UNION ALL
-- either fails on type or silently swaps two columns of the same type.
--
-- This view is the deliverable, so it gets no EXPIRE and no
-- _nio_interactive tag: it should persist and be visible in the
-- dataset list and in Classifier Studio's dataset picker.

CREATE MATERIALIZED VIEW "<VIEW_NAME>"
DISPLAY_NAME = '<Human Title> — Classifier Training Set'
DESCRIPTION = 'Training rows mapping <LABEL_INPUT>-shaped values to <ATTRIBUTE_NAME> classes. Real rows labeled from <SOURCE>; synthetic rows fill the classes real data covers thinly. Filter on training_source to evaluate against real rows only.'
TAGS = ('training_data', 'classifier')
WRITE_MODE = 'overwrite'
AS
SELECT
  company_data."<VIEW_NAME_REAL>".input_0 AS input_0,
  company_data."<VIEW_NAME_REAL>".label AS label,
  company_data."<VIEW_NAME_REAL>".training_source AS training_source,
  company_data."<VIEW_NAME_REAL>".labeled_by AS labeled_by,
  company_data."<VIEW_NAME_REAL>".label_confidence AS label_confidence,
  company_data."<VIEW_NAME_REAL>".input_freq AS input_freq
FROM company_data."<VIEW_NAME_REAL>"
UNION ALL
SELECT
  company_data."<VIEW_NAME_SYNTHETIC>".input_0 AS input_0,
  company_data."<VIEW_NAME_SYNTHETIC>".label AS label,
  company_data."<VIEW_NAME_SYNTHETIC>".training_source AS training_source,
  company_data."<VIEW_NAME_SYNTHETIC>".labeled_by AS labeled_by,
  company_data."<VIEW_NAME_SYNTHETIC>".label_confidence AS label_confidence,
  company_data."<VIEW_NAME_SYNTHETIC>".input_freq AS input_freq
FROM company_data."<VIEW_NAME_SYNTHETIC>"
