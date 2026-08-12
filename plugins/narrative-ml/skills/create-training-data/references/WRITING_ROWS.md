# Getting agent-written rows into a dataset

Read before phase 7. The synthetic rows are written in the
conversation, so something has to carry them into the platform. There
is no upload step and no staging file: the rows travel as SQL string
literals inside statements the platform executes.

## The path this skill uses

Two statements, run as an ordered workflow:

1. **`CreateMaterializedViewIfNotExists`** runs the seed statement,
   which creates the dataset and puts the first row in it.
2. **One `ExecuteDml` task per chunk** runs an
   `INSERT INTO … (columns) VALUES (…), (…), …` that appends the rest.

`ExecuteDml` is the documented execution surface for `INSERT`,
`UPDATE`, and `DELETE`. Running the pair as a workflow rather than as
two separate calls is what guarantees the ordering: workflow steps run
sequentially, and `INSERT` fails if its target does not exist yet.

`INSERT` never creates a dataset, which is why the seed statement
exists at all.

## Why the seed carries a row instead of being empty

The seed could have been a zero-row statement, and then every synthetic
row would arrive through one mechanism. It carries one real row instead,
for two reasons: an empty materialized view is a shape worth not
depending on, and a zero-row seed needs a constant-false predicate whose
handling is one more thing to be unsure about. One genuine row costs
nothing and removes both questions.

## Constructions, and which ones have evidence

Three ways exist to express literal rows in NQL. They are not equally
well established, and the difference matters when a query fails at
run time after passing validation.

| Construction | Evidence | Used here |
| --- | --- | --- |
| `INSERT INTO t (cols) VALUES (…), (…)` | Documented in `/nql/commands/insert`, multi-row and multi-column | Yes, for every chunk |
| `WITH s AS (SELECT 'a' AS x) SELECT … FROM s` | The AI-enrichment cookbook uses exactly this shape | Yes, for the seed |
| `FROM (VALUES ('a','b')) AS t(x, y)` | The single-column form appears in working queries; the multi-column form is not documented | No |

The third one probably works — it is the same table-constructor grammar
as the single-column form, which does. But the first two cover
everything this skill needs and neither rests on an inference, so
neither is worth trading for brevity.

Where a table constructor is genuinely convenient and the column count
is one, it is fine. The enum list in `01-real-labeled.sql` uses
`(VALUES ('Class'), ('Class')) AS enum_rows("value")` for that reason.

## Chunk sizing

Roughly 500 rows per `INSERT` statement, one statement per `ExecuteDml`
task.

The limit that matters is not a platform maximum. It is that a single
mis-escaped apostrophe fails the whole statement, and finding it in 500
rows is quick where finding it in 5,000 is not. Smaller chunks also
mean a failure part-way through loses less work, since the chunks that
already ran stay committed.

## Quoting

Every value is a single-quoted SQL string literal, so an apostrophe
inside one has to be doubled:

```sql
('O''Brien''s Terrier', 'Unknown', 'synthetic', 'synthetic_seed', 1.0, 1)
```

This is the most likely thing to go wrong in the whole phase, because
misspellings and punctuation noise are deliberately part of the rows
being generated. Scan each chunk for apostrophes before submitting it.

## Validate before submitting

`narrative_workflows_create` checks the YAML shape and the task
contract. It does not check NQL semantics inside `nql:` fields, so a
malformed `INSERT` gets caught at run time rather than at submission.

Validate both statements separately first:

```
narrative_nql_validate(nql: <the seed CREATE statement>, data_plane_id: <plane>)
narrative_nql_validate(nql: <a two-row version of chunk 1>, data_plane_id: <plane>)
```

Two rows is enough to confirm the column list, the positional binding,
and the types. Once it validates, the full chunk differs only in how
many rows follow `VALUES`.

## Re-running

`CreateMaterializedViewIfNotExists` skips the create when the dataset
already exists, and the `ExecuteDml` steps append regardless. Running
the same workflow twice therefore produces two copies of every row, and
duplicate training rows quietly reweight the classes they belong to.

To re-run, use a new dataset name or delete the existing dataset first.
Say which one is happening; silently appending to a dataset a model was
already trained on makes that model's training set unreconstructable.

## What this skill does not use

**The file upload API.** `POST /uploads` and the dataset-files endpoints
are the platform's bulk ingestion path, and for hundreds of thousands of
rows they are the right answer. They have no MCP tool, so reaching them
means hand-rolled authentication inside the skill. Synthetic training
sets are thousands of rows at most, which `INSERT` handles comfortably.

**`narrative_nql_run` for the `INSERT`.** The docs place `INSERT` on the
NQL query endpoint as well as in `ExecuteDml`, so submitting it directly
may well work. `ExecuteDml` is the surface the workflow documentation
names for DML, and using it also buys the ordering guarantee, so this
skill does not depend on the other path being available.
