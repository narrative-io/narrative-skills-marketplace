---
name: create-scaffold-manifest
description: |
  Author a repo's connector-scaffold.yaml — the manifest that teaches
  /scaffold-connector the repo's template, rename rules, component map,
  build wiring, and stack profile (languages, cloud services,
  libraries, code idioms). Two entry paths: infer the conventions from
  an existing reference connector (repo archaeology with human
  confirmation), or interview the user section by section when no clean
  exemplar exists. Handles connectors that span several repos (service
  code, migrations, frontend) by exploring all of them in one run. A
  per-repo, one-time onboarding job.
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
  version: 1.1.0
  narrative:
    args:
      - name: "<repo-path>..."
        required: false
        description: >-
          Paths to the repos to onboard. The first is the primary repo,
          which hosts the manifest and (usually) the connector code;
          any further paths are the other repos a connector spans, such
          as a migrations or frontend repo. If omitted, the skill asks.
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

Beyond layout and naming, the manifest records a **stack profile**:
the languages, cloud provider and managed services, libraries, and
code idioms the repo's connectors are built with. The generalized
service, infra, DB, and deploy skills read this profile to turn their
generic steps into the repo's concrete ones when building against a
`connector-spec.yaml`. This skill only detects and records the
profile; applying it is the downstream skills' job.

A connector doesn't always live in one repo. When service code,
database migrations, and frontend live in separate repos, pass all of
them. The skill explores each, records which repo hosts which role in
the manifest's `repos` list, and resolves every path against the repo
that owns it. A single repo or monorepo stays the default and needs
no `repos` list at all.

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

### Phase 1 — Locate the repos, pick the entry path

Resolve each `<repo-path>` to a repo root (ask if none were given;
confirm each is a git working tree). The first path is the primary
repo, which hosts the manifest and usually the connector code. If a
`connector-scaffold.yaml` already exists at the primary root, stop
and ask: update it (walk the phases against the existing content) or
leave it alone. Never silently overwrite.

With more than one repo, confirm each secondary repo's role
(database, frontend, infra, docs) before inferring anything from it.
Propose a role from what the repo's top level shows (a migrations
tree, a UI build) and let the user correct it. One repo means no
`repos` list and no role questions; that stays the simplest path.

Then pick the entry path. With `--reference` given, inference is
selected and the exemplar named. Otherwise list the primary repo's
directories that look like connectors and ask **one question**
(AskUserQuestion where available; see Harness fallbacks): which
connector is the exemplar to infer from, with an option for "none —
interview me instead."

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
6. **Stack profile.** Read the stack off the repo's own files, one
   concern at a time:
   - Languages, from build files and source-file extensions.
   - Cloud provider and managed services (object store, queue, secret
     store, key management), from IaC files and the cloud SDKs the
     exemplar's code actually uses.
   - The library serving each code concern (the connector framework,
     HTTP client, serialization, database access), from dependency
     manifests and the exemplar's import statements.
   - Code idioms the exemplar follows: its effect style (for example
     tagless-final), how its delivery executor reads incoming data,
     its error-handling conventions. These come from reading its
     sources, and each `patterns` entry gets a one-line `where`
     describing what the idiom looks like in this repo.
   A dependency that is declared but never imported is not a finding;
   every stack entry needs a file that shows the technology in use.

When the connector spans repos, run the steps that apply against
each secondary repo: find the exemplar's footprint there (a
migrations directory named after its slug, frontend components built
for it), record those paths with the owning repo's `<repo-name>:`
prefix, and fold that repo's own language and libraries into the
stack profile. A secondary repo with no trace of the exemplar is a
question for the user, not a blank section.

Record the evidence for each finding (file paths, one example each)
in a working notes file, `scaffold-manifest-notes.md`, next to the
manifest. Stack findings get the same treatment: one entry per
recorded language, service, library, and idiom, each naming the
files that show it.

**Interview path.** Walk the same six areas in the same order, one
question at a time, grounding each question in what the repo does
show (even a fresh repo has a build tool and a language). The stack
profile depends least on interviewing, because dependency manifests
and IaC files exist even without an exemplar. Read them first, and
ask the user only to confirm or fill gaps, not to recite their stack
from memory. Where the
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
- **Resolve every path against the repo that owns it.** A
  `<repo-name>:` prefix selects a repo from the `repos` list; an
  unprefixed path means the manifest's repo. `template.path`, each
  component unit, each `wiring[].file`, each doc — all must exist for
  the exemplar in their owning repo (or be confirmed intentional for
  interview-designed layouts). A prefix naming a repo the list
  doesn't have is a validation failure.
- **Check every stack entry against its evidence.** Each language,
  service, library, and idiom in `stack` must have at least one
  evidence file in the notes, and that file must exist. An entry
  without evidence is either dropped or confirmed with the user as a
  deliberate exception, with the reason noted.
- **Run `verify.command`** against the exemplar once, so a broken
  verify never ships in the manifest.
- **Check schema completeness** against the schema below: required
  sections present, `schema_version` current.

A validation failure is a finding to resolve with the user, not a
reason to soften the rule that caught it.

### Phase 4 — Review and write

Walk the draft with the user section by section, showing the evidence
from Phase 2 alongside each rule. On approval, write
`connector-scaffold.yaml` at the primary repo's root (or the location
the user chooses; note that `/scaffold-connector` looks at the root
by default). Leave it uncommitted for review, alongside
`scaffold-manifest-notes.md`. Secondary repos get no files; the
manifest's `repos` list is what records them.

### Phase 5 — Hand off

- If a `connector-spec.yaml` is in play (the user came from
  `/scaffold-connector` or names one), propose recording the repo in
  its `target` block: `mode: template-repo`, `repo_path` (the primary
  repo; the manifest's `repos` list carries the others), and
  `manifest_path` when the manifest isn't at the root.
- Suggest `/scaffold-connector` as the next step for the first
  connector built against the new manifest.

## Files this skill produces

```
<primary repo root>/
├── connector-scaffold.yaml       # the manifest, uncommitted
└── scaffold-manifest-notes.md    # evidence per rule and per stack finding;
                                  # delete or keep at the user's option
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
- **A declared dependency the code never touches** — dependency
  manifests accumulate leftovers. The stack profile records what the
  exemplar demonstrably uses, so an unused declaration is at most a
  note, never a `libraries` entry.
- **Secondary repos with their own stacks** — a frontend repo in
  TypeScript alongside Scala services is normal, not a conflict.
  List both languages (primary first) and let the per-concern
  `libraries` entries carry the detail.

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
