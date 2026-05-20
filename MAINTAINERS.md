# Maintainers

Operational reference for repository admins. Day-to-day contributor
flow lives in `CONTRIBUTING.md` and the release flow lives in
`RELEASING.md`; this file is for one-time and rare actions.

## Conventional commits — how it's enforced

Three reinforcing layers:

1. **PR-title check (required)** —
   [`.github/workflows/pr-title.yml`](.github/workflows/pr-title.yml)
   runs `amannn/action-semantic-pull-request` on every PR. The title
   must match `type(scope?): subject` with one of the accepted types
   (`feat`, `fix`, `perf`, `refactor`, `docs`, `ci`, `build`, `chore`,
   `test`, `revert`, `style`). Because the repo squash-merges, the PR
   title is what lands on `main` — this is the authoritative check.
2. **Local commit-msg hook (advisory)** —
   [`lefthook.yml`](lefthook.yml) runs `commitlint` against each
   commit message. Installed automatically by `bash setup` or via
   `bun run hooks:install`. Helps contributors catch mistakes before
   pushing.
3. **Branch protection (required)** — see below. Requires the PR
   title check to pass and enforces linear history.

When all three are wired up, the canonical history on `main` is
guaranteed to be conventional, and the release script
(`scripts/release.ts`) produces clean changelog categories without
needing a fallback "Other" bucket.

## Branch protection — recommended settings for `main`

Apply via the GitHub UI
(<https://github.com/narrative-io/narrative-skills-marketplace/settings/branches>)
or via `gh api` (see snippet below).

| Setting | Value | Why |
|---------|-------|-----|
| Require a pull request before merging | ✅ | No direct pushes to `main`. |
| Require approvals | 1 (or more) | Code review by another maintainer. |
| Dismiss stale approvals on new commits | ✅ | Re-review after force-pushes / new commits. |
| Require status checks to pass before merging | ✅ | See list below. |
| Require branches to be up to date before merging | ✅ | Forces rebase before merge. |
| Required status checks | `CI / check`, `CI / shellcheck`, `PR Title / Conventional Commit` | The full CI gauntlet + the conventional-commit gate. |
| Require linear history | ✅ | Pairs with squash-merge default; keeps `main` rebase-clean. |
| Require conversation resolution before merging | ✅ | No merging with open review threads. |
| Restrict who can push to matching branches | maintainers only (optional) | Belt-and-suspenders against direct pushes. |
| Allow force pushes | ❌ | Force-push to `main` discards work. |
| Allow deletions | ❌ | Self-explanatory. |

### Default merge method

Settings → General → "Pull Requests" → check **Allow squash merging
only**. The default squash-merge subject should be **"Pull request
title"** (not "Default to PR title and commit details"). That keeps
the conventional-commit subject we enforce as the canonical
`main`-history subject.

### Applying via `gh api`

The branch-protection endpoint requires a JSON body with nested
objects (`required_status_checks`, `required_pull_request_reviews`)
and an explicit `null` for `restrictions`. `gh api -F` sends
form-encoded fields and mishandles those shapes — use `--input -`
with a here-doc:

```bash
cat <<'JSON' | gh api -X PUT \
  repos/narrative-io/narrative-skills-marketplace/branches/main/protection \
  --input -
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Lint, typecheck, knip, manifests",
      "Shellcheck setup script",
      "Conventional Commit"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
```

The context names (`Lint, typecheck, knip, manifests`,
`Shellcheck setup script`, `Conventional Commit`) match the `name:`
fields in the job definitions — keep them in sync if you rename a
job. `restrictions` must be `null` on non-organization repos; an
empty string fails schema validation.

## Going public — one-time checklist

When flipping the repo from private to public:

1. Confirm `SECURITY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`
   are present and the email aliases in them resolve.
2. Confirm the description and topics are set on the repo
   (`gh repo view --json description,repositoryTopics`).
3. Apply branch protection (see above) — public repos need protection
   *before* people can open PRs.
4. Settings → Code security → enable Dependabot Alerts and Secret
   Scanning (free on public repos).
5. Settings → Pull Requests → check "Always suggest updating pull
   request branches" so PRs that fall behind `main` get a rebase
   prompt.
6. Flip visibility: Settings → Danger Zone → Change repository
   visibility → Public.

After flipping:

- Set up the [Renovate](https://github.com/marketplace/renovate) app
  on the public repo if it wasn't already.
- Verify CI runs on the first external PR — `pull_request` from a
  fork only gets `GITHUB_TOKEN` with read scope; the PR-title check
  is configured to work under that constraint.

## Cutting a release

See [`RELEASING.md`](RELEASING.md). TL;DR:

```bash
bun run release             # preview
bun run release:apply       # commit + tag
git push origin main --follow-tags
```

The `release.yml` workflow handles the rest.
