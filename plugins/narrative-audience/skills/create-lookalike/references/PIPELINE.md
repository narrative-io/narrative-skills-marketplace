# The look-alike scoring pipeline

The exact stage templates the skill renders, in execution order. These
mirror the generator Lookalike Studio uses (`buildLookalikeWorkflow`);
substitute names and attributes, do not redesign the statistics.

## Naming and quoting conventions

- **`{prefix}`** — the audience name, slugified: lowercase, trimmed,
  `[^\w\s-]` characters dropped, runs of whitespace/`_`/`-` collapsed
  to a single `_`, leading/trailing `_` stripped. Example:
  `"Premium Look-Alikes (Q3)"` → `premium_look_alikes_q3`.
- **Identifiers** in NQL are double-quoted, with embedded `"` doubled.
  View references are `company_data."{view_name}"`.
- **String literals** in metadata clauses are single-quoted, with
  embedded `'` doubled.
- **`{alias}`** of an attribute — its field path minus the
  `_rosetta_stone.` prefix, dots replaced by underscores.
  `_rosetta_stone.merchant.name` → `merchant_name`.
- Per-attribute derived columns: `"{alias}"`, `"avg_{alias}"`,
  `"mu_{alias}"`, `"sigma_{alias}"`.

## View names and task names

| Order | Task name | View (`datasetName`) | Mode |
| --- | --- | --- | --- |
| 1 | `createExpandedIdentities` | `{prefix}_expanded_identities` | always |
| 2 | `createExpandedSeedIdentities` | `{prefix}_expanded_seed_ids` | always |
| 3 | `createCanonicalCombos` | `{prefix}_canonical_combos` | has categorical |
| 4 | `createCanonicalIdFeatures` | `{prefix}_canonical_id_features` | has continuous |
| 5 | `createLabeledCombos` | `{prefix}_labeled_combos` | has categorical |
| 6 | `createLabeledIdFeatures` | `{prefix}_labeled_id_features` | has continuous |
| 7 | `createSeedPopCounts` | `{prefix}_seed_pop_counts` | has categorical |
| 8 | `createSeedStats` | `{prefix}_seed_stats` | has continuous |
| 9 | `createAttDistributions` | `{prefix}_att_distributions` | has categorical |
| 10 | `createAttCardinalities` | `{prefix}_att_cardinalities` | has categorical |
| 11 | `createAttWeights` | `{prefix}_att_weights` | has categorical |
| 12 | `createScoredCandidateRows` | `{prefix}_scored_candidate_rows` | has categorical |
| 13 | `createScoredCandidates` | `{prefix}_scored_candidates` | always (3 forms) |
| 14 | `createFinalOutput` | `{prefix}` | always |
| 15 | `mapOutputIdentity` | (mapping task, not a view) | if `unique_id` resolved |

Mode is determined by the approved feature set: **categorical-only**
(no long/double features), **continuous-only** (no categorical
features), or **mixed**. Skip every stage whose mode column doesn't
match.

## Metadata clauses

Every intermediate view (stages 1–13) carries:

```
DESCRIPTION = 'Intermediate checkpoint of the {prefix} look-alike scoring pipeline.'
TAGS = ( '_nio_lookalike_intermediate' )
```

The final view (stage 14) carries the audience's own metadata instead:

```
DISPLAY_NAME = '{display name}'
DESCRIPTION = '{description}'
TAGS = ( {user tags…,} '_nio_audience', '_nio_audience_studio', '_nio_lookalike', '{wizard-state tag}' )
```

The wizard-state tag is the `_nio_lookalike_serialization=<base64>`
string from `scripts/lookalike_state_tag.py` (omitted on
`--no-state-tag` or when the script can't run). Tags are applied
inside the `CREATE MATERIALIZED VIEW` so they survive even if the
session ends before the async build completes.

Metadata lines sit between the view name and `AS`:

```sql
CREATE MATERIALIZED VIEW {datasetName}
{metadata lines}
AS
{stage NQL}
```

## Stage 1–2 — identity expansion

Unpivots each source into long `(id_type, id)` form, one `UNION ALL`
branch per join-key attribute. The population branch also projects
every feature attribute; the seed branch projects ids only.

Per join-key attribute (alias `{jk_alias}`, extraction expression
`{jk_expr}` — see `CLASSIFICATION.md`):

```sql
SELECT
  '{jk_alias}' AS "id_type",
  CAST({jk_expr} AS VARCHAR) AS "id",
  {feature_expr_1} AS "{feature_alias_1}",
  {feature_expr_2} AS "{feature_alias_2}"
FROM company_data."{source_dataset}"
WHERE {jk_expr} IS NOT NULL AND CAST({jk_expr} AS VARCHAR) <> ''
```

Branches joined with `UNION ALL`. Stage 1 reads the population
dataset with the feature selects; stage 2 reads the seed dataset with
no feature selects. These two stages are the only ones referencing
real catalog datasets — validate both with `narrative_nql_validate`.

## Stage 3 — canonical combos (categorical)

One row per identity per distinct categorical value combination, with
`id_weight` = the fraction of that identity's rows carrying the combo
(so multi-row identities aren't overcounted):

```sql
SELECT
  "id_type",
  "id",
  "{cat_1}", "{cat_2}", …,
  CAST(COUNT(1) AS DOUBLE) / SUM(COUNT(1)) OVER (PARTITION BY "id_type", "id") AS "id_weight"
FROM company_data."{prefix}_expanded_identities"
GROUP BY "id_type", "id", "{cat_1}", "{cat_2}", …
```

## Stage 4 — canonical id features (continuous)

One row per identity, each continuous feature averaged:

```sql
SELECT
  "id_type",
  "id",
  AVG("{cont_1}") AS "avg_{cont_1}", …
FROM company_data."{prefix}_expanded_identities"
GROUP BY "id_type", "id"
```

## Stages 5–6 — seed labeling

Marks each row with `is_seed` by left-joining the distinct seed ids.
Stage 5 labels combos (alias `c`, projecting the categorical columns
and `c."id_weight"`); stage 6 labels id features (alias `f`,
projecting the `avg_` columns). Template (stage 5 shown):

```sql
SELECT
  c."id_type",
  c."id",
  c."{cat_1}", …, c."id_weight",
  CASE WHEN s."id" IS NOT NULL THEN 1 ELSE 0 END AS "is_seed"
FROM company_data."{prefix}_canonical_combos" c
LEFT JOIN (SELECT DISTINCT "id_type", "id" FROM company_data."{prefix}_expanded_seed_ids") s
  ON c."id_type" = s."id_type" AND c."id" = s."id"
```

This join is why the **shared-identity requirement** exists: seed and
population only match where their join-key *aliases* (the `id_type`
strings) and values coincide.

## Stage 7 — seed/pop totals (categorical)

```sql
SELECT
  SUM(CASE WHEN "is_seed" = 1 THEN "id_weight" ELSE 0 END) AS "seed_total",
  SUM(CASE WHEN "is_seed" = 0 THEN "id_weight" ELSE 0 END) AS "pop_total"
FROM company_data."{prefix}_labeled_combos"
```

## Stage 8 — seed stats (continuous)

Mean and stddev of each continuous feature over seed members only;
`NULLIF(STDDEV(…), 0)` so a constant feature yields NULL sigma (its
Gaussian term then contributes 0, not a division error):

```sql
SELECT
  AVG("avg_{cont_1}") AS "mu_{cont_1}",
  NULLIF(STDDEV("avg_{cont_1}"), 0) AS "sigma_{cont_1}", …
FROM company_data."{prefix}_labeled_id_features"
WHERE "is_seed" = 1
```

## Stage 9 — attribute value distributions (categorical)

One `UNION ALL` branch per categorical feature; NULL values excluded:

```sql
SELECT "attr_name", "attr_value", "seed_cnt", "pop_cnt"
FROM (
  SELECT
    '{cat_1}' AS "attr_name",
    CAST("{cat_1}" AS VARCHAR) AS "attr_value",
    SUM(CASE WHEN "is_seed" = 1 THEN "id_weight" ELSE 0 END) AS "seed_cnt",
    SUM(CASE WHEN "is_seed" = 0 THEN "id_weight" ELSE 0 END) AS "pop_cnt"
  FROM company_data."{prefix}_labeled_combos"
  WHERE "{cat_1}" IS NOT NULL
  GROUP BY "{cat_1}"
  UNION ALL
  …
)
```

## Stage 10 — attribute cardinalities (categorical)

```sql
SELECT
  "attr_name",
  CAST(COUNT(DISTINCT "attr_value") AS DOUBLE) AS "k"
FROM company_data."{prefix}_att_distributions"
GROUP BY "attr_name"
```

## Stage 11 — attribute weights (categorical)

Laplace-smoothed log-likelihood ratio per attribute value, clamped to
±3 so no single value dominates; values seen fewer than 5 times total
are dropped:

```sql
SELECT
  d."attr_name",
  d."attr_value",
  GREATEST(LEAST(
    LN(
      (d."seed_cnt" + 1.0) / (t."seed_total" + c."k")
    ) - LN(
      (d."pop_cnt" + 1.0) / (t."pop_total" + c."k")
    ),
    3.0), -3.0) AS "weight"
FROM company_data."{prefix}_att_distributions" d
CROSS JOIN company_data."{prefix}_seed_pop_counts" t
JOIN company_data."{prefix}_att_cardinalities" c
  ON d."attr_name" = c."attr_name"
WHERE d."seed_cnt" + d."pop_cnt" >= 5
```

## Stage 12 — scored candidate rows (categorical)

One `LEFT JOIN` of the weights table per categorical feature (aliases
`w_0`, `w_1`, …, in feature order); seed rows excluded:

```sql
SELECT
  r."id_type",
  r."id",
  r."id_weight",
  COALESCE(w_0."weight", 0) + COALESCE(w_1."weight", 0) + … AS "categorical_score",
  CASE WHEN w_0."weight" IS NOT NULL THEN 1 ELSE 0 END
    + CASE WHEN w_1."weight" IS NOT NULL THEN 1 ELSE 0 END + … AS "non_null_cnt"
FROM company_data."{prefix}_labeled_combos" r
LEFT JOIN company_data."{prefix}_att_weights" w_0
  ON w_0."attr_name" = '{cat_1}' AND w_0."attr_value" = CAST(r."{cat_1}" AS VARCHAR)
LEFT JOIN company_data."{prefix}_att_weights" w_1
  ON w_1."attr_name" = '{cat_2}' AND w_1."attr_value" = CAST(r."{cat_2}" AS VARCHAR)
…
WHERE r."is_seed" = 0
```

## Stage 13 — scored candidates (three forms)

**Categorical-only:** weighted average of per-combo scores, normalized
by the weighted count of non-null weight matches:

```sql
SELECT
  "id_type",
  "id",
  SUM("id_weight" * "categorical_score") / NULLIF(SUM("id_weight" * CAST("non_null_cnt" AS DOUBLE)) / NULLIF(SUM("id_weight"), 0), 0) AS "score"
FROM company_data."{prefix}_scored_candidate_rows"
GROUP BY "id_type", "id"
```

**Continuous-only:** sum of Gaussian kernel terms, one per feature:

```sql
SELECT
  f."id_type",
  f."id",
  CASE
      WHEN ss."sigma_{cont_1}" IS NULL THEN 0
      ELSE EXP(-0.5 * POWER((f."avg_{cont_1}" - ss."mu_{cont_1}") / ss."sigma_{cont_1}", 2))
    END + … AS "score"
FROM company_data."{prefix}_labeled_id_features" f
CROSS JOIN company_data."{prefix}_seed_stats" ss
WHERE f."is_seed" = 0
```

**Mixed:** the categorical aggregate plus the Gaussian terms, grouped
by identity and the (constant-per-identity) feature/stat columns:

```sql
SELECT
  r."id_type",
  r."id",
  SUM(r."id_weight" * r."categorical_score") / NULLIF(SUM(r."id_weight" * CAST(r."non_null_cnt" AS DOUBLE)) / NULLIF(SUM(r."id_weight"), 0), 0)
    + CASE
      WHEN ss."sigma_{cont_1}" IS NULL THEN 0
      ELSE EXP(-0.5 * POWER((f."avg_{cont_1}" - ss."mu_{cont_1}") / ss."sigma_{cont_1}", 2))
    END
    + … AS "score"
FROM company_data."{prefix}_scored_candidate_rows" r
JOIN company_data."{prefix}_labeled_id_features" f
  ON f."id_type" = r."id_type" AND f."id" = r."id"
CROSS JOIN company_data."{prefix}_seed_stats" ss
WHERE f."is_seed" = 0
GROUP BY r."id_type", r."id", f."avg_{cont_1}", ss."mu_{cont_1}", ss."sigma_{cont_1}", …
```

## Stage 14 — final output

The final view IS the audience dataset, so its `datasetName` is the
bare `{prefix}` and it carries the audience metadata clause.

Base select — sigmoid-transform the raw score into a probability, and
defensively re-exclude the seed (scored candidates are already
`is_seed = 0`, but the exclusion must hold regardless of upstream
changes):

```sql
SELECT sc."id_type", sc."id", 1.0 / (1.0 + EXP(-sc."score")) AS "score"
FROM company_data."{prefix}_scored_candidates" sc
WHERE NOT EXISTS (SELECT 1 FROM company_data."{prefix}_expanded_seed_ids" s WHERE s."id_type" = sc."id_type" AND s."id" = sc."id")
```

Then by output mode:

- **`size`** — append `ORDER BY sc."score" DESC` and `LIMIT {N}`.
- **`score`** — clamp the user's threshold `p` to [0.001, 0.999],
  convert to log-odds `ln(p / (1 - p))`, and add
  `AND sc."score" >= {log_odds}` to the WHERE clause (the comparison
  happens in raw-score space; the sigmoid in the SELECT maps it back
  to probability). No ORDER BY / LIMIT.

If **include seed** is on, wrap the base select and union the seed
back in at score 1.0:

```sql
SELECT "l"."id_type", "l"."id", "l"."score"
FROM (
  {base select, indented}
) AS "l"
UNION ALL
SELECT s."id_type", s."id", 1.0 AS "score"
FROM (SELECT DISTINCT "id_type", "id" FROM company_data."{prefix}_expanded_seed_ids") s
```

## Stage 15 — output identity mapping task

Appended only when a Rosetta Stone attribute named `unique_id` was
resolved (`narrative_attributes_search`). Maps the output's `id`
column to that attribute's `value` property so the audience carries a
join key — required for connector delivery, and what makes the output
valid as a future look-alike seed:

```yaml
  - mapOutputIdentity:
      call: CreateRosettaStoneMappingsIfNotExist
      with:
        datasetName: {prefix}
        mappings:
          - attributeId: {unique_id attribute id}
            mapping:
              type: object_mapping
              propertyMappings:
                - path: value
                  expression: '"id"'
```

## Workflow YAML envelope

```yaml
document:
  dsl: '1.0.0'
  namespace: narrativeio
  name: lookalike-{prefix}
  version: '1.0.0'
do:
  - {task name}:
      call: CreateMaterializedViewIfNotExists
      with:
        nql: |
          CREATE MATERIALIZED VIEW {datasetName}
          {metadata lines}
          AS
          {stage NQL}
  - …one entry per stage, in order…
  - {mapOutputIdentity task, if resolved}
```

Tasks run sequentially and fail-fast. The full `CREATE MATERIALIZED
VIEW` statement goes in the `nql` block scalar — the view name inside
the NQL is the only place the output dataset name is declared. See
[`assets/example-workflow.yaml`](../assets/example-workflow.yaml) for
a fully rendered categorical-only example.

## Known modeling limitation

Correlated categorical features (e.g. `country` and `currency`,
`postal_code` and `state`) double-count the same signal under the
Naive-Bayes independence assumption. The pipeline does not yet detect
this; mitigate it at feature-selection time (phase 3) by excluding
one attribute from each obviously correlated pair.
