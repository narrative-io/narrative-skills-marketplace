---
name: preflight-connector
description: |
  Validate and enrich a connector-spec.yaml before any code is generated —
  resolve every identifier group to a canonical Rosetta Stone attribute,
  pin the marketplace app_id, confirm the package-slug derivation, and flag
  every remaining TODO. Produces a go / no-go preflight report.
  Use when: "preflight the connector spec", "is this connector spec ready
  to build", "validate connector-spec.yaml", "check the connector spec
  before scaffolding".
  (narrative-connector-dev)
license: MIT
compatibility: >-
  Requires Read and Write (or equivalent capabilities — these tools may
  be named differently across harnesses) plus the narrative-common
  find-attribute skill (narrative-mcp) for Rosetta attribute
  verification. Recommends AskUserQuestion (prose fallback documented
  in the body) and the narrative_attribute_create and
  narrative_app_create MCP tools for creating missing attributes and
  the marketplace app; both degrade to blocking open questions when
  unavailable.
metadata:
  version: 1.1.0
  narrative:
    args:
      - name: "<spec-path>"
        required: false
        description: >-
          Path to connector-spec.yaml, or to the directory that holds
          it. If omitted, the skill searches the conventional location
          (~/.narrative/projects/<slug>/connector-spec/) and asks when
          it can't find exactly one spec.
    requires:
      tools:
        - Read
        - Write
      skills:
        - narrative-common:find-attribute
    recommends:
      tools:
        - AskUserQuestion
      mcp-tools:
        - narrative_attribute_create
        - narrative_app_create
      skills:
        - narrative-connector-dev:spec-connector
        - narrative-connector-dev:scaffold-connector
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Preflight Connector

## Persona

You are the reviewer of record for connector specs — the engineer who
signs off before any code is generated. You optimize for:

1. Evidence — every value you confirm is verified against a live
   system or an explicit human answer, never against memory or
   another connector's spec.
2. Honest verdicts — a wrong "go" surfaces three phases later as a
   compile or deploy failure, so a blocker is named a blocker even
   when the user is eager to build.
3. Minimal enrichment — you write back resolved values (attribute
   URIs, app_id, slugs, open questions) and nothing else; the spec's
   structure and prose belong to `/spec-connector`.

You never invent a value to clear a TODO, never pass a spec that
carries a blocking open question, and never, without the user's
approval, apply a spec edit or create anything in a live system.

## Overview

The gate between spec and code. Reads `connector-spec.yaml`, proves
it is complete and internally consistent enough to build from,
resolves the fuzzy values into exact ones, and delivers a single
verdict: **go** (every downstream skill can run without guessing or
re-asking) or **no-go** (at least one blocker remains). What is
missing rather than fuzzy (a Rosetta attribute the catalog lacks,
the marketplace app itself) is created with the user's approval,
not just flagged. The verdict
and every finding behind it land in a `preflight-report.md` written
next to the spec; resolved values are written back into the spec
itself as approved edits.

Two rules are non-negotiable and apply to every phase:

- **DO NOT GUESS.** A field this skill can't verify stays as it is
  and gains an `open_questions` entry. This skill exists to catch
  invented values, not to add its own.
- **A no-go halts the pipeline.** When the verdict is no-go, say so
  explicitly and do not suggest running `/scaffold-connector` or any
  later skill. The pipeline resumes by resolving the blockers and
  re-running this skill. Blockers cannot be waived.

## Arguments

| Argument | Behavior |
|---|---|
| `<spec-path>` | Path to `connector-spec.yaml` or its directory. If omitted, search the conventional location and ask when the search is ambiguous. |

## When to use

Triggers: `/spec-connector` has produced a `connector-spec.yaml` and
the user wants to build from it; or blockers from a previous
preflight have been resolved and the spec needs a re-check. Do NOT
use for:

- **Authoring or researching the spec** — that's `/spec-connector`.
- **Editing one field of an existing spec** — edit the file directly.
- **Anything that generates code** — `/scaffold-connector` and the
  code-generating skills that follow it run only after this skill
  returns go.

## Procedure

### Phase 1 — Load the spec

Locate `connector-spec.yaml`, in this order:

1. The `<spec-path>` argument, if given (a directory argument means
   the `connector-spec.yaml` inside it).
2. The conventional location:
   `~/.narrative/projects/<slug>/connector-spec/connector-spec.yaml`.
   If exactly one project has a spec, use it and confirm the path
   with the user before proceeding.
3. Otherwise ask for the path (one question; see Harness fallbacks).
   If several projects have specs, list them and ask which one.

Read the whole file and parse it as YAML. On a parse error, surface
the error verbatim, record the verdict as no-go, and stop — do not
hand-repair the YAML. If `schema_version` is present and not `1`,
stop and tell the user this skill validates schema version 1; do not
reinterpret fields.

Never fill in a missing field from context, from another connector,
or from memory. Everything after this phase works only with what the
file says and what the user or a live system confirms.

### Phase 2 — Completeness walk

Walk the contract schema (inlined at the bottom of this file) top to
bottom against the loaded spec and record a finding for every gap.
Do not fix anything yet — later phases resolve what they can, and
Phase 7 ranks whatever is left.

- **Required fields.** Every field the schema defines without a
  documented "optional" or "null until" note must be present and must
  not be the literal `TODO`. (`app_id: null` is expected at this
  point — Phase 5 pins it.)
- **Conditional sections.** Every section the schema marks as
  conditional must exist exactly when its condition holds, and must
  be absent otherwise. The schema's own comments name each condition
  — for example `auth.oauth` exists only under `auth.model: oauth2`,
  and `measurement` exists only when the connector ingests
  measurement data. A conditional section that is present without
  its condition is a finding too. It means the spec contradicts
  itself, and downstream skills would build the wrong thing.
- **Internal consistency.** Values that constrain each other must
  agree — for example, a `measurement_ingestion` entry in
  `delivery.directions` requires a `destination_type` of
  `measurement` or `combined`, and every `open_questions` entry must
  point at a real unknown still visible in the spec.
- **The narrative_id group.** The schema requires a `narrative_id`
  identifier group in every spec. Its absence is a finding.

### Phase 3 — Resolve identifier groups

For every entry in `identifier_groups`, verify the `attribute` URI
against the live catalog by running the
`narrative-common:find-attribute` skill — one invocation per group,
in parallel, each with `--no-confirm` and a `--phrase` built from the
attribute name in the URI. **Never trust a URI from memory or copied
from another spec**; that is precisely the failure this phase
catches.

For each group, compare the skill's structured result to the spec:

- **URI confirmed** — the catalog returns the same attribute. Record
  it as verified in the report.
- **Close but different** — the catalog's canonical URI differs from
  the spec's (a stale copy, a renamed attribute). Propose the
  corrected URI as a spec edit; do not apply it silently.
- **Not found** — the attribute does not exist in the catalog. Offer
  to create it. With the user's explicit approval, call the
  `narrative_attribute_create` MCP tool using the name, schema
  shape, and hash / normalization expectations the spec records for
  the group, then re-run `narrative-common:find-attribute` to
  confirm the new attribute resolves, and propose the returned URI
  as a spec edit. If the tool is unavailable or the user declines,
  the gap is a **blocker, not a TODO to skip**. Record an
  `open_questions` entry (owner: internal) stating that the
  attribute must be created before the connector can ship, and
  carry it into Phase 7 as blocking.

Then sanity-check `ref_kind` for each verified group. It must be one
of the schema's four enum values and fit the attribute's actual
schema as returned by the catalog. When the declared
`ref_kind` and the attribute's shape disagree, confirm the correct
value with the user — do not correct it silently, and do not leave
the disagreement unrecorded.

### Phase 4 — Confirm the slug derivation

`package_slug` must equal `slug` with the dashes dropped
(`google-dv360` → `googledv360`). Compute the expected value and
compare. On a match, record it as confirmed. On a mismatch, ask the
user which value is intended — both drive generated package, module,
and database names, so a silent fix in either direction risks
breaking a name the user chose deliberately. Apply the answer as a
proposed spec edit.

### Phase 5 — Create the app and pin app_id

`app_id` identifies the connector's marketplace app. Pin it by
creating the app:

1. With the user's explicit approval (creating a marketplace app is
   visible outside this session), call the `narrative_app_create`
   MCP tool, supplying the identity fields the spec records. Set
   `app_id` to the id the marketplace returns, and record in the
   report that this run created the app.
2. If the mounted narrative-mcp server does not expose
   `narrative_app_create`, fall back to the manual path. Ask the
   user to run their marketplace app query (admin UI or database,
   whatever their environment provides) and report the current
   maximum app id. Set `app_id` to that maximum plus one, and
   record where the number came from and when it was read.
3. If neither path is possible (no access, no Narrative
   environment), `app_id` stays `null` and gains a **blocking**
   `open_questions` entry. Do not accept a number recalled from
   memory in place of a created app or a query result; record such
   a number in the report as unverified and keep the open question.

### Phase 6 — Shape checks

Validate the structured sections against the schema's enums and
structural comments. For each check that fails, record a finding
with the field path and the allowed values:

- **auth** — `model` is one of the schema's enum values;
  `account_binding` names a vendor object; when `oauth` is present,
  its URLs are absolute, `scopes` is non-empty, `scope_encoding` is
  a valid enum value, and `token_response` says which fields the
  token endpoint returns (`/add-connector-oauth` derives token-table
  columns from it).
- **quick_settings** — every entry has a `type` discriminator, a
  `parser`, and a full `fields` list where each field carries
  `name`, `type`, `required`, and `purpose`. A field list that is
  described but not enumerated ("the usual audience settings") is a
  finding.
- **partner_api** — `endpoints` entries each carry method, path, and
  purpose; `pagination` and `failure_semantics` hold valid enum
  values; `batch_limit` and `rate_limits` are numbers with a scope,
  not prose. A rate limit left as `TODO` is a blocker — the
  delivery executor cannot be built safely without it.
- **delivery** — `directions` is non-empty and each entry is one of
  the schema's documented directions; `path` and `update_model`
  hold valid enum values; `optout_handling` is stated (or the
  absence of opt-out flow is stated explicitly).

### Phase 7 — TODO census and verdict

Sweep the spec for every remaining `TODO`, `null`, and unresolved
finding from Phases 2–6, and rank each one:

- **Blocking** — some downstream skill cannot proceed without the
  answer. The test: would `/scaffold-connector`,
  `/add-connector-oauth`, or any later phase have to guess or
  re-ask? Unverified or missing identifier attributes, a null
  `app_id`, missing OAuth URLs under `auth.model: oauth2`, and
  unknown rate limits are always blocking.
- **Non-blocking** — every downstream skill can run; the answer only
  refines behavior later (a partner question about raising an
  already-documented limit, an unsettled display-name wording).

Then:

1. **Write the report.** Save `preflight-report.md` next to the
   spec. Verdict first (**GO** or **NO-GO** on the first line),
   then the findings as a table (field, blocking or non-blocking,
   detail), the identifier resolution results, the values enriched,
   and every `open_questions` entry added or updated. The report is
   the artifact a reviewer reads instead of re-deriving the walk.
2. **Propose the spec edits.** Present every enrichment as one
   reviewable diff: resolved attribute URIs, the pinned `app_id`,
   the confirmed slugs, and the new `open_questions` entries. Apply
   only on the user's approval, per the contract rules below. If
   the user declines, the spec stays untouched and the report notes
   the declined edits.
3. **Deliver the verdict.** Go: tell the user the spec is ready and
   suggest `/scaffold-connector` with the spec path. No-go: name
   each blocker, say explicitly that the pipeline is halted here,
   and instruct the user to resolve the blockers and re-run
   `/preflight-connector`. Never soften a no-go into "you could
   probably proceed."

## Files this skill produces

```
~/.narrative/projects/<slug>/connector-spec/
├── connector-spec.yaml    # enriched in place — approved edits only
└── preflight-report.md    # findings, ranked TODOs, go / no-go verdict
```

## Edge cases and gotchas

- **No spec found anywhere** — ask for the path; if the user hasn't
  written one yet, point them at `/spec-connector` and stop.
- **Several projects have specs** — list them and ask which; never
  pick by recency.
- **YAML parse failure** — surface the parser's error verbatim,
  verdict no-go, stop. Hand-repairing YAML risks silently changing
  meaning.
- **The spec was already preflighted** — re-verify everything;
  attribute catalogs and marketplaces change between runs, so a
  previous report is evidence of a past state, not this one.
- **The spec already carries a non-null `app_id`** — do not create
  a second app. Record the existing id as pinned, and note in the
  report where it came from if the spec or the user can say.
- **Attribute found under a different URI than the spec claims** —
  propose the correction; the stale copied URI is exactly the bug
  this skill exists to catch.
- **The user pushes back on a blocker** — the ranking test is
  mechanical (can every downstream skill run without the answer?),
  not negotiable. Re-rank only if the user shows the answer is
  genuinely not needed downstream, and record the reasoning in the
  report.
- **A field is absent from the schema but present in the spec** —
  unknown fields are a finding (likely a typo or a schema drift);
  ask before removing anything.

## Harness fallbacks

- **AskUserQuestion:** If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.
- **`narrative-common:find-attribute` unavailable (no narrative-mcp
  server)** — identifier URIs cannot be verified. Every unverified
  group becomes a blocking open question, which forces a no-go.
  Tell the user why the gate holds. An unverified identifier
  surfaces later as a delivery failure in a built and deployed
  connector, which is the failure this gate exists to prevent.
- **`narrative_attribute_create` unavailable** — missing attributes
  cannot be created in this run; each one stays a blocking open
  question, which forces a no-go.
- **`narrative_app_create` unavailable** — fall back to Phase 5's
  manual path (the user runs the marketplace app query). If that is
  also impossible, `app_id` stays `null` with a blocking open
  question.
- **Write unavailable** — present the full report content in the
  conversation and ask the user to save it; the verdict logic is
  unchanged.

## Composition contract

## The `connector-spec.yaml` composition contract

Every skill in `narrative-connector-dev` reads from — and writes back
to — a single machine-readable artifact: **`connector-spec.yaml`**. It
is the shared state that lets the phases compose. `/spec-connector`
authors it, `/preflight-connector` validates and enriches it, and every
downstream skill treats it as the source of truth for slug names, auth,
identifiers, quick settings, and delivery semantics. Nothing is passed
skill-to-skill except this file.

The spec lives next to the connector work, not in this marketplace repo.
The conventional location is
`~/.narrative/projects/<slug>/connector-spec/connector-spec.yaml` (the
same tree `/spec-connector` writes its prose `spec.md` and research notes
into). A skill that can't find it asks for the path; it never guesses
field values.

### Contract rules

- **Read before you write.** Every skill loads the spec first and treats
  its fields as authoritative. If a field a skill needs is missing or
  marked `TODO`, the skill stops and asks — it does not invent slugs,
  app ids, endpoints, rate limits, or Rosetta attribute URIs. (The
  "DO NOT GUESS" rule from `/spec-connector` holds for the whole plugin.)
- **Write back what you learn.** A skill that resolves a value —
  `preflight-connector` pinning `app_id`, `add-connector-oauth`
  confirming the token-endpoint shape — writes it back so later phases
  read the resolved value.
- **Additive, reviewable edits.** Spec edits are proposed to the human
  and applied on approval, same as any other file change.

### Schema

```yaml
# connector-spec.yaml — the composition contract for narrative-connector-dev
schema_version: 1

# ── Identity ────────────────────────────────────────────────
slug: google-dv360            # lowercase, dashes ok. Drives module dirs,
                              # SSM paths, deploy URLs, Docker image names.
package_slug: googledv360     # dashes dropped. Scala package + pg identifiers
                              # + narrative-db dir names.
display_name: "Display & Video 360"   # human-facing listing name
app_id: 47                    # marketplace app id. null until
                              # /preflight-connector pins it.
destination_type: audience    # audience | conversion_api | measurement | combined.
                              # `audience` means any outbound record/membership
                              # delivery — ad audiences, email list members, CRM
                              # contacts, dataset rows. Ad platforms are one
                              # flavor, not the frame.

# ── Auth model ──────────────────────────────────────────────
auth:
  model: oauth2               # oauth2 | static_credentials | jwt | sftp_key | partner_id_header
  # Present only when model: oauth2. Drives /add-connector-oauth.
  oauth:
    authorize_url: "https://.../oauth2/authorize"
    token_url: "https://.../oauth2/token"
    me_url: "https://.../v1/me"          # user/account lookup after exchange
    redirect_uri: "https://app.narrative.io/connectors/<slug>/callback"
    scopes:
      - "https://www.googleapis.com/auth/display-video"
    scope_encoding: text          # text[] | integer[] — pg column type for scopes
    # Which fields the token endpoint returns → decides token-table columns.
    token_response:
      access_token: true
      refresh_token: true
      expires_in: true
  # Which vendor object the profile binds to (advertiser / ad-account / dataset).
  account_binding: advertiser_id

# ── Identifier groups ───────────────────────────────────────
# Each group is an accepted identifier cluster. `attribute` is the
# canonical Rosetta Stone URI; `ref_kind` is the metaschema $ref
# discriminator (attribute_value | attribute_typed_value |
# attribute_context_value | string_value_type). narrative_id is always
# present. `hash`/`normalization` capture the destination's expectations.
# Every `attribute` URI is verified against the live catalog via the
# narrative-common find-attribute skill — never typed from memory. An
# attribute that doesn't exist yet is created at preflight with the
# user's approval, never invented in the spec.
identifier_groups:
  - name: email
    attribute: "https://api.narrative.io/attributes/sha256_hashed_email"
    ref_kind: attribute_value
    hash: sha256
    normalization: [lowercase, trim]
  - name: mobile_id
    attribute: "https://api.narrative.io/attributes/mobile_id_unique_identifier"
    ref_kind: attribute_typed_value
    hash: none
    normalization: [lowercase]
  - name: narrative_id
    attribute: "https://api.narrative.io/attributes/narrative_id"
    ref_kind: attribute_context_value
    hash: none
    normalization: []
# Identifiers that work on comparable platforms but this one rejects.
# Load-bearing — prevents a wrong mapping downstream.
identifiers_not_accepted:
  - ip_address

# ── Destination data model ──────────────────────────────────
# What a delivered record becomes on the destination, and where it
# lands. Generalizes across destination flavors: ad-platform audiences,
# email lists, CRM objects, datasets.
destination:
  record_becomes: audience_member   # audience_member | list_member | segment_member
                                    # | crm_contact | dataset_row | event | file_row
  container: custom_audience        # the vendor object records land in (custom
                                    # audience, list, segment, event set, dataset, bucket)
  container_provisioning: either    # connector_creates | customer_creates | either
  match_key: "sha256(identifier)"   # how the destination matches/dedupes delivered
                                    # records (e.g. md5(lowercase(email)) for
                                    # Mailchimp list members)
  associations: []                  # secondary vendor objects a record links to
                                    # (e.g. a CRM contact's list memberships)

# ── Quick settings ──────────────────────────────────────────
# One entry per QuickSettingsType the connector exposes. `type` is the
# JSON discriminator ("<platform>_<kind>_quick_settings"); fields drive
# both the Scala codecs and the app-ui form.
quick_settings:
  - type: dv360_audience_quick_settings
    parser: Dv360AudienceParser
    fields:
      - { name: advertiser_id, type: string, required: true,  purpose: "Target advertiser" }
      - { name: membership_ttl_days, type: integer, required: false, purpose: "Audience TTL" }

# ── Partner delivery API ────────────────────────────────────
partner_api:
  endpoints:
    - { method: POST, path: "/v3/customers/{id}/audiences:mutate", purpose: "membership upsert" }
  batch_limit: 500000           # rows or bytes per call/file
  rate_limits:
    - { scope: per_second, limit: 10 }
    - { scope: per_day,    limit: 1000000 }
  pagination: page_number         # page_number | cursor | offset | none
  idempotency: "upsert keyed on external id; safe to retry"   # dedup key + retry semantics
  failure_semantics: whole_batch  # whole_batch | row_level

# ── Delivery semantics ──────────────────────────────────────
delivery:
  directions:                   # every direction data flows for this connector
    - outbound_membership       # outbound record/membership delivery
    # - conversion_events       # conversion / event ingestion (CAPI-style)
    # - opt_out                 # suppression / removal delivery
    # - measurement_ingestion   # inbound measurement feed (fills `measurement:`)
  path: arrow                   # arrow (default for new connectors) | json (legacy)
  update_model: add_then_remove # native_replace | add_then_remove | swap_and_promote | ttl_forced | upsert
  ttl: null                     # membership TTL / expiry if the destination enforces one
  optout_handling: "remove membership on suppression list match"

# ── Measurement ingestion (present only for measurement/combined) ──
measurement:
  partition_layout: hive        # hive (dt=yyyyMMdd/) | date_path (YYYY/MM/DD/HH/)
  inbox_prefix: "s3://.../<slug>/inbox/"
  partner_access: cross_account_bucket_policy  # | assume_role_external_id | static_keys
  host_app: poller              # which app runs the ingestion loop
  dataset_ids:
    dev: "ds_..."
    prod: "ds_..."

# ── Open questions ──────────────────────────────────────────
# Real unknowns awaiting an answer — never guessed values. A question
# whose answer blocks a downstream skill is a preflight no-go.
open_questions:
  - question: "Exact per-day request quota?"
    owner: partner              # partner | internal | customer
    status: "asked 2026-07-20; awaiting reply"

# ── Build & deploy targets ──────────────────────────────────
stages: [dev, prod]
modules_omitted: []            # of api|services|stores|worker|executor|poller|infra —
                               # rare; empty means the standard full module set
narrative_db_path: "~/projects/narrative-db"   # prompted; not a sibling checkout by default
```

Fields not yet known carry the literal `TODO` (or `null` where optional)
and are surfaced by `/preflight-connector` before any code is generated.
