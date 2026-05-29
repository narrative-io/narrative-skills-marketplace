<!-- AUTO-GENERATED from HARNESS_FALLBACK.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# Harness fallbacks

What to do when the MCP server or downstream skills this audit
depends on aren't available, and when the harness doesn't expose
`AskUserQuestion`.

Never silently degrade. If a tool is unavailable, say so explicitly
in the report and reduce confidence accordingly.

## `narrative-mcp` unavailable (or `--no-schema` was passed)

- Ask the user to paste the relevant table schema (name, grain,
  identifier columns + types + known caveats) and a representative
  sample.
- With that pasted, run Phases 3, 5, 6, 7 normally; substitute
  "imagined query" plain-English drafts in Phase 4 where the brief
  would have gone to `/design-analysis`. Annotate the report:
  "queries not executed against live MCP; the user must run them
  through their query tool and feed results back."
- Never silently skip the evidence-collection step. An audit with
  no numbers is worse than no audit.

## `/design-analysis` unavailable

- This skill cannot run Phase 4 end-to-end without the analyst.
  The separation of concerns is a hard architectural rule, not a
  preference. Stop, surface the dependency, and hand the audit
  framing + hypothesis list to the user as a manual brief they can
  pass to whatever analytical tooling they have. Insist on the
  parallel-execution pattern in that brief — serial execution
  multiplies wall-clock time and erodes the audit's value.

## `/profile-dataset` unavailable (Phase 2)

- Phase 2 normally delegates the base profile (row count, per-column
  coverage, quality flags) to `/profile-dataset`. If that skill isn't
  installed, read it inline: `narrative_datasets_describe(dataset_ids:
  [<id>], include: ["metadata", "schema", "sample", "stats"])` for a
  dataset, or the access-rule substitutions in
  [`ACCESS_RULES.md`](ACCESS_RULES.md). Read `row_count` and the
  per-column null/cardinality stats off that response and continue. The
  audit logic is unchanged — only the source of the base profile differs.

## `/write-nql` unavailable for Phase 8

- Ship the audit findings (Phases 1–7) without the validated NQL
  block. In the "Recommended clean-view NQL" section of the report,
  include the consolidated filter set in plain English plus a draft
  `CREATE MATERIALIZED VIEW` skeleton, and annotate it: "NOT
  validated — `/write-nql` was unreachable. The caller must
  validate before running." Better to ship a clearly unvalidated
  draft than to block the audit's hand-off.

## "AskUserQuestion" not available

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.
