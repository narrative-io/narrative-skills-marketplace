---
name: create-scaffold-manifest
description: |
  Author a repo's connector-scaffold.yaml — the manifest that teaches
  /scaffold-connector the repo's template, rename rules, component map,
  and build wiring. Two entry paths: infer the conventions from an
  existing reference connector (repo archaeology with human
  confirmation), or interview the user section by section when no clean
  exemplar exists. A per-repo, one-time onboarding job.
  Use when: "create a scaffold manifest", "write connector-scaffold.yaml",
  "onboard my repo for connector scaffolding", "infer connector
  conventions from my repo", "teach the scaffolder our repo layout".
  (narrative-connector-dev)
license: MIT
compatibility: >-
  Requires Bash, Read, and Write (or equivalent capabilities — these
  tools may be named differently across harnesses) to inspect the repo
  and write the manifest. No infra, DB, or registration side effects.
  Recommends AskUserQuestion (prose fallback documented in the body).
  Runs on any agentskills.io-compliant harness.
metadata:
  version: 1.0.1
  narrative:
    args:
      - name: "<repo-path>"
        required: false
        description: >-
          Path to the repo to onboard. If omitted, the skill asks.
      - name: "--reference <connector-dir>"
        required: false
        description: >-
          Directory (relative to the repo root) of the connector to
          infer conventions from. Selects the inference path without
          asking.
    requires:
      tools:
        - Bash
        - Read
        - Write
    recommends:
      tools:
        - AskUserQuestion
      skills:
        - narrative-connector-dev:scaffold-connector
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Create Scaffold Manifest

## Persona

You are an engineer who documents conventions by reading code, not by
asking people to remember them. Given a repo, you find the exemplar,
trace how its name appears in paths, packages, and build files, and
turn what you find into rules precise enough for a generator to
execute. Every rule you write carries its evidence. A convention you
can't confirm from the repo is a question for the user, never a guess,
and a manifest that only mostly works is worse than no manifest,
because the generator will follow it literally.

## Overview

Produce **`connector-scaffold.yaml`** at a repo's root: the artifact
that turns the repo into a `template-repo` scaffold target, so every
future `/scaffold-connector` run executes recorded conventions instead
of re-inferring them. This is a per-repo, one-time onboarding job, not
a per-connector step; run it once, then scaffold connectors against
the manifest indefinitely. Update the manifest only when the repo's
conventions change.

Two entry paths:

- **Infer** — the repo has a connector worth treating as exemplary.
  Read its tree and the repo's build files, derive each manifest
  section from evidence, and confirm with the user.
- **Interview** — no clean exemplar (a fresh repo, or one whose
  connectors all deviate from each other). Walk the manifest schema
  section by section, asking.

Most runs mix the two: infer what the repo shows, interview for what
it doesn't.

## When to use

Use this skill to onboard a repo that will host connectors, or when
`/scaffold-connector` found no manifest and handed off here. Do NOT
use for:

- **Scaffolding a connector** — that's `/scaffold-connector`; it can
  infer conventions inline for a one-off run without a manifest.
- **Editing one field of an existing manifest** — edit the file
  directly.
- **Speccing the connector itself** — `/spec-connector`.

## Procedure

### Phase 1 — Locate the repo, pick the entry path

Resolve the repo root from `<repo-path>` (ask if omitted; confirm it's
a git working tree). If a `connector-scaffold.yaml` already exists,
stop and ask: update it (walk the phases against the existing content)
or leave it alone. Never silently overwrite.

Then pick the entry path. With `--reference` given, inference is
selected and the exemplar named. Otherwise list the directories that
look like connectors and ask **one question** (AskUserQuestion where
available; see Harness fallbacks): which connector is the exemplar to
infer from, with an option for "none — interview me instead."

### Phase 2 — Gather the conventions

**Inference path.** Work through the exemplar with the repo's own
files as evidence:

1. **Template source.** The exemplar's directory set (every directory
   whose name derives from the exemplar's slug), plus what to exclude
   (build output, IDE files, anything gitignored).
2. **Rename rules.** Find every form the exemplar's name takes:
   dashed slug in paths, dash-dropped form in packages and
   identifiers, PascalCase in type names, display form in docs and
   config. Each observed form becomes one `naming.rename` entry
   mapped to its spec token.
3. **Component map.** For each portable component in
   [`../scaffold-connector/references/connector-anatomy.md`](../scaffold-connector/references/connector-anatomy.md),
   identify which of the exemplar's units serves it. A component with
   no obvious unit is a question, not an omission.
4. **Wiring.** Search the repo's build files for mentions of the
   exemplar's units; each file found becomes a `wiring` entry whose
   `edit` instruction describes mirroring the exemplar's entries in
   that file.
5. **Docs and verify.** The exemplar's per-connector docs become the
   `docs` list; the repo's cheapest compile-or-typecheck command for
   one connector becomes `verify.command`.

Record the evidence for each finding (file paths, one example each)
in a working notes file, `scaffold-manifest-notes.md`, next to the
manifest.

**Interview path.** Walk the same five areas in the same order, one
question at a time, grounding each question in what the repo does
show (even a fresh repo has a build tool and a language). Where the
user is designing conventions rather than reporting them, propose a
default from the manifest schema's example and let them adjust; for
layout decisions (how many units, what splits from what), the process
topology and variation axes in
[`../scaffold-connector/references/reference-architecture.md`](../scaffold-connector/references/reference-architecture.md)
are the design guide.

### Phase 3 — Validate before writing

Draft the manifest, then prove it executes:

- **Test the rename rules against the exemplar.** Scan the exemplar's
  paths and contents for every occurrence of each `from` value. Every
  occurrence must be one the generator should rename; a hit inside
  unrelated code means that rule needs narrowing. Then confirm that
  with the rules applied longest first, no rule matches text another
  rule already claimed.
- **Resolve every path.** `template.path`, each component unit, each
  `wiring[].file`, each doc — all must exist for the exemplar (or be
  confirmed intentional for interview-designed layouts).
- **Run `verify.command`** against the exemplar once, so a broken
  verify never ships in the manifest.
- **Check schema completeness** against the schema below: required
  sections present, `schema_version` current.

A validation failure is a finding to resolve with the user, not a
reason to soften the rule that caught it.

### Phase 4 — Review and write

Walk the draft with the user section by section, showing the evidence
from Phase 2 alongside each rule. On approval, write
`connector-scaffold.yaml` at the repo root (or the location the user
chooses; note that `/scaffold-connector` looks at the root by
default). Leave it uncommitted for review, alongside
`scaffold-manifest-notes.md`.

### Phase 5 — Hand off

- If a `connector-spec.yaml` is in play (the user came from
  `/scaffold-connector` or names one), propose recording the repo in
  its `target` block: `mode: template-repo`, `repo_path`, and
  `manifest_path` when the manifest isn't at the root.
- Suggest `/scaffold-connector` as the next step for the first
  connector built against the new manifest.

## Files this skill produces

```
<repo root>/
├── connector-scaffold.yaml       # the manifest, uncommitted
└── scaffold-manifest-notes.md    # evidence per rule; delete or keep at the user's option
```

## Edge cases and gotchas

- **Multiple exemplars that disagree** — surface the divergence and
  let the user pick the precedent; never average conventions.
- **The exemplar deviates from the repo's own norm** — if its
  siblings do something consistently different, flag it before
  encoding the deviation as the rule.
- **Slug forms that collide** — a slug whose dash-dropped form
  appears naturally in unrelated code (short names like `box`) makes
  content renames unsafe; scope the affected rule to paths, or
  narrow the `from` string, and record why.
- **Generated or vendored trees inside the template** — belong in
  `template.exclude`, not in the copy.
- **No compile command cheaper than building the whole repo** — leave
  `verify` out rather than encode a command too slow to run per
  scaffold; note the omission.

## Harness fallbacks

- **AskUserQuestion:** If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.

## The manifest contract

### Schema

```yaml
# connector-scaffold.yaml — at the template repo's root
schema_version: 1

# ── Template source ─────────────────────────────────────────
template:
  source: reference_connector    # reference_connector — copy a live connector
                                 # | template_dir — copy a dedicated template tree
  path: "acme-ads"               # directory to copy, relative to the repo root.
                                 # reference_connector: an existing connector kept
                                 # exemplary. template_dir: a tree of files that
                                 # already carry the rename tokens below.
  exclude:                       # globs inside `path` to skip when copying
    - "**/target/**"
    - "**/*.iml"

# ── Rename rules ────────────────────────────────────────────
# Every occurrence of `from` (in paths and file contents) becomes the
# named spec token. Order matters: longest / most specific first, so
# "acme-ads" doesn't clobber "acmeads" matches.
naming:
  rename:
    - { from: "acme-ads",  to: "{slug}" }
    - { from: "acmeads",   to: "{package_slug}" }
    - { from: "AcmeAds",   to: "{pascal_slug}" }
    - { from: "Acme Ads",  to: "{display_name}" }

# ── Component map ───────────────────────────────────────────
# Where each portable component (connector-anatomy.md) lives in this
# repo's layout. Values are unit paths relative to the repo root, with
# tokens applied. Omit a component the layout doesn't split out; two
# components may share a unit.
components:
  partner_client: "{slug}-services"
  delivery_executor: "{slug}-executor"
  service_api: "{slug}-api"
  credential_store: "{slug}-stores"
  background_worker: "{slug}-worker"
  measurement_poller: "{slug}-poller"   # generated only when the spec includes measurement_ingestion

# ── Build wiring ────────────────────────────────────────────
# Files outside the copied tree that need entries for the new units.
# `edit` is an instruction the generator follows, anchored to how the
# template's own entries look — the generator mirrors the entries it
# finds for `template.path` and proposes the diff for review.
wiring:
  - file: "build.sbt"
    edit: "add one module definition per generated unit, mirroring the template connector's entries, and add the units to the aggregate root"
  - file: "project/Publish.scala"
    edit: "register the new units' publish flags alongside the template connector's"

# ── Docs set ────────────────────────────────────────────────
# Per-connector docs to create, with tokens applied. The generator
# seeds each from the template connector's counterpart when one
# exists, otherwise from a minimal header.
docs:
  - "{slug}/README.md"
  - "{slug}/operations.md"

# ── Post-scaffold verification (optional) ───────────────────
verify:
  command: "sbt {package_slug}Api/compile"   # run after generation; failure
                                             # is reported, never auto-fixed
```

### Tokens

Tokens resolve from `connector-spec.yaml`:

| Token | Source | Example |
|---|---|---|
| `{slug}` | `slug` | `google-dv360` |
| `{package_slug}` | `package_slug` | `googledv360` |
| `{pascal_slug}` | derived from `slug`: capitalize each dash-separated part, drop the dashes | `GoogleDv360` |
| `{display_name}` | `display_name` | `Display & Video 360` |

### Rules for the generator

- **The manifest is authoritative.** When a manifest is present, follow
  it. Do not infer conventions the manifest already states, and do not
  improvise beyond it. A layout question the manifest doesn't answer is
  a question for the user, not a guess.
- **Stop on an unknown `schema_version`.** Report the mismatch and ask;
  never guess your way through a manifest written for a newer schema.
- **Wiring edits are proposals.** `wiring[].edit` instructions produce
  reviewable diffs anchored to the template's own entries. If the
  anchor can't be found (the template connector has no entry in that
  file), stop and ask.
- **Stop on rename collisions.** If applying `naming.rename` would
  overwrite an existing path in the repo, report and ask; the
  connector may already be partially scaffolded.

## Composition contract

This skill can run spec-free (onboarding a repo before any connector
is specced). When a spec exists, the `target` write-back in Phase 5
follows the contract below.

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
