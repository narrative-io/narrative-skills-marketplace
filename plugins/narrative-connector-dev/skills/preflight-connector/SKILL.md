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
  Stub — implementation pending. No hard requirements: a read-and-enrich
  skill over connector-spec.yaml; no infra or destructive ops. Recommends
  the narrative-common find-attribute skill for Rosetta resolution and
  AskUserQuestion for confirmations. Runs on any agentskills.io harness.
metadata:
  version: 0.1.0
  narrative:
    recommends:
      skills:
        - narrative-connector-dev:spec-connector
        - narrative-common:find-attribute
      tools:
        - AskUserQuestion
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Preflight Connector

> **Status: stub — implementation pending.** Contract only; phased body
> authored in follow-up work. Consolidates the pre-build validation logic
> currently spread across `product-build-connector-spec` (spec completeness
> bar) and `create-connector` (app_id + package-slug + identifier-group
> derivation) in the sibling repos.

## Purpose

The gate between spec and code. Reads `connector-spec.yaml` and proves it
is complete and internally consistent enough to generate a connector from
— so the service, infra, and registration skills never run off a
half-specified contract. Resolves the fuzzy parts of the spec into the
exact values downstream skills need, and refuses to pass anything with an
unresolved `TODO` in a required field.

Phase: **spec** (the last spec-phase step before scaffolding).

## Inputs (from connector-spec.yaml)

- `identifier_groups[].attribute` — each canonical Rosetta URI is resolved
  and verified (delegates to `/find-attribute`); the `ref_kind`
  discriminator is checked against the attribute's shape.
- `slug` / `package_slug` — confirms the de-dashing derivation.
- `app_id` — pins it to `max(existing app id) + 1` (the human runs the
  marketplace query; the skill records the result).
- `auth`, `quick_settings`, `partner_api`, `delivery` — presence and
  shape checks.

## Outputs (writes back to the spec)

- An enriched `connector-spec.yaml` with resolved attribute URIs, pinned
  `app_id`, and confirmed slugs.
- A **preflight report**: a ranked list of every remaining `TODO`,
  blocking vs non-blocking, with a single go / no-go verdict.

## Human gates

- Read-only against live systems — proposes spec edits, applies on
  approval.
- **No-go stops the pipeline.** A blocking `TODO` (unresolved identifier,
  missing app_id, unknown rate limit) halts here rather than surfacing as
  a compile or deploy failure three phases later.

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
app_id: 47                    # marketplace app id — max(id)+1 over existing
                              # apps. TODO until /preflight-connector pins it.
destination_type: audience    # audience | conversion_api | measurement | combined

# ── Auth model ──────────────────────────────────────────────
auth:
  model: oauth2               # oauth2 | static_credentials | sftp_key | partner_id_header
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
  failure_semantics: whole_batch  # whole_batch | row_level

# ── Delivery semantics ──────────────────────────────────────
delivery:
  path: arrow                   # arrow (default for new connectors) | json (legacy)
  update_model: add_then_remove # native_replace | add_then_remove | swap_and_promote | ttl_forced
  ttl: null                     # audience TTL if the destination enforces one
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

# ── Deploy targets ──────────────────────────────────────────
stages: [dev, prod]
narrative_db_path: "~/projects/narrative-db"   # prompted; not a sibling checkout by default
```

Fields not yet known carry the literal `TODO` (or `null` where optional)
and are surfaced by `/preflight-connector` before any code is generated.
