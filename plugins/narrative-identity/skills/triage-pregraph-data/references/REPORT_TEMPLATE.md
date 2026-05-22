# Audit Report Template

Verbatim markdown skeleton for the Phase 7 audit report. Fill in the
headings + tables; the template handles structure. Order findings
**by severity (rows / edges / entities affected, descending)** per
the user's explicit ask.

The "Recommended clean-view NQL" block is filled in by Phase 8 —
leave it as a placeholder when drafting Phase 7, and replace it with
either the validated `CREATE MATERIALIZED VIEW` query or the
"no materialization required" note from Phase 8.

````markdown
# Pre-graph DQ audit: <source>

## Audit framing
- Source: `<name>` (`<id>`, `dataset` | `access_rule`)
- NQL reference: `<company_data.<table>>` or `<owning_company_slug>.<rule_name>`
- Entity type: `<type>`
- Identifier columns audited: `<list>`
- Row count (pre-filter): `<N>`
- Distinct entities (pre-filter): `<N>`
- What this audit did NOT do: `<scope notes>`

## Headline
- Hypotheses tested: `<N>`
- Confirmed issues: `<N>`
- Disproven hypotheses: `<N>`
- Recommended filters: `<N>`
- Total rows recommended for removal: `<N>` (`<pct>`%)
- Estimated edges removed: `<N>`
- Largest hub component prevented: ~`<N>` entities

## Findings (ordered by severity, descending)

### Finding 1 — <one-line title> [SEVERITY: high|medium|low]
- **Hypothesis**: <falsifiable claim from Phase 3>
- **Query** (purpose, source + grain, filters, group-by, measures, validation):
  <plain-English brief; the actual SQL/NQL lives in the query-writer's output>
- **Result**: <numbers from Phase 5>
- **Filter**: <expression, before/after counts, rationale tied to result>

### Finding 2 — …

### Disproven hypotheses (kept for the record)
- **H<n>**: <claim>. **Result**: not supported (<evidence>). **No filter proposed.**

## Recommended clean-view NQL
<filled in by Phase 8 — either the validated CREATE MATERIALIZED VIEW
query, or the "no materialization required" note when the audit found
no issues>
````

## Phase 8 — fill-in for the "Recommended clean-view NQL" section

When Phase 8 produces a validated `CREATE MATERIALIZED VIEW`, replace
the placeholder block above with:

`````markdown
## Recommended clean-view NQL

The query below applies every recommended filter as a single
`CREATE MATERIALIZED VIEW`. **Validated against the dataset's schema
but NOT executed.** Run it (or hand it to whoever runs
materializations) to produce the graph-ready source table; then point
the graph build at the resulting view.

```sql
<verbatim NQL returned by /write-nql>
```

Estimated impact (from Phase 5, deduped across filters):
- Rows kept: `<N>` of `<total>` (`<pct>`%)
- Rows removed: `<N>` (`<pct>`%)
- Distinct entities preserved: `<N>`
- Hub components prevented: `<list of largest>`
`````

When Phase 8 found zero confirmed issues, replace the placeholder
with the literal "source passed" note from Phase 8's branching rule.
