---
name: scaffold-connector-infra
description: |
  Generate the connector's <slug>-infra terraform (ECS service, ECR, security
  groups, IAM) and CI workflows from connector-spec.yaml — writing the plans
  locally without applying them.
  Use when: "scaffold the connector infra", "generate the terraform for the
  connector", "add the CI workflows for the connector", "set up the ECS
  service for the connector".
  (narrative-connector-dev)
license: MIT
compatibility: >-
  Stub — implementation pending. Writes terraform + CI locally in the
  narrative-connectors working tree; does NOT run terraform apply (that is
  /deploy-connector). Reads connector-spec.yaml. Recommends AskUserQuestion.
  Runs on any agentskills.io-compliant harness.
metadata:
  version: 0.1.0
  narrative:
    recommends:
      skills:
        - narrative-connector-dev:scaffold-connector
      tools:
        - AskUserQuestion
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Scaffold Connector Infra

> **Status: stub — implementation pending.** Contract only. Consolidates
> the `<slug>-infra` + CI generation from `create-connector`.

## Purpose

Generate the connector's infrastructure-as-code: the `<slug>-infra`
terraform (ECS service, ECR repo, security groups, IAM roles/policies) and
the CI workflows that build and publish it. This skill *writes* the plans;
it deliberately does not *apply* them.

Phase: **infra**.

## Inputs (from connector-spec.yaml)

- `slug` — resource names, ECR repo, image, service names.
- `auth`, `measurement` presence — extra IAM (KMS/SSM) and bucket-access
  statements.
- `stages` — which environments to template.

## Outputs

- `<slug>-infra/` terraform modules.
- The connector's CI workflows.

## Human gates

- **No `terraform apply` here.** `terraform plan` for review only; applies
  are owned by `/deploy-connector`.
- The one-time **shared-ECR apply** (when a connector's first image needs a
  new shared repo) is a hard human gate — flagged, not run.

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
