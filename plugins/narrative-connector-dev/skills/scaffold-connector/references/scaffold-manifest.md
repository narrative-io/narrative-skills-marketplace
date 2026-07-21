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
  migrations_path: "~/projects/db-migrations"   # may be a separate repo; prompted if so
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
