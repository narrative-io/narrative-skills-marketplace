<!-- AUTO-GENERATED from HARNESS_FALLBACK.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# Harness fallbacks

What to do when a required server or tool is unavailable, and when an
individual call errors mid-flow.

Never silently degrade. If something is unavailable, say so explicitly
in the final summary and either stop at render or hand the user a
copy-pasteable artifact.

## `narrative-mcp` unavailable

The skill cannot create a mapping or a workflow without it. The
fallback is render-only:

- Ask the user for the source dataset name, the attribute id, the
  attribute's enum values, and the data plane UUID, since none can be
  discovered.
- Generate the waterfall NQL and the fill INSERT from what they
  provide.
- Skip validation. Add a prominent warning to the output: "This NQL was
  not server-validated and the dataset's current schema is unknown.
  Validate before running it."
- Stop before mapping creation. Hand the user the NQL plus the exact
  sequence they need: create the cached mapping, activate the cache,
  then submit the fill workflow.

Do not attempt mapping creation over the REST API as a substitute.

## No dataset-activation tool

There is no MCP tool that activates a dataset, so activation always
goes through `PUT /datasets/<id>/activate`. This is the one place the
skill touches the REST API directly, and it exists only because the
platform has no other path today (SC-63910).

| Situation | Behavior |
|---|---|
| `Bash` available and `NIO_API_TOKEN` set | Run the activation, then confirm the status flipped to `active` by describing the dataset. |
| `Bash` available, no token | Do not guess at credentials. Print the exact `curl` command with `<CACHE_ID>` filled in and ask the user to run it, then continue once they confirm. |
| No `Bash` | Print the same command and tell the user they can also activate the cache from the dataset's page in the Narrative Platform UI. |

In every case, **do not submit the fill workflow until the cache is
active**. A workflow submitted against a pending cache fails in about
1.5 seconds without spawning a job, which is a confusing failure to
hand someone. Verify first.

## `narrative-knowledge-base` unavailable

Only affects background research. Proceed without it. Everything the
skill needs about the waterfall's shape and the platform's behavior is
in [`WATERFALL_NQL.md`](WATERFALL_NQL.md) and
[`EDGE_CASES.md`](EDGE_CASES.md); the knowledge base adds context, not
requirements.

## Partial degradation — a single call errors mid-flow

| Tool | Behavior on error |
|---|---|
| `narrative_context_get` | Retry once. If it still fails, warn and continue — a wrong-company mapping will be rejected server-side, which is safer than a silent wrong-company write. |
| `narrative_datasets_search` / `narrative_datasets_describe` | Retry once. If it still fails, ask the user for the dataset name and data plane directly, and warn that the source columns were not verified. |
| `narrative_attributes_describe` | Retry once. Without the enum the skill cannot generate validation arms or a correct prompt — stop and ask the user to paste the enum values rather than inventing them. |
| `narrative_nql_validate` | Retry once. If validation is unreachable rather than failing, surface the NQL with an explicit "not validated" warning and require the user to confirm before the mapping is created. Never substitute `narrative_nql_run` — it allocates compute and, for this query, spends money on model calls. |
| `narrative_mapping_create` | A 4xx is a real rejection: read it, fix the input, and re-submit once. Do not retry the same payload. A duplicate mapping is worth checking for before assuming the payload is wrong — describe the dataset's mappings. |
| `narrative_data_planes_list` | Retry once. If it keeps failing, ask the user for the plane UUID. |
| `/create-workflow` handoff fails | Do not retry blindly. Report what was already created — the mapping, the cache, its activation state — so the user knows the mapping exists without a fill workflow, then surface the failure verbatim. |

A partially-completed run is the normal failure mode here, because the
phases create real server-side objects in sequence. Always end by
stating exactly which objects exist and what remains, so the user can
resume rather than start over.

## `AskUserQuestion` not available

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.
