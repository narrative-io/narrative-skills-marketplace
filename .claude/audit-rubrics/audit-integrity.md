# Rubric: Audit integrity

**Grades:** the audit run itself — whether this week's pass was honest, complete, and safe to act on
**Rule IDs:** `AUD-RUN-01..06`, stable and citable
**Evaluated:** every week, in addition to the rotating rubric
**Conventions:** [`README.md`](README.md)

## 0. How to use this rubric

Everything else in this directory grades the repository. This one grades the audit, and it
runs every week no matter which area is in rotation. It exists because the failure mode of
a standing audit is not missing a defect — it is producing a confident report that nobody
can tell is hollow. A run that files three good tickets while silently skipping four rules
is worse than a run that files nothing and says so.

A `fail` here does not become a GitHub issue. It goes in the summary and the run page, at
the top, as a defect in the run. If the audit cannot grade itself honestly, the rest of the
report is unverified.

## The rules

### AUD-RUN-01 — the ledger was loaded before any repository file was read

**Invariant.** The audit's memory is loaded, and confirmed loaded, before inspection
begins. Reading the repository first biases every later dedupe decision toward "this is
new."

**Applies to.** Step 2 of [`/audit-repo`](../skills/audit-repo/SKILL.md).

**Pass.** `gh issue list --label repo-audit --state all` returned successfully and its
output was read in full, before any repository file was opened. An empty ledger passes —
that is a real first run, and it is reported as one.
**Fail.** The call errored, returned partially, hit the pagination limit without the run
noticing, or ran after inspection started.
**n/a.** Never.

**Evidence.** The ledger entry count, and the count of distinct `audit-key` values in it.

**Severity.** `critical` — a run that fails this cannot dedupe, so it must file nothing.
Report the failure and stop.

**Probes.** `gh auth status` first; a non-zero exit from the `issue list` call is a fail.
Zero issues on a repository that has never run the audit is a pass. If the returned count
equals `--limit`, the list was truncated and this is a fail, not a pass on a short ledger.

### AUD-RUN-02 — every rule has a status

**Invariant.** The report accounts for every rule in the evaluated rubric plus every rule
in this one. Coverage is stated, not implied.

**Applies to.** `$AUDIT_SUMMARY.results` and `$AUDIT_SUMMARY.integrity`.

**Pass.** The two arrays together hold exactly one row per rule ID in scope, each with
`pass`, `fail`, `n/a`, or `not-evaluated`, and `coverage.total` equals that count.
**Fail.** A rule ID is missing, duplicated, or carries a status outside the vocabulary.
**n/a.** Never.

**Evidence.** The coverage block, and the list of `not-evaluated` rule IDs with reasons.

**Severity.** `high`. A missing row is indistinguishable from a pass to every downstream
reader, which is the whole problem.

**Probes.** Diff the rule IDs in `results` plus `integrity` against the `###` headings in
the two rubric files that were in scope.

### AUD-RUN-03 — every failure is actionable on its own

**Invariant.** A `fail` row carries enough for someone who was not in the run to confirm
it, judge it, and start on it.

**Applies to.** Every `fail` row, and every issue filed from one.

**Pass.** The finding names its rule ID, the observed state with `path` or `path:line` or a
reproducing command, the expected state the invariant defines, who is affected, a proposed
fix naming files, and how to verify the fix.
**Fail.** Any of those is missing, or the observed state is a characterisation rather than
an observation. "The skills handle errors inconsistently" is not an observation;
"`write-nql/SKILL.md:212` retries validation up to 3 times and `profile-dataset/SKILL.md:140`
retries forever" is.
**n/a.** No failures this run.

**Evidence.** The issue body, which carries all six sections.

**Severity.** `high`. Unactionable tickets are how a standing audit gets muted.

**Probes.** Read each filed body against the template in `/audit-repo` step 7.

### AUD-RUN-04 — CI failures are not refiled as audit tickets

**Invariant.** The audit reports what the build does not already catch. A finding the
existing gates fail on is duplicate noise, and it arrives in a slower, less specific form
than the red check the team already has.

**Applies to.** Anything these fail on today: every step of `bun run ci`
(`check:skill-docs`, `check:mcp`, `check:skills-index`, `check:readme`, `check:manifests`,
`check:spec`, `check:versions`, `biome check`, `tsc --noEmit`, `knip`, `bun test`), plus
`zizmor`, `shellcheck`, and the PR-title lint in `pr-title.yml`.

**Pass.** No filed finding restates a condition one of those gates already fails on.
**Fail.** An issue duplicates a currently-failing or would-fail check.
**n/a.** Never.

**Evidence.** For any near-miss, name the gate and why it does not in fact cover the
finding. `check:manifests` checks that a `requires.skills` id resolves; it does not check
that the body actually tells the agent to call it, and a rule about the latter is not a
duplicate of it. Saying so is what distinguishes the two.

**Severity.** `medium`.

**Probes.** For a candidate, ask which existing check would go red. If one would, drop it.

### AUD-RUN-05 — dedupe is by rule and target, declined findings included

**Invariant.** The same defect resolves to the same key every week regardless of wording,
and a finding the team declined never returns.

**Applies to.** Step 6 of `/audit-repo`.

**Pass.** Every candidate's key is `<area>/<rule-id>/<target>`, derived from the rule it
failed and the thing it touches. Each key was checked against every ledger entry — open,
closed as completed, **and** closed as not planned. Anything matching an issue closed as
not planned was dropped and recorded as `declined` in `skipped`.
**Fail.** A key was derived from a title; a declined finding was refiled, including in
softened or narrowed form; the declined entries were not consulted.
**n/a.** Never.

**Evidence.** The `skipped` array, each row naming the key, the reason, and the matched
issue.

**Severity.** `critical` when a declined finding was refiled — that is the failure that
gets the whole audit muted. `high` otherwise.

**Probes.** Recompute each key from `(area, rule_id, target)` and confirm it matches what
was filed. Confirm every declined ledger key is absent from `filed`.

### AUD-RUN-06 — gaps are reported, not inferred away

**Invariant.** What the audit could not check is part of the report. Unavailable evidence
never becomes a `pass`, and a sample is never presented as a sweep.

**Applies to.** Every `n/a` and `not-evaluated` row, every sampled rule, and any surface
the run knowingly skipped.

**Pass.** Each `n/a` says what was looked for and why nothing was found. Each
`not-evaluated` says why — out of time, no credential, no working probe. Sampling is
stated: a rule that read 4 of 11 skills says 4 of 11, in the `note`, and its `pass` claims
nothing about the other 7.
**Fail.** A rule the audit skipped is reported as `pass`; an `n/a` with no explanation; a
sampled measurement presented as complete.
**n/a.** Never.

**Evidence.** The `note` on each non-`pass`, non-`fail` row, and on every sampled row
whatever its status.

**Severity.** `high`. This is the rule that keeps `coverage` meaningful, and `coverage` is
the only defence against a confident empty audit.

**Probes.** Every row whose status is not `pass` or `fail` must have a non-empty `note`.
Every rule this repository's rubrics mark as sampled must state its sample size whatever
its status.
