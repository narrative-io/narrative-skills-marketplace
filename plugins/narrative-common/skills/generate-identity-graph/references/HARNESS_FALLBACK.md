# Harness fallbacks

What to do when the MCP servers this skill depends on aren't
available — most commonly `narrative-mcp` itself, occasionally
`narrative-knowledge-base`.

Never silently degrade. If a tool is unavailable, say so explicitly
in the phase-8 summary and reduce confidence accordingly.

## `narrative-mcp` unavailable

This is the bad case — phases 2 through 7 of the main procedure
all depend on it. Recover by switching to a paste-driven flow:

1. **Skip phase 2 entirely.** Ask the user for the company name as
   free text; record it for the `namespace` field. Don't try to
   resolve company IDs.

2. **Replace phase 3** (dataset identification) with a paste prompt.
   For each input dataset, ask the user to paste:

   - Dataset ID
   - Dataset name and short description
   - Whether the dataset is already mapped to the graph-edge
     attribute (yes / no / don't know)

   If the user has API access outside the MCP layer, suggest:

   ```
   curl https://api.narrative.io/datasets/<id>
   ```

   and paste the response — its `mappings[]` array is what phase 4
   would have read.

3. **Phase 4** becomes: trust the user's "is it mapped?" answer or
   the pasted `mappings[]` JSON. There's no way to validate without
   the MCP server.

4. **Skip phase 5 entirely.** Without `narrative-mcp`, the
   `/generate-rosetta-stone-mappings` skill is also degraded — and
   you can't apply mappings anyway. Tell the user any unmapped
   dataset has to be mapped separately before the workflow will run,
   and stop trying to handle them in-band.

5. **Phase 6** (third-party sources) is unchanged — it was already
   user-driven.

6. **Phase 7** still produces the workflow YAML, but **skip the
   `narrative_nql_validate` step** on the `CREATE MATERIALIZED VIEW`
   body. Add a global warning to the summary:

   > "The materialized-view NQL was not server-validated because
   > narrative-mcp was unavailable. Confidence in column names and
   > table references is reduced — please review the YAML carefully
   > before submitting."

7. **Phase 8** is unchanged — still emit the file and submission
   instructions.

Always produce the workflow YAML as the deliverable, even in fallback
mode. The user can submit a manually-vetted file; they can't submit
what they don't have.

## `narrative-knowledge-base` unavailable

This is the mild case — the KB server is only used for optional
research on identity-graph concepts, `LabelConnectedComponents`
parameter calibration, and Rosetta Stone normalization model
questions. The main procedure does not require it.

When unavailable:

- Fall back to the local reference files (`EDGE_CASES.md`, the
  rosetta-stone skill's `EXPRESSION_SYNTAX.md` and `ENUM_HANDLING.md`).
- Note in the phase-8 summary that KB lookups were skipped if any
  user question would normally have warranted one (e.g., the user
  asked "what does `maxDegreeThreshold` actually do" and the local
  references don't fully answer it).
- Do not block the workflow on KB unavailability.

## Partial degradation

If `narrative-mcp` is available but a *specific* tool errors (e.g.,
`narrative_nql_validate` is returning 500s):

- For validation errors: skip validation for that one expression
  and flag it as unvalidated in the summary. Do not block the entire
  workflow on a flaky validate call.
- For dataset describe errors: retry once with a smaller `include`
  list (drop `mappings` and `stats`; keep `metadata` and `schema`).
  If still failing, fall back to asking the user to paste schema
  details for the affected dataset.
- For attribute search errors: ask the user for the graph-edge
  attribute ID directly. They almost always know it (or can pull
  it from a previous successful run).

## Confidence in the output

Workflow YAML emitted in degraded mode is structurally correct but
not server-validated. Always tell the user which steps were
skipped, so they know what to double-check before submission. A
checklist is better than a paragraph:

```
Skipped because narrative-mcp was unavailable:
  • Company-context resolution (namespace was taken from your input)
  • Dataset mapping-status verification
  • Materialized-view NQL validation
  • Identifier-type discovery (source lists came from your input)

Please verify these manually before submitting the workflow.
```
