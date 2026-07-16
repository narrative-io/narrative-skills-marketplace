# Custom match key variant — compound features and array fields

When the user supplies a custom match key (`--match-key` with attribute
names, or the compound-key option in Phase 1.5), the match key stops
being a `graph_edge` identifier and becomes a key **built from Rosetta
attributes**. Three shapes, one mechanism:

1. **Compound feature** — two or more attributes fused into one atomic
   key (e.g. `soundex_first_name` + `e164_phone_number`).
2. **Array field** — an attribute whose Rosetta Stone type is `array`,
   exploded so the join runs once per element.
3. **Compound + array** — both at once. The worked example throughout
   this doc: `soundex_first_name` + `libpostal_normalized_address_array`.

This reference describes the exact surgery against
`assets/workflow.yaml.tmpl`.

The match engine is generic over `(PERSON_ID, ID, ID_TYPE)`. **Steps 3,
4, and 5 and the report output schema are unchanged** — the join, the
enrichment, and the aggregation don't care whether `ID` is a hashed
email or a `soundex::addr_hash` composite. All the deltas are in the two
**edge-extraction** steps (1 and 2) plus how the step-5 KPIs are
narrated.

## The compound key — one atomic key, not one edge per component

```
ID       = CONCAT(<soundex_first_name>, '::', <addr_hash>)
ID_TYPE  = 'soundex_first_name|libpostal_normalized_address_array'
```

A match requires **every component to agree** — the components are
fused into one key with one `ID_TYPE`, joined with AND semantics. Do
**not** emit a separate edge per component; that would match on any
single component independently (every "John" collides; everyone at a
shared address collides) — the opposite of the intent.

- `<addr_hash>` is one element of the exploded
  `libpostal_normalized_address_array`.
- **Delimiter rule — the composite MUST use `::`, never `|`.** libpostal
  hashes already contain `|` internally, so a `|` delimiter makes the
  compound key ambiguous and the join silently under-matches. The
  `a|b` convention in `ID_TYPE` is fine (that's the type label, matching
  the production `sha256_hashed_email.value|normalized_email` style); it
  is only the *value* delimiter that must be `::`.

## Array components — detected by attribute type

A component is an array **when its Rosetta Stone attribute type is
`array`** — check `narrative_attributes_describe` (e.g.
`libpostal_normalized_address_array` is type `array`; `soundex_first_name`
is a scalar string). Never guess from the attribute name.

- Each array component gets `CROSS JOIN UNNEST(...)` in the edge
  extraction — one compound-key row per array element. That is what
  keeps the join efficient: the join stays a plain equality on `ID`
  instead of an `ARRAY_CONTAINS` scan.
- Scalar components are used directly in the `CONCAT`.
- Two or more array components in one key cross-product their
  elements. Flag the fan-out cost before rendering such a key.

## Prerequisite (skill Phase 2.5)

The worked example needs both components — `soundex_first_name` (81)
and `libpostal_normalized_address_array` (326) — reachable on **both**
sides. The **customer** side may expose them in either shape (see the
two `--array-field-handling` modes below):

- **`standalone-attribute`** — 81 and 326 mapped as their own
  attributes.
- **`graph-edge-json`** — both packed into a `graph_edge` (362)
  `target_id` JSON with `target_id_type =
  'soundex_first_name|libpostal_normalized_address_array'`.

The **partner** side needs either the standalone attributes OR raw
`person_name|postal_address` `identifier_value` rows (step 2b
reconstructs the components from those). If a side exposes none of
these, route to `/generate-rosetta-stone-mappings`. The mappings need no
runtime change — the explosion happens here in the workflow, not in the
mapped dataset.

## Step 1 — customer edges (explode): two `--array-field-handling` modes

The customer edge extraction reads the key components
(`soundex_first_name` + the `libpostal_normalized_address_array`) and
`UNNEST`s the array into one `soundex::addr_hash` row per hash. The
customer side is small (a CRM file), so no blocking is needed — explode
the whole thing.

**How the components are sourced depends on how the dataset was
mapped** — selected by `--array-field-handling` (skill Phase 2.5), which
auto-detects from the customer mappings unless the flag forces it. Both
modes emit the identical `(CUSTOMER_PERSON_ID, ID, ID_TYPE)` output and
are **proven bit-for-bit equivalent** (ND Consumer 150k × Verisk:
standalone-attribute run and graph-edge-json run both matched 30,491
compound-key persons / 94,182 overall / 61.8% — SC-62612).

`CUSTOMER_PERSON_ID` always comes from `graph_edge['source_id']` — the
person anchor the report counts on, independent of the match key.

### Mode A — `standalone-attribute` (default)

Use when the dataset maps `soundex_first_name` (81) and
`libpostal_normalized_address_array` (326) as their own Rosetta
attributes. Read them directly and `UNNEST` the native array.

```sql
CREATE OR REPLACE MATERIALIZED VIEW "<RUN_SLUG_UPPER>_STEP1_CUSTOMER_EDGES"
DISPLAY_NAME = '<RUN_SLUG_UPPER>_STEP1_CUSTOMER_EDGES'
DESCRIPTION = 'Step 1/5 of <RUN_SLUG_UPPER>: customer compound-key edges — explode libpostal address array, composite soundex::hash key.'
EXPIRE = 'P1D'
TAGS = ( '_nio_materialized_view', '_nio_ci_match_report_workflow', '_nio_interactive' )
WRITE_MODE = 'overwrite'
AS
WITH customer_edges AS (
  SELECT DISTINCT
    z._rosetta_stone.graph_edge['source_id']                    AS CUSTOMER_PERSON_ID,
    CONCAT(z._rosetta_stone.soundex_first_name, '::', addr_hash) AS ID,
    'soundex_first_name|libpostal_normalized_address_array'      AS ID_TYPE
  FROM company_data.<CUSTOMER_DATASET_NAME> AS z
  CROSS JOIN UNNEST(z._rosetta_stone.libpostal_normalized_address_array) AS t (addr_hash)
  WHERE z._rosetta_stone.soundex_first_name IS NOT NULL
    AND addr_hash IS NOT NULL
)
SELECT CUSTOMER_PERSON_ID, ID, ID_TYPE FROM customer_edges
```

### Mode B — `graph-edge-json`

Use when the dataset packs both components into a single `graph_edge`
(362) whose `target_id_type` is
`soundex_first_name|libpostal_normalized_address_array` and whose
`target_id` is a JSON object
`{"soundex_first_name": "...", "libpostal_normalized_address_array": ["...", ...]}`.
`TRY_PARSE_JSON` the `target_id` and explode the parsed array.

```sql
CREATE OR REPLACE MATERIALIZED VIEW "<RUN_SLUG_UPPER>_STEP1_CUSTOMER_EDGES"
DISPLAY_NAME = '<RUN_SLUG_UPPER>_STEP1_CUSTOMER_EDGES'
DESCRIPTION = 'Step 1/5 of <RUN_SLUG_UPPER>: customer compound-key edges from graph_edge target_id JSON, composite soundex::hash key.'
EXPIRE = 'P1D'
TAGS = ( '_nio_materialized_view', '_nio_ci_match_report_workflow', '_nio_interactive' )
WRITE_MODE = 'overwrite'
AS
WITH customer_edges AS (
  SELECT DISTINCT
    z._rosetta_stone.graph_edge['source_id'] AS CUSTOMER_PERSON_ID,
    CONCAT(CAST(TRY_PARSE_JSON(z._rosetta_stone.graph_edge['target_id'])['soundex_first_name'] AS STRING), '::', CAST(addr_hash AS STRING)) AS ID,
    'soundex_first_name|libpostal_normalized_address_array' AS ID_TYPE
  FROM company_data.<CUSTOMER_DATASET_NAME> AS z
  CROSS JOIN UNNEST(CAST(TRY_PARSE_JSON(z._rosetta_stone.graph_edge['target_id'])['libpostal_normalized_address_array'] AS ARRAY<STRING>)) AS t (addr_hash)
  WHERE z._rosetta_stone.graph_edge['target_id_type'] = 'soundex_first_name|libpostal_normalized_address_array'
    AND addr_hash IS NOT NULL
)
SELECT CUSTOMER_PERSON_ID, ID, ID_TYPE FROM customer_edges
```

**`UNNEST` rejects `VARIANT`.** `TRY_PARSE_JSON(...)['libpostal_normalized_address_array']`
is a `VARIANT`, so it **must** be `CAST(... AS ARRAY<STRING>)` before
`UNNEST`, or the query fails with HTTP 422 *"Unsupported Type Error …
UNNEST(<VARIANT>)"*. Same for the scalar: `CAST(... AS STRING)` the
soundex before `CONCAT`.

**The matching `graph-edge-json` mapping** (customer-side, for reference;
authored via REST `?skip_validation=true` when it uses `TRY_PARSE_JSON`):
`target_id = TO_JSON(named_struct('soundex_first_name', SOUNDEX(<given_name>), 'libpostal_normalized_address_array', ADDRESS_HASHES(CONCAT_WS(char(10), <street>, <locality>, <region>, <postal>, 'US'))))`,
`target_id_type = 'soundex_first_name|libpostal_normalized_address_array'`,
both gated by a `CASE` so only name|address rows emit the edge.

## Step 2 — supplier edges (BLOCK, then explode)

**This is the one place the custom-key variant cannot be a naive
swap.** The partner AR is often hundreds of millions of
`person_name|postal_address` rows. `ADDRESS_HASHES` (the libpostal
normalizer) is a Snowflake **external function** — a remote service
called in 1,000-row batches — and it returns **HTTP 500 at high batch
volume** (see **SC-61797**). Exploding it over the full supplier slice
will hard-fail the run ~3 minutes in, and the error is currently
swallowed by the platform API.

So step 2 splits into **2a** (materialize the raw slice) and **2b**
(block to the customer's `(soundex, postal_code)` pairs, *then* hash the
survivors). Blocking on `(soundex_first_name, postal_code)` is standard
record-linkage; recall loss is negligible because same-person/same-
address rows share a zip. In practice this prunes a ~497M-row slice to
single-digit millions — comfortably under the `ADDRESS_HASHES` wall.

### Step 2a — raw name|address slice

```sql
CREATE OR REPLACE MATERIALIZED VIEW "<RUN_SLUG_UPPER>_STEP2A_SUPPLIER_NAMEADDR_SLICE"
DISPLAY_NAME = '<RUN_SLUG_UPPER>_STEP2A_SUPPLIER_NAMEADDR_SLICE'
DESCRIPTION = 'Step 2a: supplier name|address slice (raw person_id + identifier_value), pre-explode.'
EXPIRE = 'P1D'
TAGS = ( '_nio_materialized_view', '_nio_ci_match_report_workflow', '_nio_interactive' )
WRITE_MODE = 'overwrite'
AS
SELECT person_id, identifier_value
FROM <SUPPLIER_AR_TABLE>
WHERE identifier_type = 'person_name|postal_address'
```

Materializing the slice concretely means step 2b blocks + hashes over a
bounded table instead of re-scanning the full AR.

### Step 2b — block, then ADDRESS_HASHES + explode

```sql
CREATE OR REPLACE MATERIALIZED VIEW "<RUN_SLUG_UPPER>_STEP2B_SUPPLIER_COMPOUND"
DISPLAY_NAME = '<RUN_SLUG_UPPER>_STEP2B_SUPPLIER_COMPOUND'
DESCRIPTION = 'Step 2b (pruned): block name|address slice to customer (soundex, postal_code) pairs, THEN ADDRESS_HASHES + explode. Avoids ADDRESS_HASHES 500-at-scale (SC-61797).'
EXPIRE = 'P1D'
TAGS = ( '_nio_materialized_view', '_nio_ci_match_report_workflow', '_nio_interactive' )
WRITE_MODE = 'overwrite'
AS
WITH cust_keys AS (
  SELECT DISTINCT
    SOUNDEX(CAST(TRY_PARSE_JSON(IDENTIFIER_VALUE)['person_name']['given_name'] AS STRING)) AS sfn,
    CAST(TRY_PARSE_JSON(IDENTIFIER_VALUE)['postal_address']['postal_code'] AS STRING)       AS zip
  FROM company_data.<CUSTOMER_DATASET_NAME>
  WHERE IDENTIFIER_TYPE = 'person_name|postal_address'
),
supp AS (
  SELECT
    person_id,
    identifier_value,
    SOUNDEX(CAST(TRY_PARSE_JSON(identifier_value)['person_name']['given_name'] AS STRING)) AS sfn,
    CAST(TRY_PARSE_JSON(identifier_value)['postal_address']['postal_code'] AS STRING)       AS zip
  FROM company_data.<RUN_SLUG_LOWER>_step2a_supplier_nameaddr_slice
),
pruned AS (
  SELECT s.person_id, s.identifier_value, s.sfn
  FROM supp AS s
  INNER JOIN cust_keys AS c ON s.sfn = c.sfn AND s.zip = c.zip
)
SELECT DISTINCT
  person_id AS SUPPLIER_PERSON_ID,
  CONCAT(sfn, '::', addr_hash) AS ID,
  'soundex_first_name|libpostal_normalized_address_array' AS ID_TYPE
FROM pruned
CROSS JOIN UNNEST(ADDRESS_HASHES(CONCAT_WS(char(10),
    CAST(TRY_PARSE_JSON(identifier_value)['postal_address']['street_address'] AS STRING),
    CAST(TRY_PARSE_JSON(identifier_value)['postal_address']['address_locality'] AS STRING),
    CAST(TRY_PARSE_JSON(identifier_value)['postal_address']['address_region'] AS STRING),
    CAST(TRY_PARSE_JSON(identifier_value)['postal_address']['postal_code'] AS STRING),
    'US'))) AS t (addr_hash)
WHERE addr_hash IS NOT NULL
```

Notes:
- `TRY_PARSE_JSON` is required over the raw `identifier_value` JSON.
  `mapping_create` validates on Spark, which lacks `TRY_PARSE_JSON`, but
  the workflow runner and the NQL validator (Calcite → Snowflake) accept
  it. `GET_JSON_OBJECT` and colon/`JSON_EXTRACT` syntax are rejected by
  Calcite — do not substitute them.
- If the supplier AR instead exposes structured `soundex_first_name` /
  `libpostal_normalized_address_array` attributes (or the `graph-edge-json`
  shape), read those the way step 1 does and skip the `TRY_PARSE_JSON`
  extraction — but **keep the soundex+zip blocking before
  `ADDRESS_HASHES` regardless of scale.**

## Step 3 wiring

Step 3 joins `<RUN_SLUG_LOWER>_step2_supplier_edges` in the default
template. In the custom-key variant the supplier edges live in
`<RUN_SLUG_LOWER>_step2b_supplier_compound` instead — point step 3's
supplier `FROM` at the 2b table. The join predicate (`ON s.ID = c.ID
AND s.ID_TYPE = c.ID_TYPE`) is unchanged.

## Step 5 — report SQL unchanged, KPI labels reinterpreted

Do **not** touch the step-5 SQL or its `ATTRIBUTE_TYPE` rows. But when
you summarize (skill Phase 8), reinterpret the numbers:

- `APPROX_COUNT_DISTINCT(ID)` now counts **compound keys**, not
  identities, so `kpi_match_rate` (the *id*-based rate) is a
  compound-key overlap rate, not an identity match rate. **Trust the
  person-level numbers** (`match_totals.persons`,
  `kpi_match_rate_persons`) for the headline.
- The `ID_TYPE` bucket in `customer_identifiers_by_type` /
  `match_identifiers_by_type` reads
  `soundex_first_name|libpostal_normalized_address_array` — that is the
  compound-key channel's contribution.

## Multiple match keys (identifiers + compound key)

The strongest real-world report unions the `graph_edge` identifier
channel (email/phone) with a compound-key channel: each side is two MVs
(a `graph_edge` scan **and** a compound-key explode), `UNION ALL`-ed in
step 3, and the report breaks the match down per `ID_TYPE`. Because the
engine is generic over `(PERSON_ID, ID, ID_TYPE)`, this is purely
additive — no new join logic. A fully worked multi-key pipeline
(customer 41239 vs Audience Acuity and vs Verisk) lives in the
`customer-narrative-demos` repo at
`resources/workflows/{aa,verisk}-fuzzy-match-report.yaml` (and the
target_id-JSON variant at `verisk-fuzzy-match-report-targetid.yaml` —
the filenames predate this doc's terminology). In the Verisk run the
name+address compound key matched ~30.5K persons alongside email
(~34.4K) and phone (~29.8K) — comparable reach to the exact
identifiers.

## Caveats to surface to the user

1. **Compute cost.** The `UNNEST` fans out ~k× per side (one row per
   address hash). Combined with `ADDRESS_HASHES`, the supplier explode is
   the most expensive step in the run — which is exactly why steps 1/2
   are their own MVs: if a later step fails you re-run it without
   re-paying for the explode.
2. **Precision depends on the components.** A compound key is only as
   exact as its parts: soundex collapses distinct names to the same code
   and libpostal maximizes address recall, so the name+address key
   trades precision for reach — good for coverage estimates, not for a
   billing-grade identity join. Say so in the summary whenever a lossy
   component (soundex, hashes-with-recall-bias) is in the key.
3. **Tighter key (optional).** To cut false positives, add the family
   name to the compound type:
   `soundex_first_name|person_name.family_name|libpostal_normalized_address_array`
   (append `'::' , family_name` to the `ID` expression on both sides).

## Cleaner long-term path

As with the identity-only variant, the substitution-time surgery above
is the v0 approach. The clean solution is a dedicated
`assets/workflow.custom-key.yaml.tmpl` the skill selects by file path
from the Phase 1.5 match-key answer. Land that when the branching
outgrows ~30 lines of substitution.
