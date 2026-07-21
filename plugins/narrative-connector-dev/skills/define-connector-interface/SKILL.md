---
name: define-connector-interface
description: |
  Define the connector's data contract — the audience metaschema, the
  QuickSettingsType / ParserType enums and codecs, the identifier-group
  attribute metaschema with correct $ref kinds, and the collaboration
  policy — all generated from connector-spec.yaml.
  Use when: "define the connector interface", "generate the audience
  metaschema", "wire up the quick settings types", "build the collaboration
  policy for the connector".
  (narrative-connector-dev)
license: MIT
compatibility: >-
  Stub — implementation pending. No hard requirements: local codegen of
  schema/codec files in the narrative-connectors working tree; no infra or
  destructive ops. Reads connector-spec.yaml. Recommends the narrative-common
  find-attribute skill. Runs on any agentskills.io-compliant harness.
metadata:
  version: 0.1.0
  narrative:
    recommends:
      skills:
        - narrative-connector-dev:scaffold-connector
        - narrative-common:find-attribute
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Define Connector Interface

> **Status: stub — implementation pending.** Contract only. Consolidates
> the schema/type half of `create-connector` — `audience-metaschema.json`,
> `<Slug>QuickSettingsType` / `<Slug>ParserType` codecs, the identifier
> metaschema `$ref`-kind handling, and the collaboration policy structure.

## Purpose

Turn the spec's abstract identifier and quick-settings declarations into
the concrete Scala/JSON contract the connector serializes against. This is
where the `ref_kind` discriminator matters: `attribute_value` vs
`attribute_typed_value` vs `attribute_context_value` vs `string_value_type`
each generate a different metaschema `$ref`.

Phase: **service** (runs alongside `/scaffold-connector`).

## Inputs (from connector-spec.yaml)

- `identifier_groups[]` — `attribute` (canonical Rosetta URI), `ref_kind`,
  `hash`, `normalization`. Drives the audience metaschema and collaboration
  policy `required[]` / `anyOf[]` blocks.
- `quick_settings[]` — `type` discriminator, `parser`, and `fields[]`.
  Drives the QuickSettingsType/ParserType enums and codecs.

## Outputs

- `audience-metaschema.json`.
- `<Slug>QuickSettingsType` / `<Slug>ParserType` enums + JSON codecs.
- The connector's collaboration policy JSON (identifier-group structure).

## Human gates

- Local codegen only — reviewable working-tree changes.
- Attribute URIs are taken from the spec (already resolved by
  `/preflight-connector`); this skill does not invent or re-guess them.

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
