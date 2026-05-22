# DSL invariants for workflow specs

Step 4 of `SKILL.md` says "draft the YAML using the example as a
base." Most happy-path invocations adapt the example as-is — the
invariants below only matter when you deviate from an example or when
the validator rejects the spec and you need to know why. Read this
when something looks off in the spec or `narrative_workflows_create`
returns a 4xx.

## Version pinning

- `document.dsl` is always `'1.0.0'`. Don't change it; the platform
  only implements this DSL version.
- `document.version` is a semver string in quotes. Bump it manually on
  every spec change so successive revisions are distinguishable.

## Task allowlist — the seven supported tasks

Every task `call:` must be one of these exact names. Never invent a
task name; if the user's ask doesn't fit, push back rather than
fabricate.

- `CreateMaterializedViewIfNotExists`
- `RefreshMaterializedView`
- `ExecuteDml`
- `RunModelInference`
- `LabelConnectedComponents`
- `CreateRosettaStoneMappingsIfNotExist`
- `CreateDatasetSample`

`do:` is an ordered list. Tasks run sequentially. There is no
parallel execution, no conditional logic, no loops, no automatic
retries. If the user asks for any of those, push back: the platform
does not support them today.

## NQL block-scalar rules

NQL goes inside `with.nql` as a single string. Wrap multi-line NQL
in YAML's `|` block scalar — it preserves newlines without
ambiguity. If you need a real NQL validation pass before submitting
the workflow, call `narrative_nql_validate` (or hand off to
`/write-nql`) — `narrative_workflows_create` checks the YAML shape
and the task contract, but not the NQL semantics inside `nql:`
fields end-to-end.

## `datasetName` regex

`datasetName` parameters must match `^[A-Za-z0-9_]{1,256}$`:
alphanumerics + underscores only, max 256 chars. When referencing a
dataset in NQL, the qualified form is `company_data.<name>`.

## `export.as` jq semantics

`export.as` is a jq expression. `.` is the current task's output,
`$context` is the accumulated workflow context (starts as `{}`). See
`examples/04-data-passing-export-context.yaml` for the canonical
pattern of capturing a task output and reading it from a downstream
task.

## `${...}` interpolation

In `${...}` variable expressions, a bare `${expr}` preserves the
JSON type; inside a string, use jq interpolation `\(expr)`. Mixing
the two — e.g., `"${.datasetId}"` when the consumer expects a UUID
string — usually works but the bare form is preferred where the
schema accepts the native type.
