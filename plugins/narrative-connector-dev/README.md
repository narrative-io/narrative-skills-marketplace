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

The skills are organized into five phases plus an orchestrator:

| Phase | Skills | What happens |
|-------|--------|--------------|
| **spec** | `/spec-connector`, `/preflight-connector` | Research and author `connector-spec.yaml`; validate it and resolve identifiers/`app_id` before any code. |
| **service** | `/scaffold-connector`, `/define-connector-interface`, `/add-connector-oauth`, `/implement-partner-client`, `/implement-delivery-executor`, `/add-measurement-ingestion`, `/test-connector` | Generate the sbt module set and data contract; add OAuth, the partner client, the Arrow delivery executor, and measurement ingestion; test and compile. |
| **infra / registration** | `/scaffold-connector-infra`, `/provision-connector-db`, `/register-connector-app` | Write the `<slug>-infra` terraform and CI; author narrative-db migrations + RDS terraform; register the marketplace app. |
| **frontend** | `/add-connector-listing`, `/add-connector-app-ui` | Add the catalog listing and the profile / quick-settings app UI in narrative-platform-ui. |
| **deploy / verify** | `/deploy-connector`, `/verify-connector` | Quick-publish, `terraform apply` to dev, promote to prod; run an end-to-end delivery check and return a go / no-go. |
| **orchestrator** | `/build-connector` | Sequences all of the above against one `connector-spec.yaml`, stopping at every human gate. |

## Human gates

The plugin is filesystem/git work across three working trees:
`narrative-connectors`, `narrative-db`, and `narrative-platform-ui`. The
non-destructive steps (codegen, `terraform plan`, writing migrations) run
freely; the irreversible ones always stop for explicit human confirmation:

- **terraform applies** — shared ECR, connector infra, KMS/IAM, RDS, the
  measurement inbox bucket.
- **narrative-db migrations** — running any migration.
- **app registration** — the `bootstrap-app.py` marketplace / SSM / DSM
  flow (needs a browser-copied DSM token).
- **prod promotion** — every prod apply and the final verification sign-off.

`/build-connector` never performs these itself; it hands off to the owning
skill only after the operator confirms.

## Working trees

This plugin operates on repos that are **not** part of this marketplace:

- **narrative-connectors** — the Scala connector monorepo. Assumed at your
  usual checkout.
- **narrative-platform-ui** — the frontend. Present at `~/dev/narrative-platform-ui`.
- **narrative-db** — the migrations/RDS repo. **Not a sibling checkout by
  default** (the convention is `~/projects/narrative-db`); the DB skills ask
  for its path and record it in the spec's `narrative_db_path`.

No MCP servers are required — hence no `mcpServers` block in `plugin.json`.

## Source material being consolidated

These stubs consolidate six existing skills. They remain the canonical
reference until each stub's body is implemented:

- `narrative-connectors/.claude/skills/create-connector` — the lifecycle
  spine, split here into `/scaffold-connector`, `/define-connector-interface`,
  `/scaffold-connector-infra`, `/provision-connector-db`, and
  `/register-connector-app`.
- `narrative-connectors/.claude/skills/add-connector-oauth` → `/add-connector-oauth`.
- `narrative-connectors/.claude/skills/add-measurement-feed-ingestion` → `/add-measurement-ingestion`.
- `narrative-connectors/.claude/skills/migrate-connector-to-arrow` — the
  Arrow-path patterns, applied greenfield in `/implement-delivery-executor`
  (and its verification logic in `/verify-connector`).
- `narrative-connectors/.claude/skills/migrate-connector` — the monorepo
  build-consolidation patterns behind `/scaffold-connector`.
- `ai-tools/plugins/product/skills/product-build-connector-spec` → `/spec-connector`
  (and the spec-completeness bar in `/preflight-connector`).

## Naming decision: `add-connector-oauth`

`add-connector-oauth` also exists as a repo-local skill at
`narrative-connectors/.claude/skills/add-connector-oauth`. There is **no
collision inside this marketplace** — the flat portable build only dedupes
the marketplace's own skills, and `build:portable` passes. The decision is
to **keep the name** (renaming would break the consolidation lineage) and,
once this plugin is adopted in the connectors repo, **reduce the repo-local
copy to a thin pointer** at that skill's canonical marketplace version
rather than maintain two implementations. Until then, the repo-local skill
remains the working implementation. The other repo-local names
(`create-connector`, `add-measurement-feed-ingestion`, `migrate-connector`,
`migrate-connector-to-arrow`) do not collide with the names used here.
