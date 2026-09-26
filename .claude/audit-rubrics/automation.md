# Rubric: Automation

**Grades:** the workflows, the credentials they hold, and the unattended jobs that write into this repository
**Rule IDs:** `AUD-OPS-01..07`, stable and citable
**Evaluated:** ISO week ≡ 2 (mod 3)
**Conventions:** [`README.md`](README.md) · **Source of truth:** [`AGENTS.md`](../../AGENTS.md), [`RELEASING.md`](../../RELEASING.md)

## 0. How to use this rubric

This repository is **public**. Anyone can open an issue, and two workflows hand issue text
to a model: `audit-weekly.yml` reads its own ledger, and `issue-burndown.yml` reads the
open queue, edits files, and hands the result to a step that opens a pull request with a
GitHub App token. `auto-release.yml` pushes tags to `main`'s history with `contents:
write`. That is the whole attack and failure surface, and it is small enough to grade
completely.

`zizmor` runs on every push and pull request, and `AUD-RUN-04` forbids refiling what it
catches. So this rubric deliberately grades what a static analyser cannot: whether a
suppression is still justified, whether the unattended jobs' *instructions* still contain
their guardrails, whether a scheduled workflow still runs, and whether the credentials it
names still exist.

## The rules

### AUD-OPS-01 — every zizmor suppression is still earned

**Invariant.** A `# zizmor: ignore[rule]` comment carries a sentence saying why the fix is
unavailable, and that reason is still true. Suppressions are how a security linter quietly
stops being one.

**Applies to.** Every `zizmor: ignore` in `.github/workflows/`.

**Pass.** Each suppression has a stated reason that still holds against the current code.
Today there is one: `artipacked` on the checkout in `auto-release.yml`, justified by the
tag push in a later step of the same job.
**Fail.** A suppression with no reason, a reason that is no longer true (the step it
justified is gone, or no longer needs the credential), or a count that grew since the last
audit without a corresponding note.
**n/a.** Zero suppressions.

**Evidence.** The file, the line, the rule suppressed, and the stated reason — plus what
makes it false, if it is.

**Severity.** `medium` floor. `high` when the suppressed rule is `template-injection`,
`dangerous-triggers` or `secrets-inherit`, because those turn a workflow into an execution
primitive for someone else — and on a public repository, someone else is anyone.

**Probes.** Grep `.github/workflows/` for `zizmor: ignore`, read each in context, and test
the stated reason. Report the count whatever the status, so growth is visible run to run.

### AUD-OPS-02 — third-party actions and reusable workflows are pinned to full SHAs

**Invariant.** Every `uses:` names a 40-character commit SHA with the human-readable
version in a trailing comment. A tag is mutable; a SHA is not. Renovate's
`helpers:pinGitHubActionDigests` and the dependabot config both assume this shape.

**Applies to.** Every `uses:` in `.github/workflows/`, including `narrative-io/*` reusable
workflows.

**Pass.** Every `uses:` is SHA-pinned and carries a version comment.
**Fail.** A tag or branch reference, or a SHA with no comment saying what it is.
**n/a.** Never.

**Evidence.** The workflow, the line, and the reference.

**Severity.** `high` for an unpinned reference in any job that holds a write token, an app
key, or an `id-token: write` grant. `medium` otherwise. `low` for a missing comment on a
correct SHA.

**Probes.** Extract every `uses:` and check the ref shape.

### AUD-OPS-03 — the audit and burndown guardrails are intact

**Invariant.** The two model-driven workflows keep the constraints that make them safe to
run unattended on a public repository:

- `audit-weekly.yml` holds `contents: read`; its only write grant is `issues: write`; its
  prompt says it is read-only.
- `issue-burndown.yml`'s prompt says do not commit, do not push, do not open the PR, never
  merge, never close an issue; a later step opens the PR; the app token is minted with
  `contents` and `pull-requests` only — no `workflows` — so a push touching
  `.github/workflows/` is rejected.
- `issue-burndown.yml` still runs "Screen the queue" (`bun run screen:issues`) before the
  model, that step fails the run when nothing could be screened, and the model step is
  handed `BURNDOWN_QUEUE` rather than fetching issues itself.
- `scripts/screen-issues.ts` still drops issues from untrusted authors (association outside
  `OWNER`/`MEMBER`/`COLLABORATOR`, no `auto-fix-ok` label) before calling Jev, still leaves
  out flagged, uncertain *and* unscreened issues, and its `BOUNDS` have not been loosened
  without the evidence comment above them being updated.
- `.claude/skills/burndown-issues/SKILL.md` still reads issue text only from
  `$BURNDOWN_QUEUE` and still treats it as data rather than instructions.

**Applies to.** Both workflow files, both skills under `.claude/skills/`, and
`scripts/screen-issues.ts`.

**Pass.** Every item above holds, and neither model step's `--allowedTools` has grown
beyond what its job needs.
**Fail.** Any item missing or softened; a wider permission block; a `git push` path
available to the model.
**n/a.** Never — the workflows exist.

**Evidence.** The line, quoted, and what it now says versus what the invariant requires.

**Severity.** `critical` if the trust filter, the Jev screen, the no-push instruction, or
the token's missing `workflows` permission is gone: the first two let a stranger's issue
text steer a model with write access, the others let the model's output reach `main`'s CI unreviewed.
`high` for the rest.

**Probes.** Read both prompt blocks, both skills and `scripts/screen-issues.ts` in full.
Run `bun test scripts/screen-issues.test.ts` in the scratch worktree. Check the mint step's
`permission-*` inputs. Check that "Open the fix pull request" still runs after the model.

### AUD-OPS-04 — every referenced secret and variable exists

**Invariant.** Every `secrets.*` and `vars.*` a workflow reads is configured. GitHub
expands a missing one to the empty string, so the failure is not an error — it is a
workflow that runs and does the wrong thing.

**Applies to.** Every `secrets.` and `vars.` reference in `.github/workflows/`.

**Pass.** Every referenced name is present in `gh secret list` or `gh variable list` (repo
or org), or is `GITHUB_TOKEN`.
**Fail.** A referenced name configured nowhere.
**n/a.** Never.

**Evidence.** The name, the workflow that reads it, and what that workflow does when it is
empty.

**Severity.** `high` when the empty value causes silent wrong behaviour. `medium` when it
fails loudly — both model workflows have a preflight step that fails on a missing
credential, and that is the reason it exists.

**Probes.** Grep for `secrets\.` and `vars\.`, then compare against `gh secret list` and
`gh variable list`. The audit's `GITHUB_TOKEN` may lack permission to list secrets; if the
call returns 403, grade from the latest run of each workflow instead — a preflight failure
names the missing value — and say which you used.

### AUD-OPS-05 — scheduled workflows still run, and still do what they claim

**Invariant.** Every workflow with a `schedule:` has run recently and succeeded, and its
most recent run did the thing its name promises. A cron that silently stopped is
indistinguishable from a cron with nothing to do.

**Applies to.** Every workflow in `.github/workflows/` with a `schedule:` trigger —
currently `audit-weekly` and `issue-burndown`.

**Pass.** Each has a run inside twice its cron interval, and the latest concluded
`success`. A `success` that did nothing is a pass only if doing nothing was correct — a
burndown `no_work` morning is correct; a backup that uploaded nothing is not.
**Fail.** No run inside twice the interval; a failing latest run; or a succeeding run whose
log or step summary shows it skipped its actual work.
**n/a.** No scheduled workflows.

**Evidence.** The workflow, its cron, the timestamp and conclusion of its latest run, and
the run URL.

**Severity.** `critical` for the S3 backup — a backup that stopped is discovered when it is
needed. `medium` for the others.

**Probes.** `gh run list --workflow <name> --limit 5` for each. GitHub delays scheduled runs
under load and drops them on inactive repositories, so judge against twice the interval.
For the two model workflows, read the latest run's step summary: a burndown that declined
the same issue every day, or an audit with a high `not_evaluated` count, is worth the note
even when the run passed.

### AUD-OPS-06 — every job holds the least permission it needs

**Invariant.** Workflow-level `permissions` is `{}` or read-only, and each job widens only
to what its steps use. A token scoped wider than its job is the blast radius of any
compromised dependency in that job.

**Applies to.** Every workflow and job `permissions` block.

**Pass.** Every write grant maps to a step that uses it: `contents: write` to a push or a
release, `issues: write` to an issue edit, `id-token: write` to a federation exchange.
**Fail.** A write grant no step uses; a workflow-level write grant that applies to jobs
which do not need it; a job with no `permissions` block in a workflow that sets none (which
inherits the repository default).
**n/a.** Never.

**Evidence.** The workflow, the grant, and the absence of any step that needs it.

**Severity.** `medium`. `high` for an unused `contents: write` or `id-token: write` in a
workflow triggered by `pull_request` or `issues`.

**Probes.** Read every `permissions:` block and the steps beneath it.

### AUD-OPS-07 — each dependency ecosystem has exactly one automated updater

**Invariant.** One bot owns each ecosystem. Two bots updating the same `uses:` lines open
competing pull requests, rebase over each other, and can pin different SHAs for the same
version — noise a reviewer resolves by hand every week.

**Applies to.** `.github/dependabot.yml` and `renovate.json`.

**Pass.** No ecosystem (npm/bun, github-actions) is enabled in both.
**Fail.** An ecosystem both configure.
**n/a.** Only one updater is configured.

**Evidence.** The ecosystem and both config locations.

**Severity.** `low`. `medium` if the two configs set different cooldowns or pinning rules
for the same ecosystem, because then which rule applies depends on which bot got there
first.

**Probes.** Read both files. Confirm against the last month of dependency pull requests:
`gh pr list --state all --label dependencies --limit 30 --json author,title`.
