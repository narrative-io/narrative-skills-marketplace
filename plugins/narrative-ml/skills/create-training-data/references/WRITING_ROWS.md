# Getting agent-written rows into a dataset

Read before phase 7. The synthetic rows are written in the
conversation, so something has to carry them into the platform. There
is no upload step and no staging file: the rows travel as SQL string
literals inside statements the platform executes.

## Why there is no INSERT here

`INSERT` cannot target a materialized view, and a materialized view is
the only thing NQL creates. The platform rejects the combination
identically at validate and at execute:

```
Invalid Target Dataset (400)
Target '<name>' must be a regular dataset; views, materialized views,
access rules, rosetta_stone, subscription datasets, and external
datasets are not supported.
```

That closes the whole append-based family of approaches: seed a
dataset then `INSERT` into it, `ExecuteDml` chunks in a workflow,
`CreateMaterializedViewIfNotExists` followed by appends. None of them
can run, whatever order they are sequenced in.

The rows therefore arrive inside `CREATE` statements.

## The path this skill uses

1. **One part view per chunk**, roughly 500 rows each, built on a
   multi-column `VALUES` constructor
   ([`../assets/templates/02-synthetic-part.sql`](../assets/templates/02-synthetic-part.sql)).
   Each part is temporary: `EXPIRE = 'P1D'` plus `_nio_interactive`.
2. **A union of the parts** into the persistent synthetic half
   ([`../assets/templates/03-synthetic-union.sql`](../assets/templates/03-synthetic-union.sql)).

Each part is independent, so a malformed literal costs one chunk rather
than the set, and the parts can be re-run individually.

## Constructions

| Construction | Status | Used here |
| --- | --- | --- |
| `SELECT t.a, t.b FROM (VALUES ('a','b'), ('c','d')) AS t(x, y)` | Validates and runs | Yes, for every part |
| `WITH s AS (SELECT 'a' AS x, 'b' AS y) SELECT … FROM s` | Validates and runs | Fine for one or two rows; verbose past that |
| `INSERT INTO <materialized view> … VALUES …` | Rejected, validate and execute | No — cannot work |

The multi-column table constructor is the compact form and it is what
the part template uses. Earlier revisions of this skill avoided it on
the grounds that only the single-column form was documented; that
caution was wrong, and the construction it steered toward is the one
that cannot run.

## Chunk sizing

Roughly 500 rows per part.

The limit that matters is not a platform maximum. It is that one
mis-escaped literal fails its whole statement, and finding it in 500
rows is quick where finding it in 5,000 is not. Smaller chunks also
mean a failure part-way through loses less work, since the parts that
already ran stay materialized.

Each part of ~500 rows renders to roughly 20KB of SQL. That is the real
constraint on chunk size in an agent harness: the statement has to be
authored into a tool call, so a whole synthetic set of a few thousand
rows is a few hundred KB of generated SQL however it is divided.

## Escaping

Every value is a single-quoted SQL string literal, and **two**
characters need escaping. Both are easy to miss in rows that are
deliberately full of typos and punctuation noise:

| Character | Escape | Example |
| --- | --- | --- |
| Apostrophe | double it | `'O''Brien''s Terrier'` |
| Backslash | double it | `'n\\a'` stores `n\a` |

The backslash is the one that bites quietly. It is an escape character
inside the literal, so a raw `'n\a'` is read as an escape sequence and
the stored value is not the value that was written — no error, just a
row that says something other than what the generator intended. Junk
values written for a catch-all class (`n/a`, `n\a`, `-`, `??`) are
exactly where this shows up.

Scan each chunk for both characters before submitting. A generator that
emits these rows should escape them at the point of emission rather
than relying on the scan.

## Re-running

`CREATE MATERIALIZED VIEW` against a name that **already exists** is a
silent no-op: the run reports `completed` in about two seconds,
enqueues no job, and leaves the existing rows in place. `WRITE_MODE =
'overwrite'` does not change this.

That failure mode is worse than an error, because the run history shows
green and the stale data looks fresh. Two habits protect against it:

- **Use a new name for every rebuild.** Do not reuse the name of a view
  you are trying to replace.
- **Read the row count off the job result, not the run status.** A
  completed run with no `materialize-view` job did nothing. The job's
  `result.row_stats.inserted_rows` is the number that tells the truth.

## What this skill does not use

**The file upload API.** `POST /uploads` and the dataset-files endpoints
are the platform's bulk ingestion path, and for hundreds of thousands of
rows they are the right answer. They have no MCP tool, so reaching them
means hand-rolled authentication inside the skill. Synthetic training
sets are thousands of rows at most, which chunked `CREATE` handles.
