# The Snowflake branch

Read this when Phase 3 finds a Snowflake data plane. Follow it and
stop — do not apply the size ladder from
[`POOL_SIZES.md`](POOL_SIZES.md). On a Snowflake plane almost nothing
from the AWS path carries over.

---

## 1. What a compute pool is here

On an AWS plane, a compute pool is a cluster that Narrative provisions and
sizes. On a Snowflake plane, a compute pool is a **registered Snowflake
virtual warehouse** that already exists in the customer's own Snowflake
account, surfaced to Narrative through the Native App installation.

The consequences:

| | AWS plane | Snowflake plane |
| --- | --- | --- |
| Who provisions the compute | Narrative | The customer, in Snowflake |
| Who sizes it | Narrative, via the `size` enum | The customer, in Snowflake |
| What the recommendation is | A size to create or move to | **Which existing warehouse to target** |
| Cost model | Per-size, on the Narrative plane | Snowflake credits on the customer's own contract |
| Idle behavior | `idle_timeout_seconds`, 5–10 min to launch a cluster | Snowflake auto-suspends and auto-resumes natively |
| `_storage` variants | Yes | Not applicable |
| In-flight cluster cap | Yes | Not applicable |

**There is no startup latency to manage.** Snowflake suspends idle
warehouses and resumes them on demand in seconds. That removes the
single biggest input to the shared-vs-private decision on AWS, so the
Phase 6 logic does not transfer either.

---

## 2. What to do

1. List the plane's pools as usual:

   ```
   narrative_data_planes_describe(
     data_plane_ids=[<dpId>],
     include=["compute_pools","platform"]
   )
   ```

   Each entry corresponds to a registered warehouse, and `name` is the
   warehouse's name in the customer's Snowflake account — see §3 for the
   verified field set.

2. **Recommend which existing warehouse to target**, by id *and* name, so the
   customer's Snowflake administrator recognizes it. Read `size` as the
   Snowflake warehouse size it is; do not translate it onto the AWS ladder.

3. **If none of the registered warehouses fit**, the recommendation is:
   *register a warehouse of size N in Snowflake, then re-run this
   skill.* Point the user at the Snowflake Native App installation guide
   in the published Narrative documentation for the registration steps.
   Do not attempt to size a warehouse that does not exist yet beyond
   naming a Snowflake size class.

4. **Frame cost as Snowflake credits**, on the customer's own contract.
   Do not use the relative multipliers from `POOL_SIZES.md` — they
   describe a different fleet with different economics. If the customer
   asks what a warehouse size costs, that is a question about their
   Snowflake contract, not something this skill can answer.

5. Still recommend the **resolution level** (per-job, dataset default,
   company default). The resolution chain in `POOL_SIZES.md` §8 is
   plane-agnostic and does apply here.

---

## 3. The payload shape, verified

Checked against a live Snowflake plane (`platform.type:
platform_snowflake`). What comes back:

```
### compute_pools
- 3c899fde-…: compute_wh
  - status: active
  - size: x_small
  - always_on: n/a
- 5ffa990b-…: xxlarge
  - status: active
  - size: 2x_large
  - always_on: n/a
```

Four things this settles:

- **`name` is the Snowflake warehouse name.** `compute_wh` and `xxlarge`
  above are the warehouses as they exist in the customer's account, so you
  can name the warehouse in a recommendation. Still cite the pool **id**
  alongside it, and note that names are free text and can collide.
- **`size` is present and meaningful** — but read it as a *Snowflake*
  warehouse size, not a rung on the AWS ladder. The enum happens to overlap
  (`x_small`, `2x_large`), which is a trap: it invites applying the AWS cost
  multipliers and node counts, and neither transfers.
- **`always_on` renders `n/a`**, i.e. unset. It has no meaning here, as §1
  predicts — Snowflake handles suspend and resume itself. Do not read `n/a`
  as `false` and do not reason about it.
- **`idle_timeout_seconds` is absent entirely.** Snowflake's own auto-suspend
  setting governs this, and it isn't surfaced through Narrative.

`platform` additionally carries `account_locator`, `account_name`,
`organization_name`, and `region` — enough to tell the customer's Snowflake
administrator exactly which account you mean.

`metadata.default_compute_pool_id` was present on the plane checked, pointing
at the `2x_large` warehouse. Read it as the incumbent; it's what queries use
when nothing pins a pool.

Two things still hold regardless:

- **Report the fields you actually received.** Don't narrate one you didn't
  see, and don't substitute an AWS default for a missing field.
- **Never present an inferred warehouse size as read from the payload.**
