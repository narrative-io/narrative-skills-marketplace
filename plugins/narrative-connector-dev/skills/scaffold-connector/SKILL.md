---
name: scaffold-connector
description: |
  Generate the code skeleton for a new connector in whatever codebase
  hosts it, driven by connector-spec.yaml and a scaffold target: a
  template repo carrying a connector-scaffold.yaml manifest, an existing
  connector to clone conventions from, or a greenfield runtime profile
  (cloudflare-workers first). Derives the component set from the spec,
  copies and renames, wires build files — every change a reviewable
  working-tree diff.
  Use when: "scaffold the <slug> connector", "generate the connector
  modules", "stand up the connector project", "scaffold a connector in
  my repo", "start a connector from scratch".
  (narrative-connector-dev)
license: MIT
compatibility: >-
  Requires Bash, Read, Write, and Edit (or equivalent capabilities —
  these tools may be named differently across harnesses) for local
  codegen in a git working tree. Reads connector-spec.yaml; no infra,
  DB, or registration side effects. Recommends AskUserQuestion (prose
  fallback documented in the body). Runs on any agentskills.io-compliant
  harness.
metadata:
  version: 1.1.2
  narrative:
    args:
      - name: "<spec-path>"
        required: false
        description: >-
          Path to connector-spec.yaml. If omitted, the skill looks in
          the conventional location and asks when it can't find one.
    requires:
      tools:
        - Bash
        - Read
        - Write
        - Edit
    recommends:
      tools:
        - AskUserQuestion
      skills:
        - narrative-connector-dev:preflight-connector
        - narrative-connector-dev:create-scaffold-manifest
        - narrative-connector-dev:define-connector-interface
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Scaffold Connector

## Persona

You are a platform engineer who stands up new services inside existing
codebases for a living. You know that a scaffold's job is to disappear.
The generated skeleton should look like the repo's other connectors
wrote it, not like a generator did. You clone conventions; you never
invent them. When a layout question has no answer in the manifest, the
reference connector, or the runtime profile, you ask instead of
improvising. You keep scaffolding honest. Every file lands as an
uncommitted working-tree change the human reviews, and a gap you can't
fill correctly is marked as a gap, not papered over.

## Overview

Produce the connector's code skeleton so the implementation skills have
somewhere to write. What the connector *is* comes entirely from
`connector-spec.yaml`; where and how it materializes comes from the
spec's `target` block, which supports three modes:

- **`template-repo`** — the target repo carries a
  `connector-scaffold.yaml` manifest declaring its template, rename
  rules, component map, and build wiring
  ([`references/scaffold-manifest.md`](references/scaffold-manifest.md)).
  The manifest is authoritative; this skill executes it. Teams keep
  their conventions in their own repo; this skill ships none.
- **`reference-clone`** — no manifest; the user points at an existing
  connector in their repo and this skill infers the conventions from
  it, confirming the inferred plan before generating.
- **`greenfield`** — no repo at all; generate a fresh project from a
  bundled runtime profile
  ([`references/runtimes/`](references/runtimes/cloudflare-workers.md)).

In every mode the component set is the same portable model
([`references/connector-anatomy.md`](references/connector-anatomy.md)),
derived from the spec's delivery directions and auth model. Only the
materialization differs.

Phase in the plugin: **service** (the first code-generation step).

## When to use

Use this skill once a preflighted `connector-spec.yaml` exists and the
connector needs its code skeleton. Do NOT use for:

- **Authoring or validating the spec** — `/spec-connector` and
  `/preflight-connector` come first.
- **Filling in the generated skeleton** —
  `/define-connector-interface`, `/implement-partner-client`, and
  `/implement-delivery-executor` do that.
- **Infra, DB, or registration** — `/scaffold-connector-infra`,
  `/provision-connector-db`, `/register-connector-app`.

## Procedure

### Phase 1 — Load the spec, resolve the target

Locate `connector-spec.yaml`: the `<spec-path>` argument, else the
conventional `~/.narrative/projects/<slug>/connector-spec/` location,
else ask. The directory holding the spec is the **spec directory**
below. Confirm `slug`, `package_slug`, and `delivery.directions` carry
real values. A `TODO` in any of them means the spec isn't ready; stop
and hand back to `/preflight-connector`.

Read the spec's `target` block. If it's absent or incomplete, resolve
it with **one question at a time** (AskUserQuestion where available;
see Harness fallbacks):

1. **Mode.** Where should the connector live? Offer: an existing
   connectors repo with a scaffold manifest (`template-repo`); an
   existing repo, copying an existing connector's conventions
   (`reference-clone`); a brand-new project from a runtime profile
   (`greenfield`); plus a free-form **Other**.
2. **The mode's one follow-up.** `template-repo` /
   `reference-clone`: the repo path (and for reference-clone, which
   connector to copy). `greenfield`: which runtime profile — offer
   what exists under `references/runtimes/`.

Propose writing the resolved `target` block back to the spec, then
apply on approval.

### Phase 2 — Resolve the scaffold source

Per mode:

- **`template-repo`.** Read the manifest at `target.manifest_path`
  (default `<repo_path>/connector-scaffold.yaml`) and validate it
  against [`references/scaffold-manifest.md`](references/scaffold-manifest.md):
  known `schema_version`, a `template.path` that exists, non-empty
  `naming.rename`. A missing manifest is not an error to work around.
  Offer to fall back to `reference-clone`, or to hand off to
  `/create-scaffold-manifest` to author one (a one-time investment
  that makes every future connector scaffold repeatable).
- **`reference-clone`.** Inspect the reference connector's tree and
  the repo's build files. Infer: the unit layout and which portable
  component each unit serves, the naming pattern (how the reference's
  slug appears in paths, packages, and identifiers), and the wiring
  points (which build files mention the reference's units). Write the
  inferred conventions to `scaffold-plan.md` in the spec directory,
  using the manifest's own format, and **walk it with the user before
  generating**. Inference is a guess until confirmed. Once confirmed,
  offer to promote the plan to a durable `connector-scaffold.yaml`
  via `/create-scaffold-manifest` (seeded with `scaffold-plan.md`) so
  future scaffolds skip the inference step.
- **`greenfield`.** Read the runtime profile under
  `references/runtimes/` and ask where the new project directory
  should go. Ground the design in
  [`references/reference-architecture.md`](references/reference-architecture.md):
  the runtime behavior each component must eventually implement, and
  the variation axes (delivery channel, partner semantics, process
  topology, routing, app-UI hosting) to decide explicitly with the
  user. Follow the
  profile's generation rules, including its rule for stubbing
  platform-facing endpoints whose contract isn't yet published (the
  profile's **platform-contract gate**).

### Phase 3 — Derive the component set

From the spec, per the table in
[`references/connector-anatomy.md`](references/connector-anatomy.md):
`delivery.directions`, `auth.model`, and `destination_type` select the
components; the scaffold source's component map (manifest,
confirmed inference, or profile) says where each one lands. Present
the resulting plan as a short table — component, target unit, source
it's copied or seeded from — and get a yes before touching the tree.

Never generate a component the spec doesn't call for, and never skip
one it does. If the spec lists `measurement_ingestion` in its
directions and the target maps no poller, stop and ask; do not
silently omit it.

### Phase 4 — Generate

Execute the plan:

1. Copy the template tree (or instantiate the profile), applying the
   rename rules to paths and contents. Apply rename tokens longest
   first so a short token doesn't clobber a longer match, and stop on
   any collision with an existing path.
2. Apply the wiring edits, anchored to how the template's own entries
   look in each build file.
3. Create the per-connector docs the manifest's `docs` list (or the
   runtime profile) declares, seeding each from the template's
   counterpart when one exists.
4. Leave everything uncommitted. Show a summary of created and
   modified paths; never commit, and never overwrite an existing file
   without showing the diff first. Alongside the summary, propose the
   checkpoint commit message from
   [`references/git-conventions.md`](references/git-conventions.md)
   so the user can review and commit before the next skill runs.

### Phase 5 — Verify and hand off

- Run the scaffold source's `verify` command when one is declared
  (manifest `verify.command`, or the profile's check). Report failures
  verbatim. A scaffold that doesn't compile is a finding for the
  human, not something to quietly patch beyond obvious rename misses.
- Write back to the spec anything this phase resolved (the final
  `target` block, and the manifest path if the user accepted the
  Phase 2 offer to promote the confirmed plan via
  `/create-scaffold-manifest`).
- Summarize: components generated, units created, wiring applied,
  gaps marked (e.g. the greenfield platform-contract stubs).
- Hand off: suggest committing the reviewed scaffold
  ([`references/git-conventions.md`](references/git-conventions.md)),
  then `/define-connector-interface` next.

## Files this skill produces

```
<target repo or new project>/     # the generated skeleton, uncommitted
~/.narrative/projects/<slug>/connector-spec/
├── connector-spec.yaml           # updated: resolved target block
└── scaffold-plan.md              # reference-clone only: confirmed conventions
```

## Edge cases and gotchas

- **Dirty target working tree** — warn before generating; mixed diffs
  make the scaffold unreviewable. Offer to proceed anyway only if the
  user says so.
- **Connector already partially scaffolded** — rename collisions
  surface this; show what exists and ask whether to skip, replace, or
  abort. Never silently merge onto existing files.
- **Manifest and spec disagree** (e.g. the manifest maps a component
  the spec omits) — the spec wins on *what*, the manifest on *where*;
  say which rule resolved the conflict.
- **Reference connector is itself unconventional** — if the inferred
  conventions contradict the repo's other connectors, flag it and let
  the user pick the precedent before generating.
- **Greenfield platform-facing surface** — never invent it; follow the
  profile's platform-contract gate and record the `open_questions`
  entry the profile requires.

## Harness fallbacks

- **AskUserQuestion:** If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.

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
- **Blocking is skill-scoped.** An `open_questions` entry blocks only
  the skills its `blocks` list names. Before doing anything else, a
  skill checks the list: if any unanswered entry names it, it stops and
  says which questions block it; entries scoped to other skills are
  reported as context, never treated as a reason to stop or to hedge.
  A skill whose own required fields carry real values runs, whatever
  the overall preflight verdict says — the verdict summarizes the
  per-skill picture, it is not a global gate.
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
  # Present only when model is NOT oauth2 (static_credentials | jwt |
  # sftp_key | partner_id_header). Says what the customer supplies, how it
  # is presented on the wire, and what the profile row stores — the
  # static-credential equivalent of the `oauth` block.
  credentials:
    fields:                     # what the customer pastes into the profile form
      - { name: api_key, type: string, secret: true, purpose: "Customer-minted API key" }
    presentation: "Authorization: Bearer {api_key}"   # how it goes on the wire
    required_scopes: []         # vendor-side permissions the credential must carry
    verification_endpoint: null # a cheap call that proves the credential works
    rotation: customer_managed  # customer_managed | narrative_managed | none
  # Credentials WE issue to the PARTNER, for destinations that call us
  # (webhook receivers, postback URLs). The inverse of the blocks above:
  # here Narrative is the server being authenticated to. Omit when the
  # partner never calls us.
  inbound:
    mechanisms: []              # signature_verification | oauth2_client_credentials
                                # | shared_secret | mtls | none
    signature:                  # present when mechanisms includes signature_verification
      algorithm: null           # e.g. ecdsa_p256_sha256
      headers: []               # the header names carrying signature + timestamp
      signed_payload: null      # e.g. "timestamp + raw request body bytes"
      key_source: null          # how we obtain the partner's public key
    token_endpoint: null        # path WE host when the partner uses client-credentials
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
  failure_semantics: whole_batch  # whole_batch | row_level | async_job
                                  # async_job: the write returns 202 + a job id and
                                  # per-record outcomes are only available by polling
                                  # a status endpoint — the delivery response means
                                  # "queued", not "succeeded".
  job_status:                     # required when failure_semantics: async_job
    endpoint: null                # the status endpoint to poll
    terminal_states: []           # which states end the poll
    poll_guidance: null           # documented/observed cadence, or TODO

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
  # How the feed reaches us. bucket_inbox: the partner writes files into an
  # object-store inbox we own and a poll loop ingests them (the framework's
  # MeasurementFeedIngestionProcessor). partner_webhook: the partner PUSHES
  # events to an endpoint we expose — a receiver, not a poll loop, and the
  # `partition_layout` / `inbox_prefix` / `partner_access` fields below do
  # not apply. Defaults to bucket_inbox when omitted.
  ingestion_mode: bucket_inbox  # bucket_inbox | partner_webhook
  partition_layout: hive        # hive (dt=yyyyMMdd/) | date_path (YYYY/MM/DD/HH/)
  inbox_prefix: "<object-store>/<slug>/inbox/"
  partner_access: bucket_policy  # | assumed_role | static_keys
  host_app: poller              # which app runs the ingestion loop / receiver
  # Present only when ingestion_mode: partner_webhook. Auth for the inbound
  # call lives in `auth.inbound`; this block is the delivery contract.
  webhook:
    receiver_path: null         # the path we expose, e.g. "/<slug>/events"
    provisioning: customer_creates  # connector_creates (we register the webhook
                                    # via the partner's API) | customer_creates | either
    payload: null               # shape of one POST, e.g. "JSON array of event objects"
    dedupe_key: null            # the field that makes retries idempotent
    retry_policy: null          # partner-side retry behavior + the response we must return
    max_payload: null           # documented size cap, or TODO
    buffering: null             # how received events reach the dataset (e.g. batch to
                                # object store, then _NIO_COMMIT)
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
    blocks: [implement-partner-client]   # which skills cannot run until this
                                         # is answered. Skills not named here
                                         # proceed. Empty/absent = advisory,
                                         # blocks nothing.
  # A question that can be answered empirically carries a `probe` block.
  # /probe-partner-api executes the probe against a user-designated test
  # account and writes back `observed`. The `class` field governs the
  # gate: read_only probes run once the probe plan is approved,
  # reversible_write probes need a designated disposable account, and
  # account_hostile probes need per-probe opt-in.
  - question: "Is X-RateLimit-Reset an epoch timestamp or seconds-until-reset?"
    owner: partner
    status: "probe before implementing the client"
    blocks: [implement-partner-client]
    probe:
      class: read_only          # read_only | reversible_write | account_hostile
      request: "GET /v3/marketing/lists?page_size=1, twice, a few seconds apart"
      observe: "whether the header value tracks wall-clock time or counts down"
    observed:                   # written back by /probe-partner-api
      value: "delta seconds, counting down"
      date: 2026-07-22
      account: "vendor free-tier test account"
      closes: true              # false keeps the question open with the
                                # observation attached — right for rate
                                # limits and anything with compliance
                                # weight, where observed behavior is
                                # evidence, not a vendor commitment

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

# ── Deployment extension (optional) ─────────────────────────
# Stack-specific paths and tuning the infra, DB, registration, and
# deploy skills read. Values here are the target environment's, not the
# connector's; a scaffold target that doesn't need them omits the block.
# (Today these skills assume Narrative's stack; the values below are its
# defaults.)
deployment:
  migrations_path: "~/projects/db-migrations"   # prompted; may be a separate repo or a monorepo path
  modules_omitted: []          # rare tuning of the template's module set
```

Fields not yet known carry the literal `TODO` (or `null` where optional)
and are surfaced by `/preflight-connector` before any code is generated.
