# Edge cases and gotchas

Known failure modes, in the order you're likely to hit them. Each one
cost someone hours; several produce a *silently* wrong result rather
than an error, which is why they're written down.

---

## A pending cache reports as "not found"

**The single most expensive gotcha in this workflow.**

Creating a `cached_mapping` auto-provisions a correctly-shaped cache
dataset — right schema, right enum, tagged as a cache, no query
definition. But it lands in **`status: "pending"`**, and a pending
dataset has **no physical table** on the Snowflake data plane.

Until it is activated:

| Attempt | Error |
|---|---|
| `INSERT INTO company_data.<cache_name> ...` | `Invalid Target Dataset — Dataset '<NAME>' not found` |
| Reading the mapped attribute | `Table 'company_data.<cache_id>' not found` |

Both say **"not found"** for a dataset that exists and is returned by
the datasets API — which sends you hunting for a naming, quoting, or
reference-form problem. It is none of those. It is lifecycle.

```bash
curl --request PUT "https://api.narrative.io/datasets/<CACHE_ID>/activate" \
  --header "Authorization: Bearer $NIO_API_TOKEN"
```

Ruled out along the way, so you don't repeat it: referencing by name vs.
id (fails identically, and the error echoes the name back uppercased),
waiting ~12 minutes for propagation, and dataset registration (search
returns it, correctly tagged, indistinguishable from a working cache).
A byte-identical INSERT validates against an active cache and fails
against a pending one — the status is the only variable.

**Rule of thumb: when a dataset that clearly exists reports as "not
found," check its status before you check your SQL.**

Note the two states the failure modes differ across, because they want
different treatment in any UI or status report:

- A per-row **miss** against an *active* cache returns NULL. Sparse, not
  broken. This is the normal steady state while a cache fills.
- A ***pending*** cache makes every query touching the attribute fail to
  compile. That is a broken attribute, not a sparse one.

Tracked in SC-63910 (auto-activate on mapping creation, plus fixing the
misleading error). When that ships, the activation phase can be deleted
from this skill.

---

## `AI_COMPLETE` will not accept an expression as its prompt

```sql
-- fails validation: Invalid UDF(ai_complete) call: '' prompt is invalid
AI_COMPLETE('openai-gpt-5', CONCAT('...', t.input_0), '{"temperature":0}', '{}', FALSE)

-- build the prompt as a column in the preceding CTE, then pass it
llm_in AS (SELECT t.input_0, CONCAT('...', t.input_0) AS ptext FROM ...),
llm    AS (SELECT s.input_0, AI_COMPLETE('openai-gpt-5', s.ptext, '{"temperature":0}', '{}', FALSE) ...)
```

---

## The row cap must be `QUALIFY`, never `LIMIT`

Inside a `CREATE MATERIALIZED VIEW`, an MV stores an *unordered bag* of
rows, so `ORDER BY ... LIMIT N` does not bound what later reads return.
Use `QUALIFY ROW_NUMBER() OVER (ORDER BY input_0) <= <cap>`, and keep
the `ORDER BY` so which rows survive the cap is deterministic.

The default cap is 10,000 per refresh. It is a cost ceiling, not a
correctness feature: capped-out rows come back with `resolver` and
`mapped_value` NULL, which reads as "not answered yet," not as a wrong
answer. They get another chance on the next refresh, because the fill
only inserts non-NULL values.

---

## `NOT IN` against the cache can silently empty the query

Cache columns are nullable by design — the reader's null-safe join
matches a NULL source key against a NULL cache key, so the cache
legitimately stores NULLs. `x NOT IN (SELECT c.input_0 FROM cache c)`
evaluates to UNKNOWN for *every* row as soon as one cache row has a
NULL `input_0`, which yields zero rows with no error.

Use the `LEFT JOIN ... WHERE c.input_0 IS NULL` anti-join instead, in
both the `keys` CTE and the fill INSERT. It has no NULL trap and
extends to multi-column keys by adding `ON` conjuncts.

---

## An INSERT's source may only scan datasets this company owns

The fill INSERT's source is validated: every table it scans must be a
dataset or view owned by the current company. Scanning the cross-company
`narrative.rosetta_stone` table, or a third-party access rule, is
rejected at compile time.

This does **not** forbid `_rosetta_stone.<attribute>` on one of your own
datasets. That reference compiles into a scan of the dataset plus a join
against whatever backs the mapping — all company-owned — so it
validates. (Confirmed empirically, not just read off the validator.)

The reason to keep the waterfall on **raw columns** anyway is
circularity, not permissions: if `keys` resolved the very attribute this
mapping populates, it would compile into a join against the cache the
query is about to fill, and the query would read its own partial output.
Reading a *different*, already-working attribute is legitimate — just be
deliberate about it, since it couples this fill to that mapping's
freshness.

(UPDATE and DELETE are stricter: they may only reference the target
table. That doesn't affect this skill, which only INSERTs.)

---

## The input expression must be byte-identical in three places

The expression appears in the mapping's `input_expressions`, in the
`keys` CTE's `SELECT DISTINCT`, and in the `keys` anti-join's `ON`
clause. If any of them diverge — `LOWER(TRIM(x))` vs. `TRIM(LOWER(x))`,
a stray cast, different whitespace inside a string literal — the cache
never hits and the attribute reads NULL forever, with no error anywhere.
This is the most likely cause of "the workflow succeeded and inserted
rows, but the attribute is still blank."

To diagnose: read the mapping's `input_expressions` and the resolved
view's definition and compare them character by character. Then check
that the cache actually has rows.

---

## Multi-column keys are not concatenated

The cache's schema is `input_0 … input_{n-1}` plus `mapped_value` — one
typed column per input expression, in the mapping's order. The reader
compiles each source-side input expression and joins it null-safely
against the matching `input_i` column.

Published docs stating that the cache exposes `input` / `output` columns,
or that multi-column keys are "concatenated with a separator", are
wrong. Read the cache dataset's schema and write the columns it actually
has.

---

## Object-valued attributes are out of scope for this skill

When the target attribute is an object, `mapped_value` is a struct and
the fill INSERT has to build one per row. Reads work — the compiler
walks into `mapped_value.<property>` — but generating a struct-valued
insert is a different job from generating a scalar one, and no proven
run covers it.

If the user picks an object attribute, say plainly that the waterfall
generator handles scalar enum-valued attributes today, and offer either
a different attribute or a hand-authored fill. Do not guess at struct
construction syntax.

---

## `UNION ALL` in a DML subquery

The demo hit a parse failure trying to combine per-dataset aggregates
into one row with `UNION ALL`, and worked around it by `CROSS JOIN`ing
single-row aggregate subqueries. This does not affect the waterfall
(which needs no union), and `UNION ALL` demonstrably works at the top
level of a `CREATE MATERIALIZED VIEW` — the identity-graph example in
`/create-workflow` relies on it. Treat the observation as scoped to
where it was made rather than as a blanket rule, and validate if you
need one.

---

## `CreateMaterializedViewIfNotExists` no-ops on re-runs

It returns `created: false` and does nothing when the target dataset
already exists. A fill workflow built from create + insert alone would
therefore INSERT from a stale view on every run after the first, which
is why the emitted workflow has a `RefreshMaterializedView` task between
them. To force a full rebuild instead, delete the resolved dataset and
re-run.

On the first run, `Create` performs the initial materialization, so the
`Refresh` behind it is a near no-op incremental pass. The tier costs are
therefore paid once, not twice — but MV refresh semantics for a query
containing `AI_COMPLETE` over a `SELECT DISTINCT` of the whole source
have not been verified across multiple scheduled refreshes. Watch the
first two or three runs' job records before trusting the cadence.

---

## A cache is a table, not a materialized view

`INSERT` into an MV is rejected: an MV carries a query definition, while
a cache has none and is a writable append-mode table. Let the mapping
auto-provision the cache; never hand-build one, and never point a
`cached_mapping` at an MV. (An early attempt at this demo created an MV
named like a cache, and the fill failed until it was replaced.)

---

## Cached mappings have platform-level restrictions

- Company-scoped create only. Global mapping endpoints reject them.
- Forbidden on the opt-out pipeline's attributes:
  `data_privacy_request_identifier`, `unique_id`, `identifier_relation`.
- No materialized fields on top of a cached mapping, and an existing
  mapping cannot be converted to a cached mapping while an active
  materialized field references it.
- `DELETE` statements whose `WHERE` clause references a cached-mapping-
  backed attribute are unsupported.
- Mapping preview returns no records — there is no per-source-row
  preview, because the lookup resolves at query time. Don't offer a
  preview and don't treat the empty response as a failure.
