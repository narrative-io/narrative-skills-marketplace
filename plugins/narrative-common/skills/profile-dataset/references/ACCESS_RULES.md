# Profiling an access rule

Access rules behave like datasets as far as NQL is concerned — same
column references, same query syntax. But their `describe` response is
shaped differently, and that changes which tiers of the coverage ladder
are available.

## Tool substitution

| Operation | Dataset | Access rule |
| --- | --- | --- |
| Describe | `narrative_datasets_describe(dataset_ids: [<id>], include: ["metadata","schema","stats","sample"])` | `narrative_access_rules_describe(access_rule_ids: [<id>], include: ["metadata","schema","mappings","nql"])` |
| `include` slots | `metadata, schema, mappings, stats, sample, …` | `metadata, schema, mappings, nql, collaborators, pricing` — **no `stats`, no `sample`** |
| Column stats | `narrative_dataset_get_column_stats` | not available |
| Stats config / recalculate | available | not available |
| Sample rows | bundled in `describe(include: ["sample"])` | fetch via a `SELECT … LIMIT 50` through `/write-nql` |

## NQL reference pattern

- **Dataset**: `company_data."<id>"` (or the table name surfaced by
  describe).
- **Access rule**: `<owning_company_slug>.<rule_name>` (e.g.
  `acme.my_rule`).

Record the fully qualified reference and use it for any tier-3 query.

## What this means for the coverage ladder

- **Tier 1** is partial: you get schema + mappings, but **no bundled
  stats and no sample.** There's no `null_rate` / `distinct_count` /
  `top_values` to read for free.
- **Tier 2 is unavailable.** You cannot configure or recalculate stats
  on an access rule. Skip it entirely.
- **Tier 3 is the path for every quantitative measure.** Because tiers 1
  and 2 give nothing numeric, any coverage/cardinality/distribution
  number comes from a cheap `/write-nql` aggregate, under the same
  efficiency contract as for datasets (`COVERAGE_LADDER.md`). Gate it
  unless `--allow-nql` was passed.

Typical tier-3 measures for an AR profile:

- **Shape sample** — `SELECT <focus cols> FROM <slug>.<rule> LIMIT 50`,
  then run `INTERPRETATION.md`'s shape inference on the rows.
- **Coverage** — `SELECT COUNT(1) AS rows, COUNT(<col>) AS non_null,
  APPROX_COUNT_DISTINCT(<col>) AS approx_distinct FROM <slug>.<rule>`.
  `null_rate = 1 - non_null/rows`.
- **Top values** — `SELECT <col>, COUNT(1) AS n FROM <slug>.<rule>
  GROUP BY <col> ORDER BY n DESC LIMIT 25`.

Set `measure_source: "custom_nql"` on every column measured this way,
and note in the rendered profile that an access rule was profiled via
NQL aggregates (no native stats exist for it).

Do this only for columns in focus — an AR profile that fans out a query
per column on a wide rule is no longer a seconds-scale operation. Batch
coverage measures into one aggregate query where the columns share a
grain.
