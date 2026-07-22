---
name: define-connector-interface
description: |
  Turn the spec's abstract declarations — identifier groups, quick
  settings, and the destination data model — into the concrete data
  contract the connector serializes against: the record schema with the
  right $ref shape per identifier group, the quick-settings type set
  with its discriminators and parser bindings, and the settings-form
  contract, written into whichever scaffold target /scaffold-connector
  produced, in that target's own idiom.
  Use when: "define the connector interface", "generate the audience
  metaschema", "wire up the quick settings types", "generate the
  connector's data contract", "build the record schema".
  (narrative-connector-dev)
license: MIT
compatibility: >-
  Requires Bash, Read, Write, and Edit (or equivalent capabilities —
  these tools may be named differently across harnesses) for local
  codegen in the scaffold target's working tree. Reads
  connector-spec.yaml; no infra, DB, or registration side effects.
  The bundled schema validator needs Node 18+ or Bun. Recommends
  AskUserQuestion (prose fallback documented in the body).
  Runs on any agentskills.io-compliant harness.
metadata:
  version: 1.1.1
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
        - narrative-connector-dev:scaffold-connector
        - narrative-connector-dev:implement-partner-client
        - narrative-connector-dev:implement-delivery-executor
        - narrative-connector-dev:add-connector-app-ui
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Define Connector Interface

## Persona

You are the engineer who writes the data contract other engineers
build against. You keep two layers strictly separate: what the
platform requires of every connector, and how this particular repo
expresses it. You optimize for:

1. Fidelity to the spec — every schema property, discriminator, and
   field traces to a line of `connector-spec.yaml`; nothing is
   invented.
2. The target's idiom — generated types read like the repo's other
   connectors wrote them, in the repo's own language and
   serialization library.
3. One contract, every surface — the record schema, the type
   definitions, and the settings form agree exactly, because a
   mismatch between them is a runtime failure no compiler catches.

You never re-resolve or second-guess an attribute URI the spec
already carries, never fall back to a default stack when the target
doesn't answer an idiom question, and never invent a platform
contract where none is published.

## Overview

Turn the spec's abstract declarations into the concrete data contract
the connector serializes against, written into the scaffold target
`/scaffold-connector` produced. Four artifacts, defined in
[`references/interface-anatomy.md`](references/interface-anatomy.md):

- **The record schema** — a JSON Schema document, one per
  record-ingesting delivery direction, validating the schema of any
  dataset a customer maps to the connector. One property per
  identifier group; each property's `$ref` shape is selected by the
  group's `ref_kind`.
- **The quick-settings types** — one type per `quick_settings[]`
  entry, with its JSON discriminator, field list, and parser binding,
  in the target's language and serialization library.
- **The settings-form contract** — the JSON Schema per quick-settings
  type that `/add-connector-app-ui` later renders the settings form
  from, kept in lockstep with the types.
- **The acceptance policy** — the `required[]` / `anyOf[]` block
  inside the record schema stating which identifier groups a
  delivery must include.

The contract's *content* is portable: the `$ref` shapes, the
discriminator, and the policy structure are platform contracts that
hold whether the connector is Scala, TypeScript, Python, or Go. The
contract's *packaging* — file names, locations, codec style, casing —
belongs to the target, and this skill takes it from the target
rather than assuming any stack.

Phase: **service**. Runs immediately after `/scaffold-connector` and
feeds `/implement-partner-client`, `/implement-delivery-executor`,
and `/add-connector-app-ui`.

## Arguments

| Argument | Behavior |
|---|---|
| `<spec-path>` | Path to `connector-spec.yaml` or its directory. If omitted, search the conventional location (`~/.narrative/projects/<slug>/connector-spec/`) and ask when the search is ambiguous. |

## When to use

Triggers: the connector's skeleton exists and needs its data
contract. Do NOT use for:

- **Generating the skeleton** — `/scaffold-connector` comes first;
  this skill writes into the tree it produced.
- **Resolving attribute URIs or `ref_kind` values** — that's
  `/preflight-connector`. This skill consumes resolved values and
  stops on unresolved ones.
- **Implementing behavior** — the partner client and delivery
  executor bodies belong to `/implement-partner-client` and
  `/implement-delivery-executor`.
- **Building the settings form itself** — `/add-connector-app-ui`
  renders it in the frontend; this skill only defines the contract
  it renders from.

## Procedure

### Phase 1 — Load the spec

Locate `connector-spec.yaml`: the `<spec-path>` argument, else the
conventional `~/.narrative/projects/<slug>/connector-spec/` location,
else ask (one question; see Harness fallbacks). Read the whole file.

Confirm the fields this skill consumes carry real values:

- `identifier_groups[]` — every group has an `attribute` URI, a
  `ref_kind` that is one of the four enum values, `hash`, and
  `normalization`.
- `quick_settings[]` — every entry has a `type` discriminator, a
  `parser`, and an enumerated `fields[]` list (name, type, required,
  purpose per field).
- `delivery.directions` and `destination` — they decide which record
  schemas exist.
- `target` — the scaffold target `/scaffold-connector` resolved and
  wrote back.

A missing field or a literal `TODO` in any of these stops the skill:
name the field and hand back to `/spec-connector` or
`/preflight-connector`. Attribute URIs were verified against the live
catalog at preflight — take them verbatim. Do not re-resolve them, do
not re-guess them, and if a group's URI looks unverified (still
carries an `open_questions` entry), stop rather than proceed on it.

### Phase 2 — Resolve the target's idiom

The spec says *what* the contract contains; the target says *how it
is written down*. Resolve the idiom facts — language, serialization
library, type style, file placement per artifact, naming casing — per
`target.mode`, in this order:

- **`template-repo`.** Read the manifest's `stack` block
  (`languages[0]`, `libraries.serialization`, `patterns[]`) and its
  `components` map to decide idiom and which unit owns the contract
  files. Then open the template connector's own counterpart files —
  its record schema and its quick-settings types — and mirror them.
  The manifest says which idioms to honor; the exemplar files are
  the ground truth for what a finished contract file looks like in
  this repo. Where the two disagree, say so and ask rather than
  pick. Do not invent a house style the repo doesn't show.
- **`reference-clone`.** No manifest. Infer the same facts from the
  named reference connector's contract files, then state what you
  inferred — file paths, library, type style, casing — and get a
  confirmation before generating. Inference is a guess until
  confirmed.
- **`greenfield`.** Take idiom and layout from the runtime profile
  `/scaffold-connector` used
  (`/scaffold-connector`'s `references/runtimes/<runtime>.md`).
  Generate the record schemas and typed settings definitions in
  full — their shapes are published platform contract — but any
  surface that *serves* the contract to the platform follows the
  profile's platform-contract gate: a marked stub plus a recorded
  `open_questions` entry, the same treatment `/scaffold-connector`
  gives the platform-facing routes it generates.

If none of these sources answers an idiom question, ask the user.
Never improvise a convention, and never fall back to any particular
language or serialization library as a default.

### Phase 3 — Generate the record schemas

For each record-ingesting delivery direction (one schema shared by
`outbound_membership` and `opt_out`; a separate one for
`conversion_events`), build the JSON Schema document per
[`references/interface-anatomy.md`](references/interface-anatomy.md):

- One property per identifier group, named by the group's `name`,
  annotated with the group's `attribute` URI verbatim.
- The property's `$ref` selected by `ref_kind`. The four shapes are
  structurally incompatible, so this selection is the part of the
  file that must be right:

  | `ref_kind` | The mapped dataset field must be |
  |---|---|
  | `attribute_value` | An object wrapping the identifier in a single `value` sub-field. |
  | `attribute_typed_value` | An object carrying `value` plus a `type` marker naming the value's flavor. |
  | `attribute_context_value` | An object carrying `value` plus a `context` marker scoping it. |
  | `string_value_type` | A plain string column, no wrapper. |

- The `$defs` block copied exactly from
  [`references/interface-anatomy.md`](references/interface-anatomy.md)
  — it is the platform's, never edited per connector.
- The acceptance policy: an `anyOf` entry per identifier group by
  default (any single group suffices). If the destination requires
  identifier combinations the spec doesn't express, ask and record
  an `open_questions` entry; do not guess a policy.

The document is pure JSON and identical on every stack. Only where
it lands comes from Phase 2.

### Phase 4 — Generate the quick-settings surface

For each `quick_settings[]` entry, generate the two artifacts that
must stay in lockstep:

1. **The connector's type and codec**, in the target's idiom: the
   decoder accepts a payload only when its `type` key equals the
   entry's discriminator string, the encoder writes the
   discriminator back, and the type carries its `parser` binding so
   the delivery executor can select the right parser from decoded
   settings. Field names, types, and optionality come from
   `fields[]` verbatim — `string`, `integer`, and `boolean` map to
   the language's corresponding types, and `required: false` means
   optional in the type, not just the form.
2. **The settings-form contract**: a JSON Schema per type with the
   same discriminator, the same field names and JSON Schema types,
   and the same `required` set. The discriminator sits in the
   schema's top-level `type` keyword as the block
   `{"type": "string", "const": "<discriminator>", "default":
   "<discriminator>", "readOnly": true}` — a platform quirk
   documented with the full app-interface envelope in
   [`references/interface-anatomy.md`](references/interface-anatomy.md).
   Where the target's exemplar pairs each schema with a UI schema,
   mirror that convention; where it doesn't, the JSON Schema alone
   is the contract. In greenfield mode the UI-schema convention is
   platform-facing and unpublished: generate the JSON Schema, mark
   the UI-schema slot as a stub, and record the open question.

The lockstep rule is the point of doing both here: a field present
in the type but not the schema is invisible in the UI, and a field
present in the schema but not the type produces payloads the
connector rejects. Generate both from the same `fields[]` walk,
never from each other's output.

### Phase 5 — Verify, write back, hand off

- Run the bundled validator over every generated artifact:

  ```bash
  node scripts/validate-interface.mjs <record-schema.json> <form-contract.json> \
      --spec <path>/connector-spec.yaml
  ```

  It checks the artifacts against the platform shapes in
  [`references/interface-anatomy.md`](references/interface-anatomy.md)
  — `$defs` fidelity, the `$ref` selection per `ref_kind`, the
  acceptance policy, the discriminator block, UI-schema scopes — and,
  with `--spec`,
  cross-checks identifier groups and quick-settings fields against
  the spec. Runs on Node 18 or newer, or Bun (the `--spec`
  cross-check needs Bun for YAML parsing and is skipped with a note
  otherwise). Fix every error it reports before handing off; treat
  warnings as questions for the user.
- Run the target's verify command when one is declared (manifest
  `verify.command`, or the runtime profile's typecheck). Report
  failures verbatim; a contract that doesn't compile is a finding
  for the human, not something to quietly patch.
- Leave every change as an uncommitted working-tree diff and show a
  summary of created and modified paths. Never overwrite an existing
  file without showing the diff first. Alongside the summary, propose
  the checkpoint commit message from
  [`references/git-conventions.md`](references/git-conventions.md).
- Propose spec write-backs for anything this run resolved: an answer
  the user supplied mid-run (a corrected `ref_kind`, a filled field),
  and any `open_questions` entries added (combination policy,
  greenfield platform surfaces). Apply on approval, per the contract
  rules below.
- Hand off: suggest `/implement-partner-client` and
  `/implement-delivery-executor` for the behavior, and
  `/add-connector-app-ui` for the form whose contract Phase 4
  defined.

## Files this skill produces

Locations come from the target (manifest `components` map, reference
connector layout, or runtime profile); the artifact set does not:

```
<scaffold target>/
├── <record schema per direction>     # e.g. audience-metaschema.json in the
│                                     #   interface-owning unit
├── <quick-settings types + codecs>   # in the target's language
└── <settings-form contract>          # JSON Schema (+ UI schema where the
                                      #   target has that convention)
~/.narrative/projects/<slug>/connector-spec/
└── connector-spec.yaml               # updated: approved write-backs only
```

## Edge cases and gotchas

- **The spec's `ref_kind` contradicts the exemplar** — the template
  connector refs the same attribute with a different shape. Surface
  both, ask which is right, and propose the answer as a spec edit;
  never silently follow either.
- **The exemplar has no counterpart contract file** — the repo's
  connectors predate one of the artifacts. Ask where it should live;
  an exemplar gap is not a license to invent placement.
- **Contract files already exist for this connector** — a partial
  earlier run. Show the diff per file and ask whether to replace or
  skip; never silently merge.
- **Two directions share a parser** — for example opt-out reusing
  the audience parser. Generate one type per `quick_settings[]`
  entry regardless; the shared `parser` value is the binding, not a
  reason to merge types.
- **A quick-settings field list says "the usual settings"** — an
  un-enumerated list should have been caught at preflight. Stop and
  hand back rather than enumerate it yourself.
- **The destination matches only on identifier combinations** — the
  spec can't express that in `identifier_groups`; ask, record the
  open question, and leave the default any-single-group policy out
  of the file until answered.

## Harness fallbacks

- **AskUserQuestion:** If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.

## Further reading

- [`references/interface-anatomy.md`](references/interface-anatomy.md)
  — the portable contract artifacts, the full `ref_kind` mapping with
  a passing dataset fragment per shape, the app-interface envelope,
  and the per-language realization table.
- [`scripts/validate-interface.mjs`](scripts/validate-interface.mjs)
  — the Phase 5 validator; the reference's shapes as executable
  assertions.
- [`references/git-conventions.md`](references/git-conventions.md)
  — the checkpoint commit rhythm and what never lands in git.

## Scaffold manifest schema

Template-repo mode reads the manifest's `stack` and `components`
blocks (Phase 2). The full manifest schema, for reference:

### Schema

```yaml
# connector-scaffold.yaml — at the template repo's root (the primary
# repo, when a connector spans more than one)
schema_version: 1

# ── Repos (optional) ────────────────────────────────────────
# Omit for a single repo or a monorepo. Every path in the manifest
# then resolves against the repo that holds this file. List repos
# only when a connector spans several (service code in one, database
# migrations or frontend in another). The
# first entry is the repo that holds this manifest. Elsewhere in the
# manifest, a path may carry a `<repo-name>:` prefix (for example
# `migrations:connectors/{slug}`) to resolve against that repo; an
# unprefixed path resolves against the manifest's repo.
repos:
  - name: services
    path: "."                    # the manifest's own repo
    role: connector_code         # connector_code | database | frontend | infra | docs
  - name: migrations
    path: "~/dev/db-migrations"  # repo root; absolute or ~-relative
    role: database
  - name: frontend
    path: "~/dev/app-frontend"
    role: frontend

# ── Stack profile ───────────────────────────────────────────
# The concrete technologies connectors in this repo are built with.
# The generalized service, infra, DB, and deploy skills read this to
# turn their generic steps into stack-specific ones: "add an HTTP
# client" becomes "add an sttp client the way the exemplar does".
# Record only what the repo shows evidence for, and put the evidence
# (file paths, one example each) in scaffold-manifest-notes.md; omit
# any key the repo gives no evidence for.
stack:
  languages: [scala]            # primary first; from build files and source extensions
  cloud:
    providers: [aws]            # from IaC files and cloud SDK dependencies
    services:                   # the managed service serving each concern
      object_store: s3
      queue: sqs
      secret_store: aws_secrets_manager
      key_management: kms
  libraries:                    # the library serving each concern, from
                                # dependency manifests and imports
    connector_framework: "io.narrative::connector-framework"
    http_client: sttp
    serialization: circe
    database_access: doobie
  patterns:                     # code idioms a generated connector is expected
                                # to follow, observed in the exemplar's sources
    - name: tagless-final
      where: "services and stores are traits parameterized on F[_]"
    - name: arrow-delivery-reader
      where: "delivery executors consume Arrow record batches via the framework reader"

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
  measurement_poller: "{slug}-poller"   # measurement_ingestion with ingestion_mode: bucket_inbox
  measurement_receiver: "{slug}-api"    # measurement_ingestion with ingestion_mode: partner_webhook.
                                        # Often shares the service_api unit — the receiver is a route
                                        # on the connector's public HTTP surface, not a loop.

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

# ── Infrastructure & deploy ─────────────────────────────────
# How this repo provisions and ships a connector. The infra, DB,
# registration, and deploy phases read this so they don't assume a
# stack. Record what the exemplar actually uses; omit a concern the
# repo handles elsewhere (a `none` engine, no separate registration).
# Tokens apply to paths and commands.
infrastructure:
  iac: terraform                 # terraform | pulumi | wrangler | cloudformation | none
  path: "{slug}-infra"           # where the connector's infra code lives
  provision: "plan for review; apply per stage is a human gate"
database:
  engine: postgres               # postgres | mysql | d1 | dynamodb | none
  migrations_path: "migrations:connectors/{slug}"   # when migrations live in a separate
                                 # repo, list it in `repos` and prefix the path; a plain
                                 # path means the manifest's own repo
deploy:
  build: "sbt {package_slug}Api/docker:publish"   # how an image/artifact is produced
  promote: "bump the pinned image version per stage, then apply"   # dev → prod discipline
  ci:                            # CI files that build/publish the connector
    - ".github/workflows/{slug}-publish.yml"
registration: null               # optional — how a built connector registers with its
                                 # platform (e.g. a marketplace bootstrap step); null if none

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
- **Resolve paths against the owning repo.** Without a `repos` list,
  every path resolves against the manifest's repo. With one, a
  `<repo-name>:` prefix selects the owning repo and an unprefixed
  path means the manifest's repo. A prefix that names no listed repo
  is an error to report, not a path to guess.
- **The `stack` section is read, not executed.** Scaffolding copies
  the template, which already embodies the stack. The profile exists
  so the skills that later write new code into the scaffold (service
  logic, infra, DB, deploy) match the repo's languages, services,
  libraries, and idioms instead of following generic steps.

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
