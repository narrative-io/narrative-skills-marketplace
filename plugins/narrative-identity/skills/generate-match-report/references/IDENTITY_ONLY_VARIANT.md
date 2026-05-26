# Identity-only variant

When the user opts out of enrichment in Phase 5 (or passes
`--no-enrichment`), the rendered workflow YAML needs surgery. This
reference describes the exact diffs against `assets/workflow.yaml.tmpl`.

## What to drop

From the macro-substituted YAML:

- **The entire `step_4_match_enriched` block.** Step 4 is the enrich
  side of the join; with no enrichment AR, there's nothing to attach.
- **The step-5 CTEs that reference step 4:**
  - `match_attribute_unnest`
  - `match_attribute_counts`
  - `match_attribute_ranked`
  - `match_attribute_top10`
  - `match_attribute_freq`
  - `match_attribute_results`
  - `match_attribute_type_totals`
  - `match_attribute_coverage`
- **The final `UNION ALL` lines** for `match_attribute_results` and
  `match_attribute_coverage` in the step-5 output assembly.

## What stays

Everything else in step 5 — identifier-counts, the `kpi_*` family,
and the `customer_*` / `match_totals` / `supplier_*` aggregations —
is still meaningful in identity-only mode. The report UI handles
missing `match_attribute_*` rows gracefully.
