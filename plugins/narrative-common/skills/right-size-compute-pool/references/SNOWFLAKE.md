# The Snowflake branch

Read this when Phase 3 finds a Snowflake data plane. Follow it and
stop — do not apply the EMR ladder from
[`EMR_SIZING.md`](EMR_SIZING.md). On a Snowflake plane almost nothing
from the AWS path carries over.

---

## 1. What a compute pool is here

On an AWS plane, a compute pool is an EMR Spark cluster that Narrative
provisions and sizes. On a Snowflake plane, a compute pool is a
**registered Snowflake virtual warehouse** that already exists in the
customer's own Snowflake account, surfaced to Narrative through the
Native App installation.

The consequences:

| | AWS plane | Snowflake plane |
| --- | --- | --- |
| Who provisions the compute | Narrative | The customer, in Snowflake |
| Who sizes it | Narrative, via the `size` enum | The customer, in Snowflake |
| What the recommendation is | A size to create or move to | **Which existing warehouse to target** |
| Cost model | Per-size, on the Narrative plane | Snowflake credits on the customer's own contract |
| Idle behavior | `idle_timeout_seconds`, cold start 5–10 min | Snowflake auto-suspends and auto-resumes natively |
| `_storage` variants | Yes | Not applicable |
| In-flight cluster cap | Yes | Not applicable |

**There is no cold-start story to manage.** Snowflake suspends idle
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

   Each entry corresponds to a registered warehouse. Read every field
   the payload actually returns rather than assuming the AWS field set —
   see §3.

2. **Recommend which existing warehouse to target**, by id, naming the
   warehouse it maps to if the payload exposes that. Frame the choice in
   terms the customer's Snowflake administrator will recognize.

3. **If none of the registered warehouses fit**, the recommendation is:
   *register a warehouse of size N in Snowflake, then re-run this
   skill.* Point the user at the Snowflake Native App installation guide
   in the published Narrative documentation for the registration steps.
   Do not attempt to size a warehouse that does not exist yet beyond
   naming a Snowflake size class.

4. **Frame cost as Snowflake credits**, on the customer's own contract.
   Do not use the relative multipliers from `EMR_SIZING.md` — they
   describe a different fleet with different economics. If the customer
   asks what a warehouse size costs, that is a question about their
   Snowflake contract, not something this skill can answer.

5. Still recommend the **resolution level** (per-job, dataset default,
   company default). The resolution chain in `EMR_SIZING.md` §8 is
   plane-agnostic and does apply here.

---

## 3. Known uncertainty in the payload shape

The `compute_pools` payload for Snowflake-backed providers has **not
been verified against a live Snowflake plane**. The AWS field set
(`size`, `idle_timeout_seconds`, `always_on`) may be absent, may be
present but meaningless, or may be replaced by warehouse-specific
fields. In particular, whether the warehouse name and alias (an
`external_id`-style field) are surfaced through MCP is unconfirmed — and
the skill needs it to name a warehouse in its recommendation.

Handle this honestly:

- **Report the fields you actually received.** Do not narrate a field
  you did not see.
- **If the warehouse name is not exposed**, recommend by pool id and say
  explicitly that the payload did not include a warehouse name, so the
  user should confirm the mapping in Snowflake before relying on it.
- **If a field you expected is missing**, say so rather than substituting
  an AWS default. `always_on` in particular means something different
  here, if it appears at all.
- **Never present an inferred warehouse size as read from the payload.**

This is the weakest part of the skill. Being visibly uncertain is
correct; guessing a warehouse name is not.
