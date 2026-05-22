# Edge cases and gotchas

Read when an input feels off, the workflow validator rejects the
spec, or the run output shows something unexpected.

## Already-mapped attribute IDs are conflicts, not failures

`CreateRosettaStoneMappingsIfNotExist` is idempotent on
`attributeId` per dataset. If the dataset already has a mapping for
`attributeId: 92`, re-submitting it surfaces in `conflictMappings`,
not `failedMappings`. The existing mapping is *not* overwritten —
there is no in-place edit task.

If the user explicitly wants to replace a mapping, the workflow
runtime doesn't support that today. Options to surface:

- Tell the user, then suggest they delete the existing mapping
  via the Narrative Platform UI and re-run this skill.
- If the corrected expression is meaningfully different from the
  existing one, the no-op behavior is genuinely unwanted; do not
  paper over it by claiming the task "succeeded."

## `datasetName` is not the numeric ID

The workflow task takes `datasetName: <alphanumeric+underscore>`,
e.g. `crm_users`. That's the dataset's `name` field, *not* the
numeric `id` field (`4821`). They are usually different — passing
the ID where the name is expected fails the workflow at run time
with "dataset not found", which looks like a wrong-plane error
even though the cause is a name/ID mix-up.

Resolve via `narrative_datasets_describe` and read `metadata.name`
explicitly; never assume the user-typed string is in the right
format.

## camelCase / snake_case drift across the seam

The generator emits `attribute_id` and `property_mappings`. The
workflow task expects `attributeId` and `propertyMappings`. If a
mapping reaches the rendered YAML still in snake_case, the
validator rejects it with a structured error about an unknown
field. The Phase 3 normalization is the only place this is
caught — never bypass it.

If both casings appear in the same entry, prefer the camelCase
value and surface the conflict in the approval gate. That pattern
usually means a hand-merged JSON file mixed sources.

## Stale-schema validation failures

Mappings generated weeks ago can fail Phase 5 re-validation because
the dataset's schema has drifted (columns renamed, dropped, or
retyped). Treat the validator error as ground truth, not the input.
Options to surface:

- Re-run `/generate-rosetta-stone-mappings` against the dataset
  fresh — it will re-resolve column references.
- Drop the failing entries and apply the rest.
- Edit the entry's expression to match the new schema and re-submit.

Never submit a mapping that failed re-validation. The workflow task
accepts whatever you hand it, and an expression referencing a
non-existent column silently produces nulls at refresh time — the
worst possible outcome.

## Single-quote escaping in YAML

YAML strings wrapped in single quotes escape an embedded single
quote by doubling it. NQL string literals are single-quoted. So an
NQL literal `'sha256_email'` becomes the YAML scalar
`'''sha256_email'''`:

```yaml
expression: '''sha256_email'''   # NQL: 'sha256_email'
expression: SHA2(NORMALIZE_EMAIL(email), 256)   # no quoting needed
```

The block scalar form (`|`) is fine for multi-line NQL and dodges
the escape issue entirely:

```yaml
expression: |
  CASE WHEN type = 'email' THEN value ELSE NULL END
```

Watch for: an NQL literal that didn't make it through with its
outer single quotes (e.g., rendered as `sha256_email` unquoted) —
the validator accepts it (it's a column reference) but no such
column exists, and you get a stale-schema-style failure.

## Wrong-plane dataset

The workflow is bound to a single data plane. If the dataset's
`dataPlaneId` and the `--data-plane` flag (or the chosen plane in
Phase 6) differ, the validator may accept the spec but the run
fails with "dataset not found" at execution time.

Phase 6 catches this by comparing the dataset's `dataPlaneId`
against the chosen plane. Never override the comparison silently —
ask the user, or surface the mismatch.

## `allowPartial` trade-off

| Setting | Behavior | Use when |
| --- | --- | --- |
| `true` (default) | Individual failures don't abort the others. `createdMappings` and `failedMappings` are both populated. | Bulk apply where partial success is acceptable (most cases). |
| `false` | Any single failure aborts the whole task. No mappings persist. | Tightly coupled mapping sets where partial state is worse than none — e.g., object_mappings whose `type` literal and `value` expression must both succeed for the data to be queryable. |

If the user passed `--no-allow-partial` and the run reports
`state: failed`, none of the mappings were created. Make this
explicit in the Phase 10 summary — don't show created/conflict
counts that imply partial progress.

## Run polling timeout (Phase 9)

The poll loop is capped at ~12 iterations × ~5 seconds = ~60
seconds. Most mapping runs complete in under 10 seconds, but a
busy plane or a large `mappings[]` array can push past the cap.

If the cap is hit, the run is *still running*, not stuck. Tell
the user the workflow exists at `workflow_id` and they can check
back with:

```
narrative_workflow_runs_list(workflow_id: '<id>')
```

Do not retry the submission — that creates a duplicate workflow.

## The dataset describe doesn't return `dataPlaneId`

Rare, but possible for datasets in unusual provisioning states.
Fall through to `narrative_data_planes_list(include: ["metadata"])`
and ask the user via `AskUserQuestion` — do not guess.

## The generator emitted zero mappings

If the Phase 2 input has an empty `suggested_mappings: []`, there
is nothing to apply. Stop in Phase 3 with a one-line message:
"Input contains zero mappings — nothing to apply." Do not submit
an empty workflow.
