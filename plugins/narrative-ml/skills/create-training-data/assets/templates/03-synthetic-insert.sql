-- One chunk of synthetic rows, appended to the dataset 02 created.
--
-- This is the body of an ExecuteDml workflow task, not something to
-- send to narrative_nql_run. ExecuteDml is the documented surface for
-- INSERT / UPDATE / DELETE, and a workflow runs its steps in order, so
-- the create-then-append sequence is guaranteed rather than assumed.
--
-- Substitute before validating:
--
--   <VIEW_NAME>   the dataset 02-synthetic-seed.sql created
--   <ROWS>        the chunk's rows, comma-separated
--
-- The column list is required. NQL does not infer columns from the
-- dataset schema, and expressions bind to columns by position, not by
-- name — so the order here must match the column list above it.
--
-- Every string is a single-quoted literal, so an apostrophe inside one
-- has to be doubled: 'O''Brien'. Misspellings are the point of many of
-- these rows, which makes quoting errors likelier here than anywhere
-- else in the skill. Check each row.

INSERT INTO company_data."<VIEW_NAME>" (
  input_0,
  label,
  training_source,
  labeled_by,
  label_confidence,
  input_freq
)
VALUES
  <ROWS>

-- <ROWS> looks like this, one line per example:
--
--   ('golden retreiver', 'Golden Retriever', 'synthetic', 'synthetic_seed', 1.0, 1),
--   ('GOLD RETRIEVER MIX', 'Mixed Breed', 'synthetic', 'synthetic_seed', 1.0, 1),
--   ('lab/golden x', 'Mixed Breed', 'synthetic', 'synthetic_seed', 1.0, 1),
--   ('g. retriever', 'Golden Retriever', 'synthetic', 'synthetic_seed', 1.0, 1),
--   ('n/a', 'Unknown', 'synthetic', 'synthetic_seed', 1.0, 1)
