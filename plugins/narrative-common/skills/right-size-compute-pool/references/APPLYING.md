# Handing over a recommendation the user can act on

This skill never creates, resizes, or archives a pool. But naming a size
is only half an answer — the user still has to apply it. Read this when
the recommendation is "create a new pool" or "change an existing one,"
and hand back the settings plus the route to set them.

Most users are on the UI, not the API. Lead with the settings themselves
(interface-neutral), then the UI, and treat the API shape as an
alternative for people who are scripting.

---

## 1. Check first: can this user even do it?

Creating or editing a pool requires the `manage_compute_pools` permission
on the data plane collaborator. A user without it sees the pool list but
cannot create — so say up front that applying the change may need whoever
administers the account, rather than letting them discover it at the
save button.

Pool creation may also be gated on the company's credit limit. If a
create is refused for that reason it is a billing decision, not a bug or
a sizing error — don't respond by recommending a smaller size.

## 2. The settings that define a pool

A pool is more than a size. Every create needs:

| Setting | Notes |
| --- | --- |
| Name | A unique slug within the (company, data plane) scope. |
| Display name | Human-readable; what shows in the pool list. |
| Size | The rung from the ladder, base or `_storage`. |
| Idle timeout | Seconds before the idle cluster terminates. `-1` never terminates. Omitted → **15 minutes**. |
| Job execution timeout | Seconds a single job may run before it is cancelled and failed. Omitted → **4 hours**. |

Description, tags, and a collaborator list are optional.

**State both timeouts explicitly in your recommendation, every time.**
They default silently, and the default idle timeout of 15 minutes is
exactly wrong for a batch — a fan-out submitted in waves more than 15
minutes apart re-pays cold start on every wave. If you recommended a
raised idle timeout for batching, it is a *setting on the pool*, not
advice the user applies separately.

Pools are scoped to a data plane. You resolved that id in Phase 1 —
include it, because a user with several planes needs to know which one.

## 3. The UI route

Point the user at the Compute Pools screen for their data plane, where
pools can be created and existing ones edited. Give them the settings
table from §2 and let the form guide the rest.

**Do not invent navigation breadcrumbs or button labels.** The UI moves,
and a confidently wrong click path is worse than none. Name the screen
and the values to enter; if the user cannot find it, say so plainly and
suggest they ask whoever administers the account.

## 4. The API route

For users who are scripting, the same thing is a create call against the
compute-pools endpoint, scoped by `data_plane_id`, with `name`,
`display_name`, and a `provider` block carrying `type: aws_emr`, the
size, and both timeouts.

Present it as a filled-in example using the actual recommended values —
not a template with placeholders the user has to decode. **Showing the
call is not making it**; the skill still does not execute anything.

## 5. Changing an existing pool

On update, the provider block is replaced **wholesale, not merged**. A
size-only change that omits the timeout fields silently resets both to
their defaults (15 minutes / 4 hours). So a resize recommendation must
re-state the timeouts the user already had, or they lose them without
being told.

This is the single most common way a "just bump the size" change causes a
second, unrelated problem.

## 6. Pointing a job at the pool

Naming the pool is not enough — say which **level** to set it at. A job
lands on the first level present, fixed when the job is created: per-job,
then the dataset's default, then the company's per-plane default, then
the plane default. The full chain and when to use each is in
[`EMR_SIZING.md`](EMR_SIZING.md) §8.

Getting this wrong is a quiet failure: the user creates a correctly-sized
pool, never points anything at it, and reports that the recommendation
did nothing.

## 7. Worked examples of the output shape

Pointing at something that already exists — nothing to create:

> **Use the shared always-on pool** (`<pool-id>`, `shared_xsmall_pool`).
>
> Dataset 41837 is 171k records / 3.4 MB compressed. This finishes well
> under a minute, inside the 1-hour cap, and skips the 5–10 minute cold
> start of your own pool. Point this job at it per-job; nothing to create.
>
> *Confidence: high. Assumed ~5x in-memory expansion and no joins beyond
> the view definition. If it runs long or fails, send me the error.*

Recommending a new pool — settings plus route, UI first:

> **Create a `large` pool** for this batch; your existing pool
> (`<pool-id>`) is `medium`, which has the same executor capacity as
> `x_small`, so it is not a step up.
>
> On the Compute Pools screen for your data plane, create a pool with:
> size `large`, idle timeout `3600` (covers gaps between waves so you pay
> cold start once, not 125 times), job execution timeout `14400`. Then set
> it as the company default so all 125 builds pick it up.
>
> Applying this needs `manage_compute_pools` — if you don't have it, ask
> whoever administers the account.
>
> *Confidence: medium on the size, high on the idle timeout. Per-job
> duration is uncalibrated — the run I measured was against a 3.4 MB test
> dataset, not the 8.9 GB source. Send me the first real run and I'll
> re-size.*
