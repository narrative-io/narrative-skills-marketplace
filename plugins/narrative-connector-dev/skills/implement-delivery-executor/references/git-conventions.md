<!-- AUTO-GENERATED from git-conventions.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# Git conventions for connector work

How the connector-dev skills interact with git in whatever repo they
write into: an existing connectors repo, or a project
`/scaffold-connector` created from scratch.

## Skills stop at the diff

Every code-producing skill in this plugin leaves its changes as
uncommitted working-tree changes and never runs `git commit`. The human
reviews the diff, then commits it. One skill run produces one
reviewable diff; committing it before the next skill runs is what
keeps that true.

## Commit at each checkpoint

A checkpoint is the moment one skill's reviewed diff becomes a commit.
The rhythm across the pipeline:

1. A skill finishes and shows its diff summary.
2. The human reviews the diff and commits it.
3. The next skill starts on the clean tree.

A tree that is already dirty when a skill starts mixes earlier changes
into the new diff, and neither can be reviewed on its own.
`/scaffold-connector` warns on a dirty target tree for this reason;
the same caution applies to every skill that writes code.

Write commit messages in the
[Conventional Commits](https://www.conventionalcommits.org) format.
Suggested checkpoint messages:

| Checkpoint | Suggested message |
|---|---|
| `/scaffold-connector` | `feat(<slug>): scaffold the connector skeleton` |
| `/define-connector-interface` | `feat(<slug>): define the record schema and settings contract` |
| `/implement-partner-client` | `feat(<slug>): implement the partner API client` |
| `/implement-delivery-executor` | `feat(<slug>): implement the delivery executor` |
| `/add-connector-oauth` | `feat(<slug>): add the OAuth flow` |
| `/add-measurement-ingestion` | `feat(<slug>): add measurement ingestion` |
| `/create-scaffold-manifest` | `chore: add connector-scaffold.yaml` |

Use the connector slug as the scope in a repo that hosts several
connectors; drop the scope in a repo that holds only this connector.
A skill's closing summary proposes the message next to the diff
summary so the user can commit without composing one.

## What never lands in git

- **Credentials.** Partner API keys, OAuth client ids and secrets, and
  tokens never appear in a committed file. In a Workers project they
  go through `wrangler secret`, and local values live in `.dev.vars`,
  which stays gitignored.
- **Workflow artifacts.** `connector-spec.yaml`, `probe-log.md`, and
  `scaffold-plan.md` live in the spec directory
  (`~/.narrative/projects/<slug>/connector-spec/`), outside any repo.
  Don't copy them into the code repo. The probe log quotes live API
  responses, and the spec can carry account details and credential
  placeholders. `connector-scaffold.yaml` is the exception; it is a
  repo file and belongs in the repo.
- **Sample data.** Delivery or measurement files that carry real
  identifiers stay out of the repo, redacted or not.

## Seeding .gitignore in a new project

When `/scaffold-connector` runs in greenfield mode, `.gitignore` is
part of the skeleton, written before anything else so the first commit
is clean. The cloudflare-workers profile's seed:

```
node_modules/
dist/
.wrangler/
.dev.vars*
.env*
*.local
.DS_Store
```

`worker-configuration.d.ts` is generated but committed (the profile
explains why); never ignore it.

## Branches and pull requests

Work on a branch per connector (for example `feat/<slug>-connector`)
rather than on the default branch. Connector work often spans repos.
The service code, the platform's migrations, and the frontend each
ship through their own repo's normal PR and review flow, so expect one
PR per repo per phase. A checkpoint commits into whichever repo the
skill just wrote to.

Where the narrative-dev plugin is installed, `/commit` groups the
working tree into conventional commits and `/create-pr` drafts the
pull request; both fit the checkpoint rhythm. Plain `git commit` works
the same way without them.
