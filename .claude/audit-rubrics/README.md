# Audit rubrics

A rubric is a gradeable rule set for one dimension of the weekly repo audit — rules with
stable, citable IDs that [`/audit-repo`](../skills/audit-repo/SKILL.md) walks and records a
status against. They exist so the audit grades the same repository against the same
definition of good every week, instead of re-inferring what "good" means from whatever it
happened to read first.

Most of what they encode already exists as prose in
[`docs/authoring-skills.md`](../../docs/authoring-skills.md) and
[`AGENTS.md`](../../AGENTS.md). The difference is that those files tell an author what to
do next and a rubric tells a grader what to check, with a status vocabulary and severity
bounds attached. When the two disagree, `docs/authoring-skills.md` wins and the rubric is
the thing to fix — a rubric that has drifted from the convention it grades is worse than
no rubric, because it files tickets against a standard nobody agreed to. (Where
`AGENTS.md` and `docs/authoring-skills.md` disagree with each other, that disagreement is
itself a finding: `AUD-GEN-05`.)

## Ground rules

**IDs are stable.** `AUD-SKL-04` means the same thing in week 3 and week 60. Every filed
issue carries its rule ID in the dedupe key, so renaming or renumbering a rule orphans
every ticket that cites it and silently refiles findings the team already declined. Add new
IDs; never reuse a retired one.

**The invariant is the rule; the probe is not.** "Every tool a skill's body calls is
declared in its frontmatter" is durable. A `grep` over the rendered `SKILL.md` is this
month's way of checking it. Probes are listed separately and expected to change —
replacing one is routine, and does not need a version bump. Changing what an invariant
requires does.

**Every rule gets a status, every run.** `pass`, `fail`, `n/a`, or `not-evaluated`. A rule
the audit did not get to is `not-evaluated` and says why. It is never silently dropped, and
it never rounds to `pass` — an unaudited surface reported as clean is worse than no audit,
because it retires the question.

**Rules state the doctrine; evidence lives with the rule.** A rule that names a file, a
threshold, or a value says where it came from, so a grader can re-derive it rather than
trust it.

**Skill prose is not graded by machine.** The product of this repository is instructions
for a model, and most of what matters about them — whether a phase defines its failure
path, whether a persona is predictive or decorative, whether two snippets contradict each
other once composed — cannot be settled with a regular expression. Where a rule needs
judgement, it says so and bounds the judgement: what to read, how many skills to sample,
and what a failure looks like concretely enough that two graders would agree. A sampled
rule reports its sample size. `AUD-RUN-06` treats a sample presented as a sweep as a
failure.

## Status vocabulary

| Status | Means |
| --- | --- |
| `pass` | Checked, and the invariant holds. |
| `fail` | Checked, and it does not. Produces a finding, which may still be deduped away. |
| `n/a` | The rule's subject does not exist in this repo right now. Say what was looked for. |
| `not-evaluated` | Not checked — no time, no access, no working probe. Say which. |

`n/a` and `not-evaluated` are different claims. `n/a` means the audit looked and there was
nothing to grade. `not-evaluated` means the audit did not look. Collapsing them hides the
audit's own gaps, which is what `AUD-RUN-06` exists to catch.

## Severity

`low` · `medium` · `high` · `critical`. Each rule carries bounds — a floor, a ceiling, or
the condition that moves it — so severity is argued from the rule rather than from how
alarming the finding felt. A finding may sit below a rule's stated ceiling; it may not
exceed it without saying why in the ticket.

One calibration for this repository specifically: **a skill that makes an agent do the
wrong thing confidently is worse than a skill that makes it stop.** A missing fallback that
halts a run is annoying; an instruction that sends an email without approval, runs a write
query unasked, or ships literal `{{SNIPPET:...}}` text into every installed copy, is the
failure that costs someone real time or trust. Rules that guard agent behaviour carry
higher ceilings than rules that guard tidiness.

A second one: **this marketplace ships to other people's machines.** Plugins are installed
by customers and colleagues, `mcp/*.json` and `skills.json` are consumed by raw URL, and
bundled scripts run with the installing agent's privileges. A defect in a shipped artifact
outranks the same defect in repo tooling.

## Reporting contract

The audit writes `$AUDIT_SUMMARY` with a `results` row for every rule in the evaluated
rubric plus every rule in `audit-integrity.md`:

```json
{
  "rubric_version": 1,
  "focus": "skills",
  "coverage": { "total": 17, "pass": 11, "fail": 2, "n_a": 2, "not_evaluated": 2 },
  "results": [
    {
      "rule_id": "AUD-SKL-03",
      "status": "fail",
      "evidence": ["plugins/narrative-identity/skills/generate-match-report/SKILL.md"],
      "note": "1117 rendered lines against the ~500-line body budget; 11 of 11 skills swept",
      "finding_key": "skills/aud-skl-03/generate-match-report"
    }
  ]
}
```

No aggregate health score. A single number invents precision the evidence does not support
and gets optimised toward; `coverage` plus the failures is the honest version.

## The rubrics

| File | Rules | Graded |
| --- | --- | --- |
| [`audit-integrity.md`](audit-integrity.md) | `AUD-RUN-01..06` | The audit itself. Every week, regardless of focus. |
| [`skills.md`](skills.md) | `AUD-SKL-01..11` | ISO week ≡ 0 (mod 3) |
| [`tooling.md`](tooling.md) | `AUD-GEN-01..07` | ISO week ≡ 1 |
| [`automation.md`](automation.md) | `AUD-OPS-01..07` | ISO week ≡ 2 |

Three areas: the skills themselves (the product), the generators and manifests that turn
them into installable artifacts (the build), and the workflows and credentials around both
(the automation). Each comes round roughly every three weeks.

`rubric_version` is `1`. Bump it when an invariant changes meaning, not when a probe or a
piece of wording does — the audit compares versions to decide whether last week's `pass` is
still evidence of anything.

## Adding a rule

Append the next ID in the family. Write the invariant so it would still be true if every
tool named in the probes were replaced. Give it pass and fail conditions a second reader
would grade the same way, the evidence a finding must cite, and severity bounds. Then
update the rule range in this README's table.

Before adding one, check it is not already a CI gate. `bun run ci` runs `check:skill-docs`,
`check:mcp`, `check:skills-index`, `check:readme`, `check:manifests`, `check:spec`,
`check:versions`, Biome, `tsc`, knip and `bun test`; `zizmor`, `shellcheck` and the PR-title
lint run beside it. All of them fail the build faster and more specifically than a weekly
ticket would. `AUD-RUN-04` exists to catch a rule that duplicates one of them.
