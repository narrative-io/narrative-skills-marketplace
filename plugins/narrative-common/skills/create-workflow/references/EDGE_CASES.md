# Edge cases and gotchas

Read when something feels off — the workflow won't validate, the
user is asking about features that don't exist (parallelism,
branching, retries), a `datasetName` is being rejected, or a
re-submission is conflicting with an existing workflow.

## User asks for parallel tasks, conditional branching, or loops

Not supported. Say so explicitly and propose the closest sequential
expression of their intent. If their workflow genuinely needs
parallelism, two separate workflows scheduled at the same cron may
be the right shape.

## `schedule_immediately: true` but no `schedule:` block in the spec

The activate-schedule endpoint will reject this. Either drop the
flag or add a `schedule.cron` value. Ask which.

## `--trigger` on a workflow whose first task is destructive

Surface the risk in step 6 ("This will INSERT / DELETE rows on
create") and ask the user to confirm explicitly. Default to *not*
triggering when the workflow contains an `ExecuteDml` with `UPDATE`
or `DELETE` unless the user has clearly opted in.

## `datasetName` casing or invalid characters

Names must match `^[A-Za-z0-9_]{1,256}$`. Reject any name with
hyphens, spaces, or quotes before drafting — `narrative_workflows_create`
will, too.

## NQL inside the workflow references a dataset on a different plane

The validator cannot catch cross-plane references at create time —
the run will fail. Surface plane assumptions in step 6 and verify
before submitting.

## The user pastes a spec with the wrong `dsl` version

Today the only supported value is `'1.0.0'`. Quietly correct it in
step 4 and flag the change in step 6.

## Re-submitting the same workflow name+namespace

The platform does not silently overwrite; it returns a conflict.
Bump `document.version` (and ideally `document.name`) to
disambiguate.
