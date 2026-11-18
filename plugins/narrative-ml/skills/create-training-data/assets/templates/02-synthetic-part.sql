-- One chunk of synthetic rows, as its own temporary materialized view.
--
-- INSERT cannot target a materialized view, and a materialized view is
-- the only thing NQL creates, so the rows arrive inside CREATE
-- statements rather than being appended to an existing dataset. The
-- multi-column VALUES constructor below is the compact way to carry
-- them; it validates and it runs.
--
-- Emit one of these per chunk of roughly 500 rows, then union them with
-- 03-synthetic-union.sql. Each part is temporary because the deliverable
-- is the union, not the parts.
--
-- Substitute before validating:
--
--   <PART_NAME>   e.g. dog_breed_synth_p1
--   <N>           the part number
--   <UNION_NAME>  the synthetic view these parts union into
--   <ROWS>        the chunk's rows: ('<input>', '<Class>'), one per line
--
-- Every value is a single-quoted SQL string literal. Two characters
-- need escaping and both are easy to miss in rows that are deliberately
-- full of typos and punctuation noise:
--
--   apostrophe  ->  double it:      'O''Brien'
--   backslash   ->  double it:      'n\\a'   (stores n\a)
--
-- A backslash is an escape character inside the literal, so a raw 'n\a'
-- is read as an escape sequence and the stored value is not what was
-- written. Scan each chunk for both before submitting.
--
-- Column names, order and types must match 01-real-labeled.sql exactly,
-- or the UNION ALL in 04-union.sql will not line up.

CREATE MATERIALIZED VIEW "<PART_NAME>"
DISPLAY_NAME = '<Human Title> — Synthetic Part <N>'
DESCRIPTION = 'Part <N> of the agent-written synthetic training rows for <Human Title>. Intermediate artifact; the deliverable is <UNION_NAME>.'
EXPIRE = 'P1D'
TAGS = ('_nio_materialized_view', '_nio_interactive')
AS
SELECT
  t.a AS input_0,
  t.b AS label,
  'synthetic' AS training_source,
  'synthetic_seed' AS labeled_by,
  CAST(1.0 AS double) AS label_confidence,
  CAST(1 AS long) AS input_freq
FROM (VALUES
  <ROWS>
) AS t(a, b)

-- <ROWS> looks like this, one line per example:
--
--   ('alsatian', 'German Shepherd Dog'),
--   ('Berger Allemand', 'German Shepherd Dog'),
--   ('german shepard', 'German Shepherd Dog'),
--   ('lab/golden x', 'Mixed Breed'),
--   ('n/a', 'Unknown')
