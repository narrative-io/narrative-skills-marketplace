---
name: add-measurement-ingestion
description: |
  Wire the framework measurement-feed engine into a connector — scan a
  partner S3 inbox, copy new files into a Narrative dataset ingestion
  folder, write _NIO_COMMIT, and dedup so files are never copied twice —
  driven by the measurement block of connector-spec.yaml.
  Use when: "add measurement ingestion to the connector", "ingest the
  partner measurement feed", "wire up the S3 inbox scan", "pull conversion
  feedback files".
  (narrative-connector-dev)
license: MIT
compatibility: >-
  Stub — implementation pending. Mostly local codegen, but creates a
  dataset, a cross-repo DB migration, and an inbox-bucket terraform module
  at human gates. Reads the measurement block of connector-spec.yaml.
  Recommends AskUserQuestion. Runs on any agentskills.io-compliant harness.
metadata:
  version: 0.1.0
  narrative:
    recommends:
      skills:
        - narrative-connector-dev:scaffold-connector
        - narrative-connector-dev:provision-connector-db
        - narrative-connector-dev:scaffold-connector-infra
      tools:
        - AskUserQuestion
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Add Measurement Ingestion

> **Status: stub — implementation pending.** Contract only. Consolidates
> `narrative-connectors/.claude/skills/add-measurement-feed-ingestion`.

## Purpose

Give a connector an inbound measurement/conversion-feedback path: the
generic framework measurement-feed engine scans a partner S3 inbox bucket
we own, copies new files verbatim into a Narrative dataset ingestion
folder, writes `_NIO_COMMIT`, and dedups against an idempotency table so
nothing is copied twice.

Phase: **service** (+ DB + infra + deploy-verify at gates).

## Inputs (from connector-spec.yaml `measurement`)

- `partition_layout` (hive `dt=yyyyMMdd/` vs date_path `YYYY/MM/DD/HH/`) +
  `inbox_prefix`.
- `partner_access` (cross-account bucket policy / assume-role+external-id /
  static keys).
- `dataset_ids` (dev + prod), `host_app` (poller recommended).

## Outputs

- `MeasurementFeed` config + Resources wiring; a poller fiber
  (`runForever`).
- `measurement_feed_ingestion` idempotency-table migration (cross-repo).
- A `measurement-feed` terraform module (inbox bucket + hardening + partner
  access + worker read grant).

## Human gates

- **Dataset creation** (dev + prod) — pause and confirm.
- **Cross-repo DB migration** + `shared-db-migrations` pin bump — confirm.
- **terraform apply** for the inbox bucket + partner access — gated at
  `/deploy-connector`.
- Verify step uploads a sample file and watches for the
  `writing commit file` success line.

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
slug: google-dv360            # lowercase, dashes ok. Drives directory names,
                              # deploy names, image names.
package_slug: googledv360     # dashes dropped — the identifier-safe variant
                              # for code packages and database identifiers.
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
# One entry per quick-settings type the connector exposes. `type` is the
# JSON discriminator ("<platform>_<kind>_quick_settings"); fields drive
# both the connector's codecs and the settings form.
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

# ── Scaffold target ─────────────────────────────────────────
# Where connector code materializes. The rest of the spec says what the
# connector is; `target` says where and how it gets built.
# /scaffold-connector resolves this block (asking when absent) and
# writes it back; the implementation skills read it to know which
# working tree and conventions they operate in.
target:
  mode: template-repo         # template-repo | reference-clone | greenfield
  repo_path: "~/dev/my-connectors"   # working tree for template-repo / reference-clone
  manifest_path: null         # template-repo: scaffold-manifest location; null means
                              # <repo_path>/connector-scaffold.yaml
  reference_connector: null   # reference-clone: path (inside repo_path) of the
                              # existing connector to copy conventions from
  runtime: null               # greenfield: runtime profile (cloudflare-workers)

# ── Build & deploy stages ───────────────────────────────────
stages: [dev, prod]

# ── Narrative-internal extension (optional) ─────────────────
# Read only by skills that operate inside Narrative's own environment
# (DB provisioning, app registration, listing, deploys). Builders
# outside Narrative omit the whole block; the portable skills never
# require it.
internal:
  narrative_db_path: "~/projects/narrative-db"   # prompted; not a sibling checkout by default
  modules_omitted: []          # rare tuning of the internal template's module set
```

Fields not yet known carry the literal `TODO` (or `null` where optional)
and are surfaced by `/preflight-connector` before any code is generated.
