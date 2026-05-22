# Access Rules — substitutions and NQL delta

This reference consolidates every place where auditing an **access
rule** differs from auditing a **dataset**. Access rules look, act,
and feel like datasets as far as NQL is concerned: same column
references in `SELECT`, same query syntax, same validation behavior.
From Phase 3 (hypothesis generation) onward, treat them identically.
The differences are confined to Phase 2 (resolution / metadata fetch)
and to how the source is referenced in NQL.

## How to tell which one you have

- The user passed `--dataset <id>` → it's a dataset.
- The user passed `--access-rule <id>` → it's an access rule.
- Neither flag, and the source type is ambiguous from context → ask
  **one** `AskUserQuestion` to disambiguate before searching.

## Tool substitutions

| Operation | Dataset | Access rule |
| --- | --- | --- |
| Search | `narrative_datasets_search` | `narrative_access_rules_search` |
| Describe | `narrative_datasets_describe` | `narrative_access_rules_describe` |
| Describe `include` slots available | `metadata, schema, mappings, stats, sample, …` | `metadata, schema, mappings, nql, collaborators, pricing` (no `stats`, no `sample`) |
| Column stats | `narrative_dataset_get_column_stats` | not directly available — derive via a small NQL aggregate if needed |
| Sample rows | returned by `describe(include: ["sample"])` | fetch a `SELECT … LIMIT 50` via `/write-nql` if needed |

## NQL reference pattern

- **Dataset**: `company_data.<table>` (or the per-dataset convention
  surfaced by `describe`).
- **Access rule**: `<owning_company_slug>.<rule_name>` (e.g.,
  `acme.my_rule`).

Record the fully qualified reference at the end of Phase 2 and use it
as `<source>` for every downstream phase.

## Phase 2 invocations

**Dataset:**

```
narrative_datasets_search(search_term: "<phrase>")
narrative_datasets_describe(
  dataset_ids: [<id>],
  include: ["metadata", "schema", "sample", "stats"]
)
```

**Access rule:**

```
narrative_access_rules_search(search_term: "<phrase>")
narrative_access_rules_describe(
  access_rule_ids: [<id>],
  include: ["metadata", "schema", "mappings", "nql"]
)
```

## Sample / stats workaround for access rules

Access-rule describe does not return `sample` or `stats`. If you need
either to ground a hypothesis, fetch them via a small NQL query
through `/write-nql` against the rule's NQL reference
(`<owning_company_slug>.<rule_name>`):

- **Sample** — `SELECT <cols> FROM <slug>.<rule> LIMIT 50`.
- **Ad-hoc stats** — `SELECT COUNT(DISTINCT col), APPROX_QUANTILES(…)
  FROM <slug>.<rule>`.

Do this only when a hypothesis genuinely needs it; the schema +
mappings + the rule's own NQL definition are usually enough framing.

## Phase 8 clean-view NQL — `/write-nql` invocation delta

The base prompt body lives in
[`CLEAN_VIEW_NQL_PROMPT.md`](CLEAN_VIEW_NQL_PROMPT.md). The only
deltas for an access rule are:

1. **Drop the `--dataset <id>` flag.** Invoke `/write-nql --no-explain`
   (no dataset binding). The fully qualified reference in the brief
   body drives resolution.
2. **Source reference** in the brief body: use the access rule
   `<owning_company_slug>.<rule_name>` instead of
   `company_data.<table>`.
3. **Suggested view name**: `<rule_name>_graph_clean_<yyyymmdd>`
   (use the rule name, not a dataset table name).

Everything else — projected columns, keep-predicates, EXPIRE policy,
validate-only mode — is identical.
