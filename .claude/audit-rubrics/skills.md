# Rubric: Skills

**Grades:** the skills themselves — what an installed agent reads, and whether following it produces the right behaviour
**Rule IDs:** `AUD-SKL-01..11`, stable and citable
**Evaluated:** ISO week ≡ 0 (mod 3)
**Conventions:** [`README.md`](README.md) · **Source of truth:** [`docs/authoring-skills.md`](../../docs/authoring-skills.md)

## 0. How to use this rubric

This is the largest rubric of the three because it grades the thing the repository ships.
Every skill under `plugins/*/skills/` is installed onto someone else's agent, and what the
agent reads is the **rendered** `SKILL.md` plus whatever `references/`, `scripts/` and
`assets/` it follows links into. Grade the rendered files, never the `.tmpl` alone —
`docs/authoring-skills.md` §12 is explicit that snippet-driven conflicts only exist in the
composed output.

Several rules are **sampled**, because reading eleven 500-to-1100-line skills closely in
one run is not honest grading. The sample is chosen deterministically so coverage rotates
week to week rather than re-reading the same skills:

```sh
# every tracked skill, sorted; pick N starting at an offset derived from the ISO week
git ls-files 'plugins/*/skills/*/SKILL.md' | sort > "$RUNNER_TEMP/skills.txt"
n=$(wc -l < "$RUNNER_TEMP/skills.txt"); week=$((10#$(date -u +%V)))
# skill i (0-based) is in this week's sample when (i - week*N) mod n < N
```

A sampled rule's `pass` claims nothing about the skills it did not read, and `AUD-RUN-06`
fails the run if the report pretends otherwise.

What is deliberately *not* here, because `bun run ci` already fails on it and `AUD-RUN-04`
treats refiling it as a defect: name/directory agreement, the name regex, the 1024-char
description cap, `metadata.version` presence and bumps, `compatibility` being a string,
dangling or cyclic `requires.skills`, and a stale rendered `SKILL.md`. What is here is what
those checks cannot see.

## The rules

### AUD-SKL-01 — no shipped file contains an unresolved placeholder

**Invariant.** No file an agent can load contains literal `{{RESOLVER}}` or
`{{SNIPPET:...}}` text. `AGENTS.md` and §8 both call this out: the renderer only processes
`*.tmpl`, so a placeholder in a hand-maintained `.md` ships verbatim to every installed
copy, and `check:skill-docs` cannot see it because it never renders that file.

**Applies to.** Every tracked, non-`.tmpl` file under `plugins/*/skills/`. Excluded:
`plugins/*/_snippets/` and `snippets/` (sources, inlined into templates), and files whose
first non-blank line is the `narrative-skills:no-render` marker.

**Pass.** No match, or every match is demonstrably content rather than a placeholder — a
Jinja or Handlebars example inside a fenced code block, say — and the note says which.
**Fail.** A `{{UPPER_CASE}}` or `{{UPPER_CASE:...}}` token outside a code fence in a shipped
file.
**n/a.** Never.

**Evidence.** `path:line` for each, and whether a same-named `.tmpl` exists beside it (which
means the placeholder was added to the rendered file by hand and will be overwritten).

**Severity.** `high` — the agent reads the literal token instead of the instruction it
stood for. `medium` if the token is in a reference the body never links to.

**Probes.** `git ls-files 'plugins/*/skills/**' | grep -v '\.tmpl$' | xargs grep -nE
'\{\{[A-Z][A-Z0-9_]*(:[^}]*)?\}\}'`, then read each hit in context. Whole sweep.

### AUD-SKL-02 — declared requirements match what the body calls

**Invariant.** Every non-default tool, MCP server, MCP tool and sibling skill the body
instructs the agent to use is declared under `metadata.narrative.requires` or
`.recommends`, and every declared one is actually used. §10: the declaration "doubles as a
hint to the agent about what the skill is going to do", and `skills.json` publishes it to
other harnesses. `AskUserQuestion` and other Claude Code primitives sit under
`recommends`, never `requires` (§10, §11).

**Applies to.** Every rendered `SKILL.md`, and the references it links to.

**Pass.** For every skill, the set of MCP tool names and non-default tools appearing in
the body equals the declared set, and no Claude Code primitive is under `requires.tools`.
**Fail.** A tool or server the body calls that is declared nowhere; a declared one the body
never mentions; a `requires.skills` entry the body never tells the agent to invoke (§10:
"a `requires.skills` entry doesn't invoke anything on its own"); `AskUserQuestion` under
`requires`.
**n/a.** Never.

**Evidence.** The skill, the tool name, where the body calls it (`path:line`), and what the
frontmatter declares.

**Severity.** `medium`. `high` when a *required* MCP server is undeclared, because the
plugin can install without it and the skill fails mid-run with no fallback pointed at.

**Probes.** Parse frontmatter (`gray-matter` is installed; `bun -e` works). Grep the body
for MCP tool names (`narrative_[a-z_]+`, `mcp__`, and the names declared in any
`plugin.json`) and for the harness tools §10 names. Whole sweep for the mechanical half;
read context before calling a mention a call.

### AUD-SKL-03 — bodies stay inside the progressive-disclosure budget

**Invariant.** A rendered `SKILL.md` body is under roughly 500 lines / 5,000 tokens (§5,
matching the spec's own recommendation); references are one level deep from the skill
root; every relative link in the body resolves to a file in the skill.

**Applies to.** Every rendered `SKILL.md`.

**Pass.** Every body is ≤ 550 lines (the 10% is tolerance, not a new budget), every
reference link resolves, and no reference path is more than one directory below the skill
root.
**Fail.** A body over 550 lines; a link to a missing file; a reference at
`references/a/b.md` depth.
**n/a.** Never.

**Evidence.** For the budget: every offending skill with its line count, in one list. For
links: `path:line` and the missing target.

**Severity.** `low` for the budget — it degrades attention, it does not produce a wrong
answer. `medium` for a broken reference link, because the body is telling the agent to
read something that is not there.

**Probes.** `wc -l` on each rendered `SKILL.md`; extract `](references/...)`,
`](scripts/...)`, `](assets/...)` targets and test each. Whole sweep. **File the budget
failures as one issue with target `over-budget`**, listing every offender — a per-skill
issue for each is five tickets saying one thing, and splitting a skill into references is a
judgement call the team will want to sequence.

### AUD-SKL-04 — every body carries the required structure

**Invariant.** §5's required sections are present, in order: `## Persona`, a one-paragraph
lede, `## Arguments` when the skill takes any, `## When to use` with an explicit "do NOT
use" pointer to siblings, `## Procedure` with numbered phases, and `## Harness fallbacks`.
§4 bounds the persona: functional role, ranked priorities, anti-patterns — no biography.

**Applies to.** Every rendered `SKILL.md`.

**Pass.** Every skill has each required heading (exact names or an unambiguous variant), the
phases are numbered sequentially, and the persona names a role, priorities and at least one
anti-pattern.
**Fail.** A required section missing; phases that skip or repeat a number; a persona that
is generic framing ("You are a helpful assistant") or biography.
**n/a.** Never.

**Evidence.** The skill and the missing or malformed section.

**Severity.** `low`. `medium` when the missing section is `## Harness fallbacks` on a skill
that `requires` an MCP server — that is the section §10 says the agent falls through to
when the server is absent.

**Probes.** Grep `^## ` headings per skill and compare against §5. Whole sweep for
headings; read personas in the week's **sample of 4**.

### AUD-SKL-05 — external and irreversible actions sit behind an approval gate

**Invariant.** Any phase that sends something outside the conversation (email, Slack, a
GitHub issue or PR), or performs an irreversible platform write (creating or deleting a
dataset, materialising a view, running a write query, activating an audience to a
connector, submitting a workflow), is preceded by a phase that shows the user what will
happen and requires explicit approval. `AGENTS.md` principle 5 and §5 phase-level
patterns: "the phase that drafts produces an artifact; a separate gated phase sends it."

**Applies to.** Every rendered `SKILL.md` and linked reference that instructs a write.

**Pass.** Every write-shaped instruction has an approval gate before it, and flags that
skip the gate (`--yes`, `--no-confirm`) are documented as such in `## Arguments`.
**Fail.** A write the agent is told to perform without a preceding confirmation; a gate that
is described as optional in prose ("confirm if appropriate"); a gate on the happy path that
a retry or error branch bypasses.
**n/a.** No skill instructs a write.

**Evidence.** `path:line` of the write instruction, and the nearest preceding gate or its
absence.

**Severity.** `high`. `critical` when the ungated action is an external send or a delete.
This is the rule that makes an installed skill safe to run on someone else's account.

**Probes.** Grep for write-shaped MCP tool names (`create`, `delete`, `update`, `submit`,
`activate`, `materialize`, `send`, `post`) and for `INSERT`/`CREATE`/`DROP` in NQL
examples, then read backwards from each to the gate. Whole sweep — this one is worth the
budget.

### AUD-SKL-06 — every branch defines its failure path

**Invariant.** §12 "Semantic coverage": every external call says what to do on error,
timeout and empty result; every retry is bounded and says what happens on exhaustion; every
`AskUserQuestion` says what happens for each answer, including free text; polling loops
have a ceiling.

**Applies to.** The week's **sample of 3** skills, read end to end.

**Pass.** In the sample, every tool call and question has a defined failure or
alternative-answer path.
**Fail.** An unbounded retry or poll; a call with no error handling where an error is
plausible; a question whose "none of these" answer is undefined.
**n/a.** Never.

**Evidence.** `path:line` of each gap and the specific input that falls through it.

**Severity.** `medium`. `high` for an unbounded loop against a billed or rate-limited API.

**Probes.** Read the sampled skills in full. Report the sample in the note.

### AUD-SKL-07 — descriptions route correctly

**Invariant.** §3: the description is the only thing the model sees at routing time. It
leads with an active verb, carries 3–6 verbatim trigger phrases in a `Use when:` line, ends
with the `(<plugin>)` tag, aims under ~600 characters, carries no marketing language, and
names the boundary when a sibling skill overlaps.

**Applies to.** Every skill's `description`.

**Pass.** Every description meets the shape, and no two skills' trigger phrases overlap
without one of them naming the other.
**Fail.** No trigger phrases; a missing plugin tag; a description over 800 characters (the
600 target plus tolerance); two skills that would both match a plausible request with
neither naming the boundary.
**n/a.** Never.

**Evidence.** The skill, the description length, and for an overlap, the phrase both would
match.

**Severity.** `low`. `medium` for an unmarked overlap, because the router picks one at
random and the user gets the wrong workflow.

**Probes.** Parse every description; check length, the `Use when:` line and the tag
mechanically, then read all of them side by side for overlap. Whole sweep — there are only
a handful.

### AUD-SKL-08 — no portability defects on the shared surface

**Invariant.** §11's defect table: no hardcoded harness paths (`.claude/`,
`~/.claude/skills/`), no absolute machine paths (`/Users/`, `/home/`), no harness-specific
tool instructions without a declared fallback, no undeclared runtime assumption (a script
that needs `python3` or `jq` without saying so in `compatibility`).

**Applies to.** Every shipped file under `plugins/*/skills/`.

**Pass.** None of the defects appear, or each appearance is inside a harness-specific
section that says so and has a fallback.
**Fail.** Any defect from the table, outside such a section.
**n/a.** Never.

**Evidence.** `path:line` and the row of §11's table it matches.

**Severity.** `medium`. `high` for an absolute path in a script, which fails outright on
every machine but the author's.

**Probes.** `grep -rnE '(\.claude/|~/\.claude|/Users/|/home/[a-z])'` over shipped files;
for each `scripts/` file, compare its interpreter and external commands against the
skill's `compatibility` string. Whole sweep.

### AUD-SKL-09 — bundled scripts are safe to run on someone else's machine

**Invariant.** §12 "Bundled-script safety": no remote-pipe execution, no secrets in the
tree, no unscoped destructive operations, a correct shebang with no bash-isms under
`#!/bin/sh`, and any network call or credential touch visible in the body.

**Applies to.** Every file under `plugins/*/skills/*/scripts/`.

**Pass.** Every script meets all five.
**Fail.** Any one of them violated.
**n/a.** No skill ships a `scripts/` directory.

**Evidence.** `path:line` and which of the five it breaks.

**Severity.** `high`. `critical` for a committed secret or `curl | sh` — both run with the
installing agent's privileges on a machine this repository does not own. A committed
secret is also a rotation, not just an issue; say so in the ticket.

**Probes.** Read every script in full; there are few. Grep for `curl`, `wget`, `eval`,
`rm -rf`, `token`, `secret`, `key`, and base64-looking literals.

### AUD-SKL-10 — untrusted content is fenced before it reaches another model call

**Invariant.** §12 "Prompt-injection hygiene": when a phase feeds user-supplied content, MCP
results, web fetches, or another skill's output into a subagent or a second model call, it
wraps the payload in tags and says it is data, not instructions.

**Applies to.** The week's **sample of 3** skills (the same sample as `AUD-SKL-06`), plus
every skill that dispatches a subagent or hands tool output to another model call, found by
grep.

**Pass.** Every such hand-off fences the payload and says so.
**Fail.** A hand-off that interpolates untrusted content into instructions unfenced.
**n/a.** No skill hands content to a second model call.

**Evidence.** `path:line` of the hand-off and the source of the untrusted content.

**Severity.** `medium`. `high` when the receiving call can perform a write, because then a
crafted dataset description or knowledge-base page can trigger it.

**Probes.** Grep for subagent / `Task` / `Agent` dispatch and "pass the output to" phrasing;
read each in context.

### AUD-SKL-11 — the composed skill does not contradict itself

**Invariant.** §12 "Contradictions", "Persona consistency" and "Snippet composition
conflicts": the rendered body sets each rule once; no two sections (or a section and an
inlined snippet) give conflicting instructions, formats or priorities; the persona's
priorities are consistent with what the procedure actually does.

**Applies to.** The two skills in the week's sample that inline the most snippets (count
`{{SNIPPET:` in each `.tmpl`), read in rendered form.

**Pass.** No contradiction found in the two skills read.
**Fail.** Two instructions the agent cannot both obey, quoted with both locations.
**n/a.** No skill in the sample inlines a snippet.

**Evidence.** Both `path:line` locations, quoted, and which one the agent would plausibly
follow.

**Severity.** `medium`. `high` when one side of the contradiction is an approval gate or a
safety rule — then the agent may follow the permissive side.

**Probes.** Read the two rendered skills end to end with the inlined snippets in view.
Report which two in the note.
