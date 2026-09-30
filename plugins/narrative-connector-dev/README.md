# narrative-connector-dev

Build Narrative data connectors agentically. This plugin consolidates the
connector-building know-how that currently lives as repo-local skills into
one spec-driven skill set that carries a connector from an idea to a
verified production deployment — stopping at every human gate along the way.

> **Status: in progress.** Skills are implemented one at a time
> (`/spec-connector` and `/preflight-connector` so far); the rest are
> **stubs** — frontmatter, purpose, inputs, outputs, and human-gate
> boundaries defined, with the phased implementation authored in
> follow-up work. Each stub's `SKILL.md` says so at the top.

## Entry paths

Every connector build starts the same way, wherever the code will live:

1. `/spec-connector` researches the destination platform and authors
   `connector-spec.yaml`.
2. `/preflight-connector` validates the spec and resolves blockers before
   any code is generated.

Scaffolding then depends on the state of the target repo.
`/scaffold-connector` reads the spec's `target` block to decide, and asks
when the block is absent:

- **The repo already has a `connector-scaffold.yaml` manifest** — run
  `/scaffold-connector`. It executes the manifest (`template-repo` mode);
  there is nothing else to set up.
- **The repo has connectors but no manifest** — two options. To onboard
  the repo permanently, run
  `/create-scaffold-manifest --reference <connector-dir>` once; it infers
  the repo's conventions from that connector and saves the manifest, and
  every later `/scaffold-connector` run reads the manifest. For a
  one-off, run `/scaffold-connector` in `reference-clone` mode instead.
  In that mode `/scaffold-connector` inspects an existing connector you
  name, infers the repo's conventions from it, and confirms what it
  inferred before generating.
- **The repo is empty, or there is no repo yet** — run
  `/scaffold-connector` in `greenfield` mode and pick a runtime profile,
  such as `cloudflare-workers`. No manifest is involved; the profile
  decides the project layout and how each component materializes.

After scaffolding, the paths converge on the remaining phases of the
[phase table](#phase-structure) below: implementation
(`/define-connector-interface` through `/test-connector`), then
infra / registration, frontend, and deploy / verify. `/build-connector`
sequences all of it, stopping at the human gates described below. The
three scaffold modes are described in more detail under
[Scaffold targets](#scaffold-targets).

## The composition contract: `connector-spec.yaml`

Skills do not pass state to each other directly. They share one
machine-readable artifact — **`connector-spec.yaml`** — that captures the
connector's slug, package slug, `app_id`, auth model, identifier groups
(with canonical Rosetta Stone attribute URIs and metaschema `$ref` kinds),
quick-setting types, partner API endpoints and rate limits, and delivery
semantics. `/spec-connector` authors it, `/preflight-connector` validates
and enriches it, and every downstream skill reads it as the source of
truth. The full schema lives in
[`_snippets/connector-spec-contract.md`](_snippets/connector-spec-contract.md)
and is inlined into every skill via `{{SNIPPET:connector-spec-contract}}`.

## Phase structure

One skill sits outside the per-connector lifecycle: repo onboarding.
The rest are organized into five phases plus an orchestrator:

| Phase | Skills | What happens |
|-------|--------|--------------|
| **onboard** (once per repo) | `/create-scaffold-manifest` | Author the repo's `connector-scaffold.yaml` so `/scaffold-connector` can execute it. Applies to `template-repo` mode only; every later connector built in that repo skips this row. |
| **spec** | `/spec-connector`, `/preflight-connector` | Research and author `connector-spec.yaml`; validate it and resolve identifiers/`app_id` before any code. |
| **service** | `/scaffold-connector`, `/define-connector-interface`, `/add-connector-oauth`, `/implement-partner-client`, `/implement-delivery-executor`, `/add-measurement-ingestion`, `/test-connector` | Generate the code skeleton and the data contract in the scaffold target; add OAuth, the partner client, the delivery executor, and measurement ingestion; test and compile. |
| **infra / registration** | `/scaffold-connector-infra`, `/provision-connector-db`, `/register-connector-app` | Write the `<slug>-infra` infrastructure code and CI; author the database migrations + managed-database infrastructure code; register the marketplace app. |
| **frontend** | `/add-connector-listing`, `/add-connector-app-ui` | Add the catalog listing and the profile / quick-settings app UI in the frontend. |
| **deploy / verify** | `/deploy-connector`, `/verify-connector` | Quick-publish, apply infrastructure to dev, promote to prod; run an end-to-end delivery check and return a go / no-go. |
| **orchestrator** | `/build-connector` | Sequences all of the above against one `connector-spec.yaml`, stopping at every human gate. |

The infra/registration, frontend, and deploy/verify phases describe
infrastructure generically. A repo's concrete tools — its IaC tool,
managed database, image registry, and deploy commands — come from its
scaffold manifest, and the examples in these skills reflect one common
setup rather than a requirement. Wiring every skill to read those manifest
fields end to end is still in progress.

## Human gates

The plugin is filesystem/git work across connector, database, and frontend
code — three separate repos or areas of a single monorepo, depending on the
layout. The non-destructive steps (codegen, infra plan, writing migrations)
run freely; the irreversible ones always stop for explicit human
confirmation:

- **infrastructure applies** — the shared image registry, connector infra,
  encryption keys and access policies, the managed database, and the
  measurement inbox bucket. The concrete IaC tool comes from the repo's
  scaffold manifest (`iac` field: terraform, Pulumi, Wrangler,
  CloudFormation, or none).
- **database migrations** — running any migration.
- **app registration** — the marketplace registration flow: write
  credentials to the secret store and create the platform installation
  (needs a browser-copied access token).
- **prod promotion** — every prod apply and the final verification sign-off.

`/build-connector` never performs these itself; it hands off to the owning
skill only after the operator confirms.

## Scaffold targets

Any engineer building a connector uses the same skill set; what varies
is where the code materializes. The spec's `target` block records that
choice, and `/scaffold-connector` resolves it into one of three modes:

- **`template-repo`** — the target repo carries a
  `connector-scaffold.yaml` manifest declaring its template, rename
  rules, component map, and build wiring. The skill executes the
  manifest and ships no repo's conventions of its own. One repo's
  manifest might declare an sbt module set and its wiring; another
  declares whatever its own layout needs.
  Authoring the manifest is a per-repo, one-time onboarding job;
  `/create-scaffold-manifest` does it, inferring the conventions from
  a reference connector or interviewing the user for them.
- **`reference-clone`** — no manifest; point at an existing connector
  and the skill infers the conventions from it, confirming the plan
  before generating.
- **`greenfield`** — no repo at all; generate a fresh project from a
  bundled runtime profile (`cloudflare-workers` first). Platform-facing
  surfaces whose contract isn't published yet are generated as marked
  stubs plus a recorded open question, never as an invented contract.

The portable component model behind all three modes is
[`skills/scaffold-connector/references/connector-anatomy.md`](skills/scaffold-connector/references/connector-anatomy.md);
the manifest schema is
[`skills/scaffold-connector/references/scaffold-manifest.md`](skills/scaffold-connector/references/scaffold-manifest.md).
The infra, DB, registration, listing, and deploy skills still assume
Narrative's stack today; they read the spec's optional `deployment:`
block for the paths they need. Generalizing them to any repo's stack is
planned work.

## Working trees

This plugin operates on code that is **not** part of this marketplace:
connector code, frontend, and database work. These are three roles, not
necessarily three repos — they can be separate repos or areas of a single
monorepo, and the skills care about the role, not the layout. Against
Narrative's own stack they happen to be three separate repos:

- **connector code** — the Scala connector monorepo and the default
  `template-repo` scaffold target; its path is recorded in the spec's
  `target.repo_path`.
- **frontend** — where the catalog listing and app UI live.
- **database** — the migrations and managed-database code, not checked out
  next to the connector code by default; the DB skills ask for its path and
  record it in the spec's `deployment.migrations_path`.

Everyone else maps these roles onto their own layout — one repo or many,
or none for greenfield.

No MCP servers are required — hence no `mcpServers` block in `plugin.json`.
