<!-- AUTO-GENERATED from scaffold-manifest.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# The scaffold manifest — `connector-scaffold.yaml`

A template repo teaches `/scaffold-connector` its conventions through
one file: **`connector-scaffold.yaml`** at the repo root (or wherever
the spec's `target.manifest_path` points). The manifest declares what to
copy, how to rename it, which build files need entries, and how to
verify the result. The skill executes the manifest and ships no repo's
conventions of its own.

Keeping conventions in the repo's manifest rather than in the skill is
what lets one skill serve every team. A team's module taxonomy, build
wiring, and docs layout live in that team's repo, next to the code they
describe, visible only to people who can already read the repo.
One team's manifest lives alongside its connector code; another team
writes one for its own layout.

Authoring a manifest is the `/create-scaffold-manifest` skill's job,
by inference from a reference connector or by interview. This reference
defines what the finished artifact looks like.

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
  app_ui: "connectors/{slug}"           # in the frontend-role repo when the repos list has one;
                                        # otherwise a ui unit the connector serves itself

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
