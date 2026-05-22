# Alternate Invocation Modes

This skill ships in five flavors. The default — **hand-off from
`/generate-rosetta-stone-mappings`** — is documented inline in the
main `SKILL.md` (Phases 1–10 run end-to-end with the upstream
generator's payload). This file covers the four situational modes
the skill also supports. Read it when the skill is invoked outside
that default path.

## Hand-off from `/generate-rosetta-stone-mappings`

The default. The parent skill emits its `final_answer`, the user
accepts, and the model invokes this skill with either `--from
<tmp-path>` (after writing the JSON to disk) or `--mappings <json>`
inline. Phases 1 and 4 still run — pinning the company and
re-describing the dataset is cheap insurance against a stale
context.

## Standalone apply from a saved file

The user has a JSON file from a previous generation run.

> `/apply-rosetta-stone-mappings --dataset 4821 --from ./mappings.json`

Phase 5 re-validation is the load-bearing step here — schemas drift,
and a mapping that validated three weeks ago may no longer compile.

## Dry-run preview

The user wants to see the rendered workflow without submitting.

> `/apply-rosetta-stone-mappings --dataset 4821 --from ./mappings.json --dry-run`

Phases 1–7 run; Phase 8 is skipped. The output is the full YAML +
the re-validation summary + the create-call parameters table. No
server-side state changes.

## Re-apply after editing a single expression

The user noticed one mapping had a bad expression, fixed it
manually in the JSON, and wants to push the corrected list. The
task's idempotency does the rest: previously-applied mappings show
as conflicts (no-op), the corrected one shows as created (if the
original was never written) or as a conflict (if it was — see
[`EDGE_CASES.md`](EDGE_CASES.md) for the "already-mapped attribute"
semantics).

## All-or-nothing apply

The user is shipping a tightly coupled set of mappings where a
partial outcome is worse than none.

> `/apply-rosetta-stone-mappings --dataset 4821 --from ./mappings.json --no-allow-partial`

Phase 7 renders `allowPartial: false`. Any single failure aborts
the whole task, and the dataset's mapping state remains as it was
before the run.
