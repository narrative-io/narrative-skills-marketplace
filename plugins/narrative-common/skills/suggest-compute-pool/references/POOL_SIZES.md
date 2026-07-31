# Compute pool sizes — ground truth

Read this when recommending a private pool size on an AWS data plane. It
covers the size ladder, why the bottom of it is flat, relative cost, the
`_storage` variants, the timeout fields, and the resolution chain.

Confidence is marked throughout. **Measured** means it comes from the
platform's own configuration. **Estimated** means it is a calibration
parameter you should state as an assumption and correct after a real run.

---

## 1. The ladder

A pool is provisioned as a cluster of worker nodes. Sizes and the memory
they provision (**measured**):

| Size | Worker nodes | Provisioned memory | Scaling |
| --- | --- | --- | --- |
| `x_small` | 2 | 64 GiB | Fixed |
| `small` | 2 | 64 GiB | Fixed |
| `medium` | 2 | 64 GiB | Fixed |
| `large` | 4 | 128 GiB | Fixed |
| `x_large` | 2–8 | up to 256 GiB | Autoscaling |
| `2x_large` | 2–16 | up to 512 GiB | Autoscaling |
| `3x_large` | 2–32 | up to 1 TiB | Autoscaling |
| `4x_large` | 2–64 | up to 2 TiB | Autoscaling |
| `5x_large` | 2–128 | up to 4 TiB | Autoscaling |
| `6x_large` | 2–256 | up to 8 TiB | Autoscaling |

**The scaling boundary is at `x_large`.** Below it, a pool is a fixed set of
nodes. At and above it, the cluster starts at its minimum and grows as the
job demands, then shrinks when idle. That matters for cost (§3) and for how
a first run behaves: an autoscaling pool that starts at its minimum takes
time to reach full width on a large job, so the early part of the run is
slower than the steady state.

---

## 2. Why the bottom three sizes are the same

**Every pool reserves one worker node to coordinate the job.** That node
plans the work and tracks progress; it does not process data. So the
capacity actually available to the job is one node less than provisioned:

| Size | Worker nodes | Nodes doing work | Usable memory |
| --- | --- | --- | --- |
| `x_small` | 2 | 1 | ~32 GiB |
| `small` | 2 | 1 | ~32 GiB |
| `medium` | 2 | 1 | ~32 GiB |
| `large` | 4 | 3 | ~96 GiB |

**`x_small`, `small`, and `medium` are the same pool.** Same usable
capacity, same cost. Stepping from `x_small` to `medium` buys nothing.
`large` is the first real step up — it triples usable capacity.

This is the single highest-value rule in this reference, and it is
**settled** — not a guess to hedge or re-derive. If a recommendation lands
on `small` or `medium`, the recommendation is wrong. A naive reading of the
provisioned-memory column in §1 produces exactly the wrong conclusion,
because it counts the coordinator's node as usable.

The same one-node reservation applies to the autoscaling sizes, so
`x_large` is nearer ~224 GiB of usable memory than 256 GiB. The measured
analysis covered the fixed sizes, so treat the autoscaling figure as
**estimated** and don't over-claim it.

### A related failure mode

A `medium` pool can stall, with jobs sitting and never progressing: the two
nodes get consumed by coordination and there is nothing left to do the work.
If a user reports jobs **hanging** on a `medium` pool rather than running
slowly, this is the likely cause, and the fix is `large` — not `medium` with
more patience.

---

## 3. Relative cost

Cost is close to linear in provisioned capacity. Report **relative
multipliers**, never dollar figures — pricing is set per-size outside this
skill, and a quoted rate would be a commitment this skill cannot make.

| Size | Relative ceiling | Relative idle floor |
| --- | --- | --- |
| `x_small` / `small` / `medium` | 1x | 1x |
| `large` | 2x | 2x |
| `x_large` | 4x | ~1.4x |
| `2x_large` | 8x | ~2.4x |
| `3x_large` | 16x | ~2.4x |
| `4x_large` | 32x | ~3.8x |
| `5x_large` | 64x | ~6.5x |
| `6x_large` | 128x | ~6.5x |

Each rung doubles at the ceiling. Three wrinkles worth surfacing:

- **The ceiling overstates what the big sizes cost.** Most of the capacity
  at the top of the ladder runs on discounted interruptible instances, so a
  fully-stretched `6x_large` costs meaningfully less than 128x. The curve is
  *sub*-linear at the top. Conversely `medium` and `large` get no such
  discount at all — the step from `large` to `x_large` is better value than
  it looks.
- **Idle floors are the real trap.** An autoscaling pool sits at its minimum
  when nothing is running, and that floor is charged continuously. A
  `6x_large` with `idle_timeout_seconds: -1` costs its floor around the
  clock for as long as the pool exists. **Never recommend `always_on` above
  `large` without saying this explicitly.**
- **The `_storage` premium is about 25%**, versus 100% for a size step. It
  is the cheaper thing to try when the problem looks like scratch space.

---

## 3b. Starting bands

Where sizing **starts**, keyed on the row count chosen in the skill's
evidence phase — `active_dataset_stored_records` for a full build,
`last_snapshot_added_records` for an incremental refresh. These are a floor,
not an answer: the headroom rule and the overspend guardrail in the skill
turn a band into a recommendation.

| Rows processed | Compressed bytes, roughly | Floor |
| --- | --- | --- |
| < ~5 million | < 1 GB | Shared always-on, if the job is genuinely seconds-to-minutes |
| ~5–50 million | 1–10 GB | `x_small` private |
| ~50–500 million | 10–100 GB | `large` — the first real step up |
| ~500 million – 2.5 billion | 100–500 GB | `x_large` – `2x_large` |
| ~2.5–10 billion | 500 GB – 2 TB | `2x_large` – `4x_large` |
| > ~10 billion, or very wide rows | > 2 TB | `4x_large` – `6x_large` |

**The bands are calibration parameters, not measurements.** The row column
and the byte column are the same bands under an assumed ~200 compressed
bytes per row, which is a middling figure for Narrative's nested schemas.
Use whichever you actually read — rows if the stats block gave you rows,
bytes if it gave you bytes — and if the two disagree by more than a band,
trust bytes and say the rows are unusually wide or unusually narrow.

Row counts alone don't settle it. **Adjust off the band for what the query
does**, per the skill's Phase 8: joins across three or more datasets, a high
`approx_count_distinct` on a group or join key, or `merge: true` all push
up. One real run at a known size is worth more than any refinement of this
table.

---

## 4. `_storage` variants

Every size has a sibling: `x_small_storage` through `6x_large_storage`. Same
memory budget, same node counts. The difference is that the worker nodes get
**local SSD** instead of network-attached storage, which gives the job much
faster scratch space.

**When to reach for it:** the job does a lot of sorting and regrouping over
a lot of rows — wide joins, a large `GROUP BY` or `DISTINCT` on a
high-cardinality key, an MV refresh over very wide rows. That work needs
scratch space, and scratch space is what this variant buys.

**Why it exists:** sizing was in practice being driven by scratch space
rather than memory, with pools stepped up a full size purely to get more
room to spill.

**Why to try it before a size step:** it changes one thing. A size step
changes several at once and only incidentally relieves scratch pressure. It
is also the cheaper move — roughly a 25% premium against 100% for a size
step. Treat the price as the secondary argument; the primary one is that it
targets the constraint.

**A caution on the trigger.** The platform does not report *why* a job
failed in any structured way — there is no out-of-disk signal to key on (see
[`EVIDENCE.md`](EVIDENCE.md) §4). So in practice you reach for `_storage`
from **query shape**, not from an error. If the user happens to paste a
failure that mentions disk or device, that settles it; its absence proves
nothing either way.

The variant is encoded in the size enum itself, not a separate flag — so
switching to `_storage` is a size change, and §5's replacement caveat
applies.

---

## 5. Timeouts

| Field | Range | Default on create | Meaning |
| --- | --- | --- | --- |
| `idle_timeout_seconds` | `-1`, or `60`–`604800` | `900` (15 min) | Idle time before the cluster shuts down. `-1` never shuts down. |
| `job_execution_timeout_seconds` | `60`–`604800` | `14400` (4 h) | Maximum time a single job may run. Exceeding it cancels the job and marks it failed. |

`job_execution_timeout_seconds` is **not** exposed on the compute-pool MCP
payload, so you cannot read a pool's current value. Say "unknown" rather
than assuming the default.

**The critical gotcha:** on update, the pool's provider block is replaced
**wholesale, not merged**. A size-only change that omits the timeout fields
silently resets both to their defaults (15 min / 4 h). If a user has custom
timeouts and you recommend a resize, tell them to re-send the timeout fields
in the same call.

The shared always-on pool runs with a **1-hour**
`job_execution_timeout_seconds` — much tighter than the 4-hour default, and
invisible through MCP. It is the main reason to rule the shared pool out.

**`idle_timeout_seconds` is also the throughput lever for batch
submission.** Its cost framing above assumes one job; for a fan-out, the
timeout decides whether job N+1 reuses a running cluster or waits for a new
one to launch. Keeping a cluster alive between waves of a batch is usually
far cheaper than relaunching per job — at ~6 minutes a launch, 100 jobs is
~10 hours of cluster time that a raised timeout simply deletes. This is the
one context where a high idle timeout is the economical choice.

---

## 6. The in-flight cluster cap

There is a global ceiling — on the order of 10–20 — on how many clusters can
run simultaneously on Narrative-managed AWS planes. When it binds, new
clusters are not launched and **affected jobs simply stay `Pending` with no
error message.**

Allocation is round-robin across companies, ordered by longest-waiting job.
The cap exists to bound worst-case spend and to avoid many clusters
competing for the same scarce discounted capacity at once.

Two consequences for a recommendation:

- A job stuck in `Pending` is documented behavior, not a hang. Don't
  recommend a resize for it.
- It is an argument *for* the shared always-on pool: that pool already has a
  running cluster, so it never waits for a slot.

`state: pending` is visible through MCP, which makes this one of the few
diagnoses available from data alone.

---

## 7. Rows, bytes, and memory

Dataset byte figures are **compressed on disk**. The same data occupies
several times more while a job is working on it, and Narrative datasets sit
at the high end of that range because Rosetta Stone schemas are heavily
nested.

Do not lean on a specific expansion factor. It is **estimated**, it varies
by an order of magnitude across datasets, and quoting it precisely dresses a
guess up as arithmetic. The useful moves are:

- Size from the **row count** and the query's shape, per §3b.
- Use bytes ÷ rows to compare row width **between datasets in the same
  query** — a relative comparison you actually measured, rather than an
  absolute expansion you assumed.
- Say what you sized on, and invite correction from one real run.

---

## 8. Resolution chain

A job runs on the first level present, fixed at job-creation time:

1. The pool named on the request or workflow task input
2. The dataset's default compute pool
3. The company's per-data-plane default compute pool
4. The data plane's default compute pool

Recommend the **level**, not just the pool:

| Level | Use for |
| --- | --- |
| Per-job | A one-off large rebuild, leaving steady state alone |
| Dataset default | Every refresh of one dataset |
| Company default | Operations with no dataset — model inference, healthchecks |
| Data plane default | A plane-wide floor; rarely the right answer |

Setting the company default requires **Company Info** write permission.

Two behaviors worth knowing: on AWS planes the first pool created is **not**
automatically promoted to the data plane default, so jobs must name a pool
explicitly or resolve via a dataset or company default. And new companies
are auto-provisioned a private `x_small` pool set as the company default —
so "the default" on a fresh account is the bottom of the ladder.
