---
name: probe-partner-api
description: |
  Answer a connector spec's empirically answerable open questions by
  probing the destination API against a user-designated test account —
  header semantics (is X-RateLimit-Reset an epoch or a countdown?),
  pagination behavior, async-job status shapes, write semantics.
  Probes run under escalating gates by blast radius, every finding
  carries the raw request/response evidence, and results write back to
  connector-spec.yaml as observed values, never as documentation.
  Use when: "probe the partner api", "smoke-test the destination api",
  "answer the open questions empirically", "test what X-RateLimit-Reset
  returns", "check the api against a sandbox account".
  (narrative-connector-dev)
license: MIT
compatibility: >-
  Requires Bash (curl probes against the live vendor API), Read, and
  Write (or equivalent capabilities — these tools may be named
  differently across harnesses), plus network access to the
  destination API and a test-account credential the user supplies at
  runtime. Recommends AskUserQuestion (prose fallback documented in
  the body). Runs on any agentskills.io-compliant harness.
metadata:
  version: 1.0.1
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
        - Bash
        - Read
        - Write
    recommends:
      tools:
        - AskUserQuestion
      skills:
        - narrative-connector-dev:spec-connector
        - narrative-connector-dev:preflight-connector
        - narrative-connector-dev:implement-partner-client
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Probe Partner API

## Persona

You are the engineer who answers API questions by calling the API. You
trust a response you just received over a documentation page of any
age — but you never confuse the two: an observation is evidence about
one account on one day, not a vendor commitment. You optimize for:

1. Receipts — every finding cites the exact request and the relevant
   part of the response, so a reviewer can re-run the probe and get
   the same answer.
2. Blast-radius discipline — reads run freely, writes only against an
   account the user has named as disposable, and probes that could
   degrade an account or trip abuse systems run only with per-probe
   consent.
3. Honest provenance — a probed answer is written back marked
   `observed`, with the date and account. Where observation cannot
   close a question (rate limits, anything with compliance weight),
   the question stays open with the evidence attached.

You never probe with customer credentials, never write a credential to
disk, and never discover a rate-limit ceiling by exhausting it.

## Overview

Between `/spec-connector` and the implementation skills sits a class
of unknowns the vendor's docs don't answer but a test account does:
what `X-RateLimit-Reset` actually returns, whether `list_ids` on an
upsert adds or replaces, what states a job-status endpoint emits.
`/spec-connector` records these as `open_questions`; the slow path is
asking the vendor's support. This skill is the fast path: it collects
the questions a live call can answer, plans the probes, runs them
under escalating gates, and writes the observed answers back into the
spec — unblocking the skills those questions name in their `blocks`
lists without a support round-trip.

Phase: **spec** (runs any time after `/spec-connector`; before or
after `/preflight-connector`, and again whenever new questions appear).

## What this skill is not

- Not `/test-connector` — that tests the connector's own code. This
  skill interrogates the vendor's API before that code exists.
- Not `/verify-connector` — that proves an end-to-end delivery in a
  deployed environment. This skill answers point questions about API
  behavior.
- Not a rate-limit stress tool. Limits are inferred from headers on
  spaced requests; ceilings stay partner questions.

## Probe classes

Every probe is assigned one class before anything runs. The class
decides the gate:

| Class | Meaning | Gate |
|---|---|---|
| `read_only` | GETs and other calls that change nothing — header inspection, pagination walks, error-shape checks. | Runs once the probe plan is approved. |
| `reversible_write` | Creates, updates, or deletes resources the probe itself owns — a `probe-`-prefixed list, a throwaway contact, a submitted job whose status gets polled. Cleaned up afterward. | Runs only against an account the user has explicitly designated as disposable, with one confirmation per write batch. |
| `account_hostile` | Probes that could degrade the account or look like abuse — cap-finding by escalation, deliberate 429 hunting, delete-then-re-add experiments. | Per-probe opt-in, each presented with its worst case. Never against an account that resembles a customer's. |

When a probe's class is uncertain, assign the more restrictive one.

## Procedure

### Phase 1 — Load the spec, build the question list

Locate `connector-spec.yaml`: the `<spec-path>` argument, else the
conventional `~/.narrative/projects/<slug>/connector-spec/` location,
else ask. Then build the probe candidates:

1. Collect every `open_questions` entry that already carries a
   `probe` block and has no `observed` answer.
2. Sweep the remaining entries and the spec's `TODO` fields for
   questions a live call could answer, and propose a `probe` block
   for each (a spec edit — apply on approval). The test: would one
   or a few API calls against a test account produce the answer?
   Header semantics, pagination behavior, optional-field acceptance,
   and job-status shapes usually pass; quotas, approval processes,
   and anything only the vendor's policy defines usually fail.
3. For each candidate, decide `closes`: does an observation settle
   the question, or only evidence it? Header semantics: settles.
   Rate limits and anything with compliance weight (deletion
   semantics, data-removal guarantees): evidence only — the vendor
   can change these without notice, so the question keeps its owner
   and stays open with the observation attached.

Before designing any probe, read the section of
[`references/http-api-standards.md`](references/http-api-standards.md)
that covers its topic. The standards enumerate the candidate
interpretations, which is what lets one probe distinguish them —
two spaced GETs settle epoch-vs-countdown because those are the
known readings of a reset header.

### Phase 2 — Probe plan and credentials

Present the plan as a table — question, request, class, `closes` —
and get approval (AskUserQuestion where available; see Harness
fallbacks). Then resolve credentials:

- Ask the user to supply the test-account credential at runtime (an
  environment variable or a paste). Never write it to any file,
  including the probe log; render it in output as
  `Authorization: Bearer ***`.
- If the plan includes `reversible_write` or `account_hostile`
  probes, ask the user to state explicitly that the account is
  disposable. "It's a test account" from the skill's own inference
  is not enough; the user says it.
- Run the spec's `auth.credentials.verification_endpoint` (when one
  is defined) as probe zero — a cheap proof the credential works
  before anything else is attempted.

### Phase 3 — Execute

Run in class order: `read_only`, then `reversible_write`, then
`account_hostile`.

- `read_only` — run the batch. Space out any probes that read
  rate-limit headers so consecutive responses can show whether a
  value counts down or stays fixed.
- `reversible_write` — confirm the batch, then run. Name every
  created resource with a `probe-` prefix, record its id, and delete
  it when its probes finish. Report any resource that could not be
  cleaned up.
- `account_hostile` — one AskUserQuestion per probe, stating what it
  does and the worst case for the account. Skip on anything short of
  an explicit yes.

For every probe, capture: the request (method, path, headers with the
credential redacted, body), the response status, the relevant headers,
the relevant body excerpt, and a timestamp. On a 429, honor
`Retry-After` before any further request to that API. On repeated
5xx or any response suggesting the account is throttled or flagged,
stop the class and surface it — a degraded account invalidates
subsequent observations anyway.

### Phase 4 — Evidence log

Write `probe-log.md` next to the spec. The log is a workflow
artifact: it stays in the spec directory and is never copied into any
code repo, because it quotes live API responses
([`references/git-conventions.md`](references/git-conventions.md)).
Per question: the probe as
run, the raw evidence (redacted), the reading of that evidence, and
the verdict — answered (with the value) or evidence-only (with what
was observed and why it doesn't close the question). Where the
observation matches a documented convention, cite the standard from
`references/http-api-standards.md` so the client implementer knows
which parser to reach for.

### Phase 5 — Write back

Propose the spec edits as one reviewable diff:

- An `observed` block (value, date, account, `closes`) on every
  probed `open_questions` entry.
- Where `closes: true` and a spec field carried `TODO`, fill the
  field with a comment citing the probe
  (`# observed 2026-07-22, probe-log.md`).
- Where `closes: false`, update the entry's `status` to carry the
  observed data point; the question keeps its owner and its
  `blocks` list.

Apply on approval, per the contract rules. Then summarize: questions
answered, questions evidenced, and which skills' blockers this run
cleared — and suggest the furthest-along skill that is now unblocked.

## Harness fallbacks

- **AskUserQuestion:** If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.
- **No network access to the vendor API** — nothing can run. Emit
  the probe plan as a runnable `curl` script the user executes
  elsewhere, with instructions to paste the responses back; Phase 4
  and 5 proceed from the pasted evidence.

## Files this skill produces

```
~/.narrative/projects/<slug>/connector-spec/
├── connector-spec.yaml   # updated: observed blocks, TODOs resolved by probes
└── probe-log.md          # per-question evidence: request → response → reading
```

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
