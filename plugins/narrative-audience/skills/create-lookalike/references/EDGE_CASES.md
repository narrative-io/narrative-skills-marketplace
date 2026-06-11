# Edge cases

## Audience name collides with an existing dataset

Every stage uses `CreateMaterializedViewIfNotExists`, so an existing
view with the same name is silently *reused*, not rebuilt. A collision
on the final name (or on any `{prefix}_*` intermediate from an earlier
build with the same prefix) means the run "succeeds" while delivering
a stale or differently-configured audience. Check the name with
`narrative_datasets_search` in phase 4 and require a fresh one. The
flip side is benign: re-triggering the *same unchanged* workflow after
a mid-pipeline failure resumes where it left off, because completed
stages are no-ops.

## Re-running with a changed configuration

Same prefix + different features/mode/threshold = wrong output, for
the same `IfNotExists` reason. Any configuration change needs a new
audience name (or the user must delete the old `{prefix}_*` views
first — don't offer to delete datasets yourself; tell the user which
ones are involved).

## No shared identity alias

See `CLASSIFICATION.md` — stop before generating anything. Offer the
two usual fixes: add a Rosetta Stone identity mapping to whichever
side is missing it, or pick a different population dataset.

## No eligible features

All candidate features failed the enum/cardinality filter. Common
causes: stats never calculated (cardinality unknown) or only free-text
columns mapped. Suggest `/profile-dataset --allow-recalc` to refresh
statistics, or `/generate-rosetta-stone-mappings` to map
lower-cardinality attributes. Do not proceed with zero features.

## Seed has rows the population lacks (or vice versa)

Normal and handled: the model learns only from candidates present in
the population. Seed members absent from the population simply don't
contribute to `is_seed = 1` rows. No action needed, but if the seed ∩
population overlap is tiny the weights are learned from few positives
— call that out in the phase-7 caveats when the seed is small
(roughly < 1,000 matched identities).

## `--min-score` at or beyond the boundaries

Probabilities are clamped to [0.001, 0.999] before the log-odds
conversion (`ln(p/(1-p))` is undefined at 0 and 1). Tell the user when
their value was clamped.

## `unique_id` attribute missing from the catalog

Omit the `mapOutputIdentity` task entirely (never invent an attribute
ID) and warn in the phase-7 summary AND the phase-9 report: without
identity mappings the audience can't be delivered by connectors and
can't seed a future look-alike. The mapping can be added later with
`/generate-rosetta-stone-mappings` + `/apply-rosetta-stone-mappings`.

## Downstream stages fail validation if checked

`narrative_nql_validate` resolves table references against the live
catalog, and stages 3+ reference views earlier stages haven't created
yet. Expected — validate only stages 1–2. The workflow service
validates the YAML structure at create time, and NQL errors in later
stages surface as failed steps at run time (diagnose via
`narrative_jobs_search` → `narrative_jobs_describe`).

## Run fails mid-pipeline

Surface the failing step's job error verbatim and stop. If the cause
is fixable in the spec (e.g. a feature column type surprise), fix and
resubmit under the *same* name — completed stages resume as no-ops.
If the fix changes the model configuration, that's a changed-config
re-run: new name (see above).

## Lookalike Studio interop (the wizard-state tag)

The UI serializes its wizard state into an extra dataset tag
(`_nio_lookalike_serialization=<base64 JSON>`) so "edit" can reopen
the builder. The skill reproduces it with
`scripts/lookalike_state_tag.py encode` (phase 5) — the encoding is
byte-identical to the UI's serializer, so skill-built audiences are
fully re-editable in Lookalike Studio.

When the script can't run (no shell, no `python3`), omit the tag and
tell the user: the audience opens in the UI as a plain audience (no
wizard re-edit) but carries the same
`_nio_audience` / `_nio_audience_studio` / `_nio_lookalike` tags, is
deliverable, and is a valid seed for either the UI or this skill.
Never hand-roll the base64 payload without the script's validation —
a malformed payload makes the UI's decode return null silently.

The script's `decode` mode answers "what configuration built this
audience?" for any dataset carrying the tag, whether the UI or this
skill created it.

## Connector delivery

Out of scope for this skill today. The UI's optional connections step
configures connectors post-build; point users there (or to a future
sibling skill). The `mapOutputIdentity` task is what makes that
delivery possible — protect it.

## Very large populations

The pipeline is set-based and runs server-side, so size is mostly a
runtime concern: warn that cold pools and large populations can take
minutes to hours (the monitor snippet's cadence already accounts for
this). Do not pre-filter the population yourself — selection is the
model's job.
