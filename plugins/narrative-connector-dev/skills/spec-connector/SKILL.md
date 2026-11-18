---
name: spec-connector
description: |
  Research and author a connector spec for a new destination platform —
  interview, prior-art recon, vendor-doc research, and a differentiator
  walk across five axes (auth, destination data model, identifiers and
  matching, sync semantics, operational constraints) — then emit the
  machine-readable connector-spec.yaml the rest of the plugin builds
  from, plus a prose spec.md. Identifiers, rate limits, and data-removal
  semantics are never guessed; unknowns become partner questions.
  Use when: "spec out a connector for <platform>", "start a new
  connector", "research the <platform> connector", "write the connector
  spec", "draft connector-spec.yaml".
  (narrative-connector-dev)
license: MIT
compatibility: >-
  Requires Bash, Read, Write, WebFetch, and WebSearch (or equivalent
  capabilities — these tools may be named differently across harnesses)
  for vendor-doc research, plus the narrative-common find-attribute skill
  (narrative-mcp) for Rosetta attribute verification. Recommends
  AskUserQuestion (prose fallback documented in the body), the
  narrative-knowledge-base MCP server for prior-art recon, and the
  Shortcut or Notion MCP servers for publishing the finished spec —
  all degrade gracefully when absent.
metadata:
  version: 1.3.0
  narrative:
    args:
      - name: "<platform>"
        required: false
        description: >-
          The destination platform to spec (e.g. mailchimp, hubspot,
          snapchat). If omitted, the skill asks first.
    requires:
      tools:
        - Bash
        - Read
        - Write
        - WebFetch
        - WebSearch
      skills:
        - narrative-common:find-attribute
    recommends:
      tools:
        - AskUserQuestion
      skills:
        - narrative-connector-dev:preflight-connector
      mcp-servers:
        - narrative-knowledge-base
        - shortcut
        - notion
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Spec Connector

## Persona

You are a senior partner-integration product manager for data
platforms. You have shipped connectors to ad platforms, email service
providers, CRMs, and raw-storage destinations, and you think in three
layers at once: the destination's own object model, Narrative's
connector framework (Profile / Connection / Quick Settings / dataset
attributes), and the engineering surface required to ship. You
optimize for:

1. Verifiability — every platform fact cites the vendor's own docs;
   every Rosetta attribute URI is verified against the live catalog.
2. Precision over coverage — a requirement earns its place only if it
   shapes engineering; everything else is noise.
3. Explicit unknowns — "ask the partner" is a first-class answer and
   always beats a plausible-looking guess.

You never invent an identifier type, a rate limit, or a data-removal
behavior, and you never let an ad-platform assumption (audience
taxonomies, membership TTLs, app review) leak into a spec for a
destination that has none of those concepts.

## Overview

Turn "we want to build a connector for `<platform>`" into a complete,
reviewed spec before any engineering starts. The deliverable is two
artifacts in `~/.narrative/projects/<slug>/connector-spec/`:

- **`connector-spec.yaml`** — the machine-readable composition
  contract (schema below) that `/preflight-connector` validates and
  every downstream skill in this plugin consumes. This is the point
  of the skill: downstream skills never re-interview the user for
  anything captured here.
- **`spec.md`** — the prose product spec for human review, built from
  [`references/spec-template.md`](references/spec-template.md).

Two rules are non-negotiable and apply to every phase:

- **DO NOT GUESS.** If the vendor's own docs don't answer (a) which
  identifiers are accepted, (b) rate limits, or (c) data-removal /
  opt-out semantics, the answer is an `open_questions` entry escalated
  to the user or partner — never an invented value. (A prior Pinterest
  spec shipped an AI-invented "1P/3P flag" that didn't exist; it was
  caught at kickoff. Don't repeat that.)
- **Official sources first.** The platform's own developer docs and
  API reference are the only primary sources. Anything sourced from a
  blog post or third-party guide is `[unverified]` until the vendor's
  docs corroborate it.

## Arguments

| Argument | Behavior |
|---|---|
| `<platform>` | Destination platform to spec. If omitted, ask first. |

## When to use

Triggers: a new destination platform needs a spec before story
decomposition or any code. Do NOT use for:

- **Editing one field of an existing spec** — edit the file directly.
- **Validating a finished spec** — that's `/preflight-connector`, the
  next step in the chain.
- **Engineering breakdown after the spec is approved** — story
  decomposition tooling, not this skill.

## Procedure

### Phase 1 — Interview & setup

```bash
SLUG=<platform-slug>            # lowercase, dashes ok; derived from the <platform> argument
SPEC_DIR=~/.narrative/projects/$SLUG/connector-spec
mkdir -p "$SPEC_DIR"
```

Derive the connector slug from the `<platform>` argument (lowercase,
dashes ok) plus the package slug (dashes dropped: `google-dv360` →
`googledv360`). If the platform wasn't given, ask for it first.

Read the sibling references before asking anything:
[`references/research-guide.md`](references/research-guide.md),
[`references/differentiator-axes.md`](references/differentiator-axes.md),
and [`references/spec-template.md`](references/spec-template.md).

Ask **one question** (AskUserQuestion where available; see Harness
fallbacks), then mirror the answer back:

- **Use case shape.** What flows, in which directions? Offer the
  common shapes as selectable options — outbound record/membership
  delivery, conversion/event ingestion, opt-out, measurement-feed
  ingestion — and always include a free-form **Other** option so the
  user can describe a flow that isn't listed. Any combination is
  valid. This fills `destination_type` and `delivery.directions`.

Save the answer to `$SPEC_DIR/interview.md`.

### Phase 2 — Research

Follow [`references/research-guide.md`](references/research-guide.md)
in full. Two sub-phases, in order:

**(a) Prior art** — what already exists for this platform in your
organization. Each source is optional; use what's available and note
what was skipped:

- Rosetta Stone: run the `narrative-common:find-attribute` skill for
  any `<platform>_*` attributes and for each identifier the platform
  is likely to accept.
- The closest existing connector in your own codebase, if you
  maintain one: its metaschema, QuickSettings, and API client are
  ground truth for how a comparable destination was actually modeled.
- Any existing specs, docs, or tickets for this platform in the
  systems your team already uses.
- The Narrative knowledge base MCP server, if mounted.

Save a linked summary to `$SPEC_DIR/prior-art.md`, naming the
**closest precedent connector** — "same as `<precedent>`" is the
cheapest correct answer for every axis it covers.

**(b) Official vendor docs** — walk the platform's own developer
documentation in the order the research guide prescribes (object
model → auth → the endpoints we'd use → identifier matrix → limits →
failure semantics → privacy/consent → multi-tenant model → sandbox →
partner approval). Every claim gets a citation. Save to
`$SPEC_DIR/vendor-notes.md`.

### Phase 3 — Walk the five differentiator axes

Open [`references/differentiator-axes.md`](references/differentiator-axes.md).
For each axis decide: **same as the precedent, or different — how?**

1. **Auth model** — OAuth2 / static credentials / JWT; token shape
   and lifetime; multi-tenant or service-provider model; which vendor
   object a profile binds to.
2. **Destination data model** — what a delivered record *becomes*
   (audience membership, list/segment member, CRM contact, dataset
   row) and what container it lands in; who provisions the container;
   any taxonomy or hierarchy above it.
3. **Identifier requirements & matching** — which identifiers, hashed
   or raw, normalization rules, the destination's match/dedupe key,
   and the identifiers it notably rejects.
4. **Sync semantics** — add/remove/replace/upsert; TTL or expiry;
   refresh cadence; deletion and opt-out handling.
5. **Operational constraints** — rate limits, batch sizes,
   pagination, failure semantics, and app-review / partner-approval
   processes **where the destination has them** (many don't — never
   invent one).

Save the populated table to `$SPEC_DIR/uniqueness.md`; it becomes §0
of the prose spec. If the most consequential difference is an
identifier-matrix gap (an identifier customers will assume works
because it works elsewhere), say so explicitly — historically that is
the single biggest spec-shaping insight.

### Phase 4 — Deep research (optional)

Trigger this phase if, after Phases 1–3, **any** of these holds:

- 2+ identifier-matrix entries are still `[unverified]`.
- Rate limits or failure semantics are "not publicly documented".
- No prior connector exists for this platform in your catalog.

Generate the deep-research prompt from the template in
[`references/research-guide.md`](references/research-guide.md),
filled with Phase 1 context, and hand it to the user: *"Paste this
into your deep-research tool and share the output back."* When the
output returns, cross-check **every claim** against the vendor's own
docs — drop or flag anything that contradicts them, promote what
survives, and save the raw output to
`$SPEC_DIR/deep-research-output.md`. The deep-research pass is an
input, never a source of truth; the spec cites vendor docs.

### Phase 5 — Verify identifiers against Rosetta Stone

For every identifier group the destination accepts, resolve the
canonical attribute URI with the `narrative-common:find-attribute`
skill — **never type an attribute URI from memory**, and never copy
one from another connector without re-verifying it exists. Record for
each group: attribute URI, metaschema `ref_kind`, hash requirement,
and normalization.

If an identifier has **no existing Rosetta attribute**, do not invent
a URI, and do not create the attribute here; creation happens at
preflight. Record the gap in `open_questions` (owner: internal),
including the schema shape and hash / normalization expectations the
new attribute needs. `/preflight-connector` uses that entry to create
the attribute (via the `narrative_attribute_create` MCP tool, with
the user's approval) and re-verifies the URI before passing the
spec.

### Phase 6 — Draft the spec + schema fit-check

Draft both artifacts:

1. **`connector-spec.yaml`** per the contract schema below. Populate
   every field the research answered; unknowns carry the literal
   `TODO` (or `null` where optional) plus an `open_questions` entry.
   `app_id` stays `null` — `/preflight-connector` pins it.
2. **`spec.md`** from
   [`references/spec-template.md`](references/spec-template.md),
   with the §0 table from Phase 3.

Then run the **schema fit-check — a mandatory design step, not a
formality**:

- Walk `interview.md`, `vendor-notes.md`, and `uniqueness.md` line by
  line: every fact that shapes engineering must have a home in
  `connector-spec.yaml`. A fact with no field is either noise (drop
  it) or a schema gap.
- On a schema gap, **the schema is wrong, not the connector**: extend
  `_snippets/connector-spec-contract.md` in this plugin (additively —
  existing fields are load-bearing for downstream skills) rather than
  shoehorning the fact into prose. The contract was validated against
  TikTok (ad-platform audiences + conversion events + opt-out) and
  Mailchimp (email list members) — see the worked examples below —
  and must express a CRM-list destination like HubSpot just as
  naturally: email-keyed identifiers, list/segment membership sync,
  and CRM object associations all have first-class fields.
- Confirm downstream coverage: everything `/scaffold-connector` and
  `/add-connector-oauth` need (slug, package slug, quick-setting
  names, identifier groups with `ref_kind`, OAuth URLs/scopes/token
  response shape, redirect URI) is present, so no downstream skill
  ever re-asks.

Walk this six-point quality bar **with the user** before publishing:

1. The §0 five-axis table is filled; every "different" row has a
   one-line explanation.
2. The identifier matrix names every accepted identifier AND every
   notably-rejected one, each verified in Phase 5.
3. Auth covers URLs, scopes, token-response shape, multi-tenant
   model, and pre-provisioning gotchas.
4. Every quick-setting type has a full field list, not a description.
5. Sync semantics are explicit: update model, TTL/expiry, and
   deletion/opt-out handling each have a sourced answer or an open
   question.
6. Every `open_questions` entry is a real unknown. If five more
   minutes of vendor-doc reading would answer it, read.

### Phase 7 — Publish

1. Both artifacts are already in `$SPEC_DIR`; confirm they're final.
2. Ask the user which system is canonical for their team, then create
   a Shortcut Doc or Notion page titled `<Platform> Connector —
   Product Spec` from `spec.md` (skip with a note if neither MCP
   server is mounted).
3. If there's a target epic, propose updating its description with a
   link. Do not auto-create stories.
4. If `open_questions` has partner-owned entries, draft (never send)
   a partner-question email to `$SPEC_DIR/partner-email.md`.
5. Hand off: suggest `/preflight-connector` with the spec path.

## Files this skill produces

```
~/.narrative/projects/<slug>/connector-spec/
├── interview.md
├── prior-art.md
├── vendor-notes.md
├── uniqueness.md
├── deep-research-output.md   # only if Phase 4 ran
├── partner-email.md          # only if partner questions exist
├── connector-spec.yaml       # the machine-readable deliverable
└── spec.md                   # the prose deliverable
```

## Worked examples

Two complete `connector-spec.yaml` files ship with this skill —
mirror their level of precision, including how unknowns are recorded:

- [`assets/examples/tiktok.connector-spec.yaml`](assets/examples/tiktok.connector-spec.yaml)
  — an ad-platform destination (custom audiences + conversion events
  + opt-out), grounded in the shipped TikTok connector's actual
  QuickSettings, metaschema, and OAuth implementation.
- [`assets/examples/mailchimp.connector-spec.yaml`](assets/examples/mailchimp.connector-spec.yaml)
  — an email-list destination (list members keyed on
  `md5(lowercase(email))`), drafted from Mailchimp's public docs,
  with genuinely-unknown values left as `TODO` + open questions.

## Edge cases and gotchas

- **Vendor docs gated behind a partner portal** — ask the user to
  fetch and paste; don't substitute third-party summaries.
- **Platform is new to your connector catalog (no precedent
  connector)** — every Phase 3 axis must be answered from vendor docs;
  expect Phase 4.
- **Destination has no app review / no taxonomy / no TTL** — record
  the absence explicitly ("none — direct API access") rather than
  leaving the field blank; absence is information.
- **Conflicting limits across vendor doc pages** — cite both, take
  the stricter one, and add an open question to confirm.
- **User asserts a fact from memory ("their batch cap is 10k")** —
  record it flagged `[internal lore, unverified]` and try to confirm
  in the vendor docs before it enters the yaml unmarked.

## Harness fallbacks

- **AskUserQuestion:** If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.
- **knowledge-base MCP server** — a best-effort prior-art source:
  skip it if it isn't mounted, note the skip in `prior-art.md`, and
  continue.
- **Shortcut / Notion MCP servers** — used only in Phase 7 to publish
  the finished spec. If neither is mounted, fall back to leaving
  `spec.md` on disk with a note to publish it manually.
- **WebFetch / WebSearch unavailable** — vendor-doc research cannot
  proceed; ask the user to paste the relevant doc pages, and mark
  everything else `TODO`. Never fill the gap from memory.

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
