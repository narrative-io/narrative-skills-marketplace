# Percentile and distribution summaries

Read when the user's question needs the **shape** of a numeric
distribution — quartiles, deciles, percentile thresholds, long-tail
characterization, or "how skewed is X."

## Why this is its own document

NQL on the Snowflake data plane has no working percentile function at
the moment:

- `APPROX_PERCENTILE(col, p)` returns HTTP 422 *"No match found for
  function signature"* — the function is not registered on the engine.
- `PERCENTILE_CONT(p) WITHIN GROUP (ORDER BY col)` **validates** but
  returns HTTP 500 from `narrative_nql_run`, in both `CREATE MATERIALIZED
  VIEW` and `EXPLAIN` forms.

Multiple agents have independently re-invented the workaround. This
document is the canonical pattern so they don't have to.

## Default pattern — bucketed counts

For any "how is X distributed" question, summarize with a small set of
thresholds that cover the distribution shape. One materialized view,
one row of output, interpretable without statistical training, and no
percentile function required.

```sql
CREATE MATERIALIZED VIEW "wn_<slug>_degree_dist_<yyyymmddhhmm>"
EXPIRE = 'P1D'
AS
SELECT
  COUNT(1)                                          AS total_entities,
  SUM(CASE WHEN user_degree >= 2     THEN 1 ELSE 0 END) AS degree_ge_2,
  SUM(CASE WHEN user_degree >= 5     THEN 1 ELSE 0 END) AS degree_ge_5,
  SUM(CASE WHEN user_degree >= 10    THEN 1 ELSE 0 END) AS degree_ge_10,
  SUM(CASE WHEN user_degree >= 25    THEN 1 ELSE 0 END) AS degree_ge_25,
  SUM(CASE WHEN user_degree >= 100   THEN 1 ELSE 0 END) AS degree_ge_100,
  SUM(CASE WHEN user_degree >= 1000  THEN 1 ELSE 0 END) AS degree_ge_1000,
  MAX(user_degree)                                  AS max_degree,
  AVG(CAST(user_degree AS double))                  AS mean_degree
FROM company_data.<source_view>
```

**Choosing thresholds.** Pick 5–8 thresholds that span the expected
range. A common ladder for unbounded long-tail measures is
`2, 5, 10, 25, 100, 500, 1000`; for bounded ratios use
`0.1, 0.25, 0.5, 0.75, 0.9, 0.99`. Always include `MAX` and `AVG`
alongside so the reader can sanity-check the buckets.

**Interpretation in plain English.** "Of N total entities, 5% have
degree ≥ 10, 0.1% have degree ≥ 1000, the max is 4.2M, and the mean
is 17 — long-tailed with a few hub-class outliers."

## Exact percentiles by row position

When the user genuinely needs the median or a specific percentile
value (not just bucket counts), derive it by row position. This costs
a full sort over the measure and only makes sense when N is bounded
or the source is already aggregated.

```sql
CREATE MATERIALIZED VIEW "wn_<slug>_quartiles_<yyyymmddhhmm>"
EXPIRE = 'P1D'
AS
WITH ranked AS (
  SELECT
    user_degree,
    ROW_NUMBER() OVER (ORDER BY user_degree) AS rn,
    COUNT(1)    OVER ()                       AS n
  FROM company_data.<source_view>
)
SELECT
  MAX(CASE WHEN rn = CAST(n * 0.25 AS long) THEN user_degree END) AS p25,
  MAX(CASE WHEN rn = CAST(n * 0.50 AS long) THEN user_degree END) AS p50,
  MAX(CASE WHEN rn = CAST(n * 0.75 AS long) THEN user_degree END) AS p75,
  MAX(CASE WHEN rn = CAST(n * 0.90 AS long) THEN user_degree END) AS p90,
  MAX(CASE WHEN rn = CAST(n * 0.99 AS long) THEN user_degree END) AS p99
FROM ranked
```

Caveats to mention in the plain-English explanation:

- Sort cost scales with `N log N`. For >100M rows this is expensive;
  prefer the bucketed-count pattern unless the user has explicitly
  asked for an exact median.
- The row-position formula gives the *value at the percentile-th
  ordered position*, not a `PERCENTILE_CONT`-style interpolated value.
  For audit purposes the two agree; for textbook stats they don't.

## When to revisit

If `APPROX_PERCENTILE` or `PERCENTILE_CONT` starts working on the
Snowflake data plane (test with a tiny `EXPLAIN APPROX_PERCENTILE(col,
0.5) FROM …` against any small dataset), delete this document and
collapse the gotcha back into the syntax-essentials snippet.
