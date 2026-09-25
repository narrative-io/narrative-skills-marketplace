# Rubric: Tooling

**Grades:** the generators, manifests and release process that turn skills into installable artifacts — and whether the docs describing them are still true
**Rule IDs:** `AUD-GEN-01..07`, stable and citable
**Evaluated:** ISO week ≡ 1 (mod 3)
**Conventions:** [`README.md`](README.md) · **Source of truth:** [`docs/authoring-skills.md`](../../docs/authoring-skills.md), [`RELEASING.md`](../../RELEASING.md)

## 0. How to use this rubric

Between a `SKILL.md.tmpl` and an installed plugin sit `scripts/gen-*.ts` (render, index,
MCP config, README), `scripts/check-*.ts` (the CI gates), `scripts/build-portable.ts`, and
`scripts/release.ts`. Their outputs — rendered skills, `skills.json`, `mcp/*.json`,
`.claude-plugin/marketplace.json`, `dist/` — are consumed by Claude Code, by other harnesses
over raw GitHub URLs, and by the sandbox bundle. A defect here is multiplied across every
skill.

`bun run ci` already fails on a stale rendered file, a stale index, stale MCP config, a
stale README, manifest shape errors, spec violations and missing skill version bumps.
`AUD-RUN-04` forbids refiling those. This rubric grades what the gates cannot see: whether
the gates themselves can fail, whether the pieces agree with each other, and whether the
docs describe the tooling that exists.

Several probes run a script. Run them in a scratch worktree, never in the checkout — the
audit is read-only:

```sh
git worktree add --detach "$RUNNER_TEMP/scratch" HEAD
cd "$RUNNER_TEMP/scratch" && bun install --frozen-lockfile
```

## The rules

### AUD-GEN-01 — plugin versions move when plugins change

**Invariant.** `RELEASING.md`: per-plugin `plugin.json` versions "stay on their own SemVer
and should be bumped in the PR that changes the plugin, not at release time", and every
`plugins[].version` in `.claude-plugin/marketplace.json` equals the most recent release
tag. A plugin whose content changed since its version last moved tells an installer
nothing changed.

**Applies to.** Every `plugins/*/.claude-plugin/plugin.json`, and `marketplace.json`.

**Pass.** Each plugin's `version` was last changed at or after the most recent commit that
touched anything else under that plugin's directory; and every marketplace entry equals the
latest `v*` tag with the `v` stripped.
**Fail.** A plugin with commits under its directory newer than the commit that last changed
its `version`; a marketplace entry that disagrees with the latest tag.
**n/a.** Never.

**Evidence.** The plugin, its current version, the commit that last set it, and the newest
commit under the plugin since — `git log -1 --format='%h %cs' -- <path>` for each.

**Severity.** `medium`. `low` if the only changes since the bump are to rendered
`SKILL.md` files regenerated from an unchanged template.

**Probes.** `git log -L '/"version"/,+1:plugins/<p>/.claude-plugin/plugin.json'` for the
last version change; `git log -1 -- plugins/<p>` for the last content change;
`git describe --tags --abbrev=0` for the tag. Whole sweep.

### AUD-GEN-02 — every CI gate can actually fail

**Invariant.** Each `check:*` script in `package.json` rejects the defect it exists to
catch. A gate that cannot go red is indistinguishable from no gate, and it is the failure
nobody notices, because a green build is what everyone expects.

**Applies to.** `check:manifests`, `check:spec`, `check:versions`, `check:skill-docs`, and
the `--dry-run` modes of `gen:mcp`, `gen:skills-index` and `gen:readme`.

**Pass.** In the scratch worktree, each gate exits non-zero when fed one deliberately bad
input from its own header comment — a skill whose `name` disagrees with its directory, a
`.tmpl` edit with no version bump, a hand-edited rendered `SKILL.md`, a `plugin.json`
change with no regenerated `mcp/` file.
**Fail.** A gate exits zero on the defect its header says it catches.
**n/a.** Never.

**Evidence.** The gate, the defect introduced (as a diff), and the exit code.

**Severity.** `high`. Every rule in this rubric and the skills rubric assumes these gates
work.

**Probes.** One mutation per gate in the scratch worktree; reset between them with
`git checkout -- .`. Report which gates were exercised; a gate you did not mutate is
`not-evaluated` for that gate, said in the note, not a pass.

### AUD-GEN-03 — every MCP server a skill needs is provided by its plugin

**Invariant.** A skill that declares an MCP server under `metadata.narrative.requires` or
`.recommends` is shipped in a plugin whose `plugin.json` `mcpServers` block defines that
server by the same name. Otherwise the plugin installs cleanly and the skill fails on
first use. `check:manifests` resolves `requires.skills` ids but not server names.

**Applies to.** Every skill's declared `mcp-servers`, against its own plugin's
`plugin.json`.

**Pass.** Every declared server name is a key in the owning plugin's `mcpServers`.
**Fail.** A declared server the plugin does not define; or a plugin that defines a server
none of its skills declare (dead config shipped to every installer).
**n/a.** Never.

**Evidence.** The skill, the server name, and the plugin's `mcpServers` keys.

**Severity.** `high` for a required server the plugin does not provide. `medium` for a
recommended one. `low` for an unused server.

**Probes.** Parse each rendered `SKILL.md` frontmatter and each `plugin.json`; compare
sets. Whole sweep.

### AUD-GEN-04 — the portable build is complete and collision-free

**Invariant.** `bun run build:portable` produces a flat `dist/skills/` containing every
skill on disk exactly once, with its `references/`, `scripts/` and `assets/`. The flat
layout (the script's header explains why) means two plugins shipping a skill with the same
directory name silently overwrite each other.

**Applies to.** `scripts/build-portable.ts` and its output.

**Pass.** In the scratch worktree, `dist/skills/` holds one directory per skill in
`git ls-files 'plugins/*/skills/*/SKILL.md'`, no skill name appears under two plugins, and
every tier-3 file under a source skill exists under its `dist/` copy.
**Fail.** A missing skill, a name collision, or a dropped reference/script/asset.
**n/a.** Never.

**Evidence.** The skill and what is missing or collided, with both source paths for a
collision.

**Severity.** `high` for a collision or a dropped file the body links to — a harness user
gets the wrong skill or a broken reference with no error. `medium` otherwise.

**Probes.** Run the build in the scratch worktree; diff the directory listing against the
source.

### AUD-GEN-05 — the contributor docs agree with each other and with the code

**Invariant.** `AGENTS.md`, `README.md`, `RELEASING.md` and `docs/authoring-skills.md`
describe the same frontmatter shape, the same commands, and the same layout the scripts
implement. `docs/authoring-skills.md` is canonical ("Where we diverge, this file is the
source of truth"); `AGENTS.md` is its 60-second summary. A summary that teaches the old
shape is how new skills get written wrong.

**Applies to.** Every frontmatter example, command, path and structure diagram in those
four files.

**Pass.** Every example frontmatter block matches what `check:spec` enforces
(`metadata.version`, `compatibility` as a string, `allowed-tools` as the spec defines it);
every `bun run <x>` named exists in `package.json`; every path named exists.
**Fail.** An example that `check:spec` would reject; a command or path that does not exist;
a documented step that the docs themselves say is not wired up ("until `skills-ref` is
wired into `bun run ci`") and still is not.
**n/a.** Never.

**Evidence.** Both locations, quoted — the doc line and the script line or file that
contradicts it.

**Severity.** `medium`. `high` when the wrong example is in `AGENTS.md`'s "SKILL.md format"
section, because that is the block an agent authoring a new skill copies.

**Probes.** Extract fenced `yaml` blocks from the four files and run each through the same
checks `scripts/check-spec.ts` applies. Grep for `bun run ` and compare against
`package.json` scripts. Whole sweep — the files are short except the guide.

### AUD-GEN-06 — every snippet is used, and used as a snippet

**Invariant.** §8: a snippet exists because two or more skills share a passage. A snippet
no template references is dead text that still looks authoritative; a passage duplicated
near-verbatim across skills that has *not* been snippeted is the drift §8 exists to
prevent.

**Applies to.** `snippets/*.md`, `plugins/*/_snippets/*.md`, and every `*.tmpl`.

**Pass.** Every snippet is referenced by at least one `{{SNIPPET:<name>}}` in a `.tmpl` or
in another referenced snippet, and in the week's **sample of 3** skills, no paragraph of
five or more lines appears near-verbatim in a second skill without being a snippet.
**Fail.** An unreferenced snippet; a plugin-local snippet shadowing a shared one of the
same name with no note saying why; a duplicated passage in the sample.
**n/a.** Never.

**Evidence.** The snippet path and its reference count; for duplication, both
`path:line` ranges.

**Severity.** `low`. `medium` for shadowing, because the same placeholder then renders
differently depending on the plugin, which nobody reading one skill would guess.

**Probes.** `grep -rho '{{SNIPPET:[a-z0-9-]*}}'` over `.tmpl` files and snippets; compare
against the snippet file list.

### AUD-GEN-07 — the release path still reaches a tag

**Invariant.** A squash-merged `chore(release): vYYYY.MM.PATCH` commit on `main` produces a
tag and a GitHub Release via `auto-release.yml`, and the subject `scripts/release.ts`
writes matches the regex that workflow detects. If the two drift, a release PR merges and
nothing ships.

**Applies to.** The commit subject `release.ts --apply` produces, the regex in
`auto-release.yml`'s "Detect release commit" step, and the most recent release commit.

**Pass.** The subject format in `release.ts` matches the workflow regex, and the most recent
`chore(release):` commit on `main` has a matching tag and a published Release.
**Fail.** The formats disagree; or a release commit on `main` has no tag or no Release.
**n/a.** No release commit exists yet.

**Evidence.** Both patterns quoted; the untagged commit's SHA.

**Severity.** `high` — the failure is silent until someone installs and wonders why a fix
never arrived.

**Probes.** Read the `git commit -m` / PR title in `release.ts` and the `[[ =~ ]]` line in
`auto-release.yml`. `git log --grep '^chore(release):' -1 --format=%H main`, then
`git tag --points-at <sha>` and `gh release view <tag>`.
