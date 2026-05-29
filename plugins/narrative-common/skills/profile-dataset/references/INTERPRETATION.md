# Interpretation heuristics and quality-flag thresholds

How to turn raw stats + sample rows into the per-column `inferred_shape`
and the `flags` list. This is the judgment the skill owns — the raw
tools return numbers; the meaning lives here. Infer only from observed
values, never from a column name in isolation.

## Reading the stats

| Stat | What it tells you | Reading |
| --- | --- | --- |
| `null_rate` | Fill / coverage | >0.30 → `high_null_rate` flag. A column the caller wants to join on with a high null rate will silently drop rows. |
| `distinct_count` | Cardinality | `1` → `constant_column`. `2`–small with a full `top_values` → enum. Near `row_count` → identifier / free-text. |
| `approx_distinct` | Cardinality at scale | Present when `APPROX_COUNT_DISTINCT` was used (high-cardinality columns). Treat as "≈", note the approximation in the render. |
| `top_values` | Distribution | A few values covering most rows → enum or skewed categorical. One value at ~100% → effectively constant. |
| `min` / `max` | Range | Numeric range, timestamp span, or lexical bounds — clue to timestamps, ages, identifiers, ZIP ranges. |

## Inferring column shape from sample rows

Read actual sampled values; match the first that fits. Record as
`inferred_shape`.

| Observed shape | `inferred_shape` |
| --- | --- |
| Contains `@`, looks like `local@domain.tld` | `email` |
| 32 hex chars | `hash:md5` |
| 40 hex chars | `hash:sha1` |
| 64 hex chars | `hash:sha256` |
| `+` then 8–15 digits, or all-digit 10–15 | `phone:e164` |
| `YYYY-MM-DD[THH:MM:SS]` | `timestamp:iso` |
| 5 digits (optionally `-####`) | `zip:us` |
| Small fixed value set, often lowercase tokens | `enum:<semantic>` (e.g. `enum:id_type`) |
| Literal type discriminator (`'email'`, `'sha256_email'`, `'phone'`) | `enum:type_discriminator` |
| Near-unique opaque string/int | `identifier` |
| Mixed free text | `freetext` |
| Couldn't tell from the sample | `unknown` |

When a column is a Rosetta-Stone id-type column (e.g.
`_rosetta_stone.graph_edge.target_id_type`), its `top_values` *are* the
identifier-type coverage downstream skills consume — surface them even
when the shape is just `enum:id_type`.

## Quality-flag thresholds

Emit a flag only when the threshold trips; attach it to the column (or
to the dataset for dataset-wide flags). Each flag carries a one-line
`detail`.

| `kind` | Trigger | `detail` example |
| --- | --- | --- |
| `high_null_rate` | `null_rate > 0.30` | "61% null — joins on this column drop most rows." |
| `constant_column` | `distinct_count == 1` | "Single value across all rows." |
| `single_value_enum` | enum-shaped, one value ≈100% of `top_values` | "Effectively constant despite enum shape." |
| `suspected_pii_in_clear` | `inferred_shape` ∈ {`email`, `phone:e164`} and **not** a hash | "Plaintext email present; expected hashed." |
| `stale_stats` | stats snapshot older than current snapshot | "Stats computed 14 days / N snapshots ago." |
| `missing_stats` | no stats and recalc declined/unavailable | "No stats; profiled from sample only." |
| `histogram_truncated` | histogram hit its `max_bins` overflow | "Distribution truncated at 100 bins." |

`suspected_pii_in_clear` is descriptive, not an alarm — report it and
move on. The caller decides whether plaintext PII is acceptable.

## Degraded reads

- **Sample only** (`stats_freshness: "sample_only"`): you have no
  `null_rate` / `distinct_count`. Infer shape from the sample; leave
  numeric fields `null`; set every focused column's
  `measure_source: "sample_only"`; flag `missing_stats` once at the
  dataset level.
- **Histogram absent** but `top_values` present: still infer enum shape
  from `top_values`; just don't claim a full distribution.
