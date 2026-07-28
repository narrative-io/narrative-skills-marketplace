# EMR compute pool sizing — ground truth

Read this when recommending a private pool size on an AWS data plane.
It covers the allocator, why the bottom of the ladder is flat, relative
cost, the `_storage` variants, and the timeout fields.

Confidence is marked throughout. **Measured** means it comes from the
allocator configuration or published instance specs. **Estimated** means
it is a calibration parameter you should state as an assumption and
correct after a real run.

---

## 1. The allocator

One **weighted unit is approximately 32 GiB** of worker memory. The
sizing relation the allocator implements is:

```
maxCore + maxTask = target_memory_GiB / 32
```

Node ranges per size (**measured**):

| Size | min core | max core | min task | max task | Max units | Provisioned memory |
| --- | --- | --- | --- | --- | --- | --- |
| `x_small` | 1 | 1 | 1 | 1 | 2 | 64 GiB |
| `small` | 1 | 1 | 1 | 1 | 2 | 64 GiB |
| `medium` | 2 | 2 | 0 | 0 | 2 | 64 GiB |
| `large` | 4 | 4 | 0 | 0 | 4 | 128 GiB |
| `x_large` | 1 | 4 | 1 | 4 | 8 | 256 GiB |
| `2x_large` | 1 | 4 | 4 | 12 | 16 | 512 GiB |
| `3x_large` | 1 | 4 | 4 | 28 | 32 | 1 TiB |
| `4x_large` | 1 | 4 | 8 | 60 | 64 | 2 TiB |
| `5x_large` | 1 | 4 | 16 | 124 | 128 | 4 TiB |
| `6x_large` | 1 | 4 | 16 | 252 | 256 | 8 TiB |

### Instance families

- **`x_small` through `large`** — master on `m6g`, core and task nodes on
  Graviton (an `r8g`/`r7g` mix). The smallest, `r8g.xlarge`, is
  4 vCPU / 32 GiB at fleet weight 1, so units map 1:1 to nodes here.
  **Fixed size — no autoscaling.**
- **`x_large` through `6x_large`** — Graviton throughout, smallest
  `r7g.2xlarge` at 8 vCPU / 64 GiB, fleet weight 2. **EMR Managed
  Scaling**: the cluster boots at its minimum, expands toward the maximum
  as YARN load demands, and contracts when idle.

The autoscaling boundary at `x_large` matters for cost (see §3) and for
first-run latency: a managed-scaling pool that boots at minimum will
take time to reach full width on a large job.

---

## 2. The driver-node reservation — why the bottom three tiers are the same

EMR runs with `maximizeResourceAllocation=true`. That tells EMR's
bootstrap to size **one executor per core node, filling the whole
node**. The Spark driver (the YARN application master) cannot share a
node with an executor sized that way, so **one worker node is always
consumed by the driver** and executor capacity is one node less than
provisioned.

Effective executor capacity on the fixed tiers (**measured**):

| Size | Nodes | Executor nodes | Executor memory |
| --- | --- | --- | --- |
| `x_small` | 2 | 1 | ~32 GiB / ~4 vCPU |
| `small` | 2 | 1 | ~32 GiB / ~4 vCPU |
| `medium` | 2 | 1 | ~32 GiB / ~4 vCPU |
| `large` | 4 | 3 | ~96 GiB / ~12 vCPU |

**`x_small`, `small`, and `medium` are the same pool.** Same executor
capacity, same cost. Stepping from `x_small` to `medium` buys nothing.
`large` is the first real step up — it triples executor memory.

This is the single highest-value rule in this reference. A naive reading
of the provisioned-memory column in §1 produces exactly the wrong
conclusion, because it counts the driver's node as usable capacity.

Two caveats on scope:

- The same one-node reservation applies to the managed-scaling tiers, so
  `x_large` is nearer ~224 GiB of executor memory than 256 GiB. But the
  measured analysis was specific to the fixed tiers — treat the
  scaling-tier figure as **estimated** and don't over-claim it.
- If `maximizeResourceAllocation` is ever set to `false`, `x_small`
  becomes genuinely one node and the ladder gains a real bottom rung.
  If a user reports `x_small` behaving differently from `medium`,
  believe them over this table and say the configuration may have
  changed.

### A related failure mode

A `medium` pool can deadlock with jobs stuck waiting for executors: the
core instances get consumed by the YARN application master and there is
nothing left for executors. If a user reports jobs hanging on a
`medium` pool rather than running slowly, this is the likely cause, and
the fix is `large` — not `medium` with more patience.

---

## 3. Relative cost

Cost is close to linear in weighted units, because cost per unit barely
varies between the two instance families. Report **relative
multipliers**, never dollar figures — pricing is set per-size outside
this skill, and a quoted rate would be a commitment this skill cannot
make.

| Size | Relative ceiling | Relative idle floor | Share of units on task fleet |
| --- | --- | --- | --- |
| `x_small` / `small` / `medium` | 1x | 1x | 0–50% |
| `large` | 2x | 2x | 0% |
| `x_large` | 4x | ~1.4x | 50% |
| `2x_large` | 8x | ~2.4x | 75% |
| `3x_large` | 16x | ~2.4x | 88% |
| `4x_large` | 32x | ~3.8x | 94% |
| `5x_large` | 64x | ~6.5x | 97% |
| `6x_large` | 128x | ~6.5x | 98% |

Each rung doubles at the ceiling. Three wrinkles worth surfacing:

- **Task fleets run on spot capacity.** At the top of the ladder ~98% of
  units are task nodes, so a fully-stretched `6x_large` costs
  meaningfully less than 128x its nominal rate. The curve is
  *sub*-linear at the top. Conversely `medium` and `large` have **zero**
  task instances and get no spot discount at all — the step from
  `large` to `x_large` is better value than it looks.
- **Idle floors are the real trap.** Managed-scaling pools boot at their
  minimum and only expand under load, so the idle floor is far below the
  ceiling — but it is charged continuously. A `6x_large` with
  `idle_timeout_seconds: -1` costs its floor around the clock for as
  long as it exists. **Never recommend `always_on` above `large`
  without saying this explicitly.**
- **The `_storage` premium is about 25%**, versus 100% for a size step.
  Always try sideways-to-`_storage` before up-a-size for a disk problem.

---

## 3b. Starting bands

Where sizing **starts**, against the byte figure chosen in the skill's
evidence phase. These are a floor, not an answer — the headroom rule and
the overspend guardrail in the skill turn a band into a recommendation.

| Input (compressed) | Floor |
| --- | --- |
| < 1 GB | Shared always-on, if the job is genuinely seconds-to-minutes |
| 1–10 GB | `x_small` private |
| 10–100 GB | `large` — the first real step up |
| 100–500 GB | `x_large` – `2x_large` |
| 500 GB – 2 TB | `2x_large` – `4x_large` |
| > 2 TB, or very wide rows | `4x_large` – `6x_large` |

The bands are calibration parameters, not measurements. One real run at a
known size is worth more than any refinement of them.

---

## 4. `_storage` variants

Every size has a sibling: `x_small_storage` through `6x_large_storage`.
Same memory budget, same node counts. The difference is that core and
task nodes move to Graviton instances with **local NVMe SSD**
(`r7gd`/`r8gd`) instead of EBS. The master stays on `m6g` — it does no
shuffle.

**Trigger:** the job fails with `No space left on device`. Typical
culprits are wide joins, large `GROUP BY` or `DISTINCT`, and MV
refreshes over very wide datasets.

**Why it exists:** sizing was in practice being driven by disk rather
than memory, with pools being stepped up a full size purely to get more
scratch space.

**Why to reach for it first on a disk symptom:** it targets the failure
you actually observed. Running out of scratch space is fixed by giving
the job local NVMe, and the storage variant does that while holding
memory, node count, and every other characteristic of the job's profile
constant — so the next run differs from the failed one in exactly the
dimension that failed. A size step changes several things at once and
only incidentally relieves disk.

It is also the cheaper move — roughly a 25% premium against 100% for a
size step. Treat that as the secondary argument: the figure comes from
on-demand list prices, not measurement, since real rates come from a bid
provider at runtime. The failure-mode match is the primary reason.

The variant is encoded in the size enum itself, not a separate flag — so
switching to `_storage` is a size change, and §5's replacement caveat
applies.

---

## 5. Timeouts

| Field | Range | Default on create | Meaning |
| --- | --- | --- | --- |
| `idle_timeout_seconds` | `-1`, or `60`–`604800` | `900` (15 min) | Idle time before the cluster auto-terminates. `-1` never terminates. |
| `job_execution_timeout_seconds` | `60`–`604800` | `14400` (4 h) | Maximum time a single job's EMR step may run. Exceeding it cancels the job and marks it failed. |

Neither field is exposed on the compute-pool MCP payload, so you cannot
read a pool's current timeouts. Say "unknown" rather than assuming the
default.

**The critical gotcha:** on update, the pool's provider block is
replaced **wholesale, not merged**. A size-only change that omits the
timeout fields silently resets both to their defaults (4 h / 15 min). If
a user has custom timeouts and you recommend a resize, tell them to
re-send the timeout fields in the same call.

The shared always-on pool runs with a **1-hour**
`job_execution_timeout_seconds` — much tighter than the 4-hour default,
and invisible through MCP. It is the main reason to rule the shared pool
out.

**`idle_timeout_seconds` is also the throughput lever for batch
submission.** Its cost framing above assumes one job; for a fan-out, the
timeout decides whether job N+1 reuses a booted cluster or pays cold
start again. Keeping a cluster alive between waves of a batch is usually
far cheaper than re-booting per job — at ~6 minutes a boot, 100 jobs is
~10 hours of cluster time that a raised timeout simply deletes. This is
the one context where a high idle timeout is the economical choice.

---

## 6. The in-flight cluster cap

There is a global ceiling — on the order of 10–20 — on simultaneously
running EMR clusters on Narrative-managed AWS planes. When it binds,
new clusters are not launched and **affected jobs simply stay `Pending`
with no error message.**

Allocation is round-robin across companies, ordered by longest-waiting
job. The cap exists to bound worst-case spend and to reduce
simultaneous spot demand — many clusters launching at once compete for
scarce spot capacity and fail.

Two consequences for a recommendation:

- A job stuck in `Pending` is documented behavior, not a hang. Don't
  recommend a resize for it.
- It is an argument *for* the shared always-on pool: that pool already
  has a running cluster, so it never waits for a slot.

---

## 7. Compressed bytes to memory

Dataset `*_stored_bytes` figures are **compressed** on-disk Parquet.
In-memory expansion is typically **3–10x**, and Narrative datasets tend
toward the high end because Rosetta Stone schemas are heavily nested
(visible as `NAMED_STRUCT` throughout any compiled view definition).

This is **estimated** — a calibration parameter, not a law. Pick a
figure, state it in the output ("assumed ~5x expansion"), and invite
correction. One real run at a known size replaces the guess entirely.

---

## 8. Resolution chain

A job runs on the first level present, fixed at job-creation time:

1. `computePoolId` on the request or workflow task input
2. The dataset's `computePoolConfig.defaultComputePoolId`
3. The company's per-data-plane default compute pool
4. The data plane's `defaultComputePoolId`

Recommend the **level**, not just the pool:

| Level | Use for |
| --- | --- |
| Per-job | A one-off large rebuild, leaving steady state alone |
| Dataset default | Every refresh of one dataset |
| Company default | Operations with no dataset — model inference, healthchecks |
| Data plane default | A plane-wide floor; rarely the right answer |

Setting the company default requires **Company Info** write permission.

Two behaviors worth knowing: on AWS planes the first pool created is
**not** automatically promoted to the data plane default, so jobs must
pin explicitly or resolve via a dataset or company default. And new
companies are auto-provisioned a private `x_small` EMR pool set as the
company default — so "the default" on a fresh account is the bottom of
the ladder.
