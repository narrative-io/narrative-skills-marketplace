# Changelog

All notable changes to this project are documented here. Releases
follow [CalVer](https://calver.org) as `YYYY.MM.PATCH` — see
[`RELEASING.md`](RELEASING.md) for the cadence and process.

The entries below are generated from conventional-commit subjects
(`feat:`, `fix:`, `docs:`, etc.) by `scripts/release.ts`. The same
release also publishes a [GitHub Release][gh-releases] with notes
grouped by PR label (see [`.github/release.yml`](.github/release.yml));
the two views are deliberately redundant.

[gh-releases]: https://github.com/narrative-io/narrative-skills-marketplace/releases

<!-- RELEASES BELOW -->

## [2026.06.0] - 2026-06-12

### ✨ Features

- **narrative-audience:** add create-lookalike skill (#69) (3ce38f1)
- **narrative-common:** add profile-dataset skill and adopt it across consumers (#63) (7f600b3)
- **skills:** document slash-command arguments in skill metadata (#62) (272c542)
- **narrative-common:** require MV metadata and calibrate async poll cadence (#60) (e758db0)
- **scripts:** render snippets in any plugins/**/*.tmpl file (#59) (7eccd3e)
- [SC-58661] add generate-match-report skill (#58) (0a0c2f2)
- **narrative-common:** hide workflow YAML behind --show-spec by default (#55) (776e9d9)
- **triage-pregraph-data:** default to combined-graph context (#56) (84cf0da)
- **rosetta-stone-mappings:** friendlier output, skip-revalidate handoff (#54) (801dcc1)

### 🧹 Maintenance

- **deps:** update github actions (#66) (5e5e9c2)
- **deps:** update minor and patch updates to ^6.14.2 (#67) (3d770ce)
- **mcp:** rename narrative-agent-feedback server to narrative-agent-gateway (#65) (ef3c2b2)
- **skills:** namespace args under narrative; document skills CLI (#64) (40de34e)
- **skills:** cross-harness portability audit and spec conformance (#61) (5fa7d0a)
- **deps:** update dependency typescript to ^6.0.3 (#57) (2cd1aa2)

### Other

- Create backup-daily.yml (#70) (4a76e93)


## [2026.05.3] - 2026-05-22

### ✨ Features

- **apply-rosetta-stone-mappings:** new skill for applying generated mappings (#52) (4539930)
- **triage-pregraph-data:** support access-rule sources + progressive disclosure (#51) (c5b031d)

### ♻️ Refactor

- **generate-identity-graph:** apply progressive disclosure (#50) (e3daf49)
- **narrative-common:** apply progressive disclosure to four skills (#49) (45e22ba)
- **write-nql:** extract NQL deep-dives into references; expand progressive-disclosure doc (#44) (e6799a7)

### 📚 Documentation

- **write-nql:** drop EXPLAIN forecast references (#43) (4fce72a)


## [2026.05.2] - 2026-05-20

### ✨ Features

- **release:** bump marketplace.json plugin versions to release tag (#40) (7643d38)

### 🐛 Bug Fixes

- **generate-identity-graph:** clarify source-list rule (#39) (34b6786)
- **generate-identity-graph:** enforce strict interactive mode (#38) (f9075af)
- **write-nql:** correct CMV gotchas from agent feedback (#36) (8992620)
- **release:** pipe PR body via stdin to avoid shell evaluation (#35) (d55e225)

### 🧹 Maintenance

- auto-regenerate skill artifacts in pre-commit hook (#37) (ace528c)


## [2026.05.1] - 2026-05-20

### ✨ Features

- **narrative-identity:** add generate-identity-graph skill (#3) (b5c04b0)
- **triage-pregraph-data:** return validated clean-view NQL as audit deliverable (#30) (513405e)
- portable-harness support for non-Claude-Code installs (#29) (2c673b8)
- require version bumps on SKILL.md.tmpl edits (#26) (9751a09)
- **release:** switch to PR-based flow with CI auto-tagging (#25) (25e3a8f)

### 🐛 Bug Fixes

- **release:** resolve last tag via tag list, not ancestry (#33) (4beb279)
- **write-nql:** drop default BUDGET clause and lengthen polling cap (#28) (5baf70b)

### 📚 Documentation

- **snippets:** strengthen agent-feedback to discourage skipping (#27) (37e9197)

### 🤖 CI / Tooling

- add check:readme step to keep plugin catalog in sync (#31) (6d2ad13)

### 🧹 Maintenance

- public-readiness governance and identity cleanup (#32) (1773c23)
- **release:** v2026.05.0 (#24) (388c920)


## [2026.05.0] - 2026-05-20

### ✨ Features

- adopt CalVer + GitHub-native release process (#21) (715f7c8)
- enforce conventional commits at PR and commit time (#22) (46741ba)
- wire narrative-agent-feedback MCP into every skill (#19) (5085051)
- **narrative-common:** add /create-workflow skill (#18) (68d3e80)
- add design-analysis skill and narrative-identity plugin (#11) (413ab23)
- add SKILL.md template and snippet system (#4) (74986c6)
- **narrative-rosetta:** add rosetta mapping plugin (#1) (9223659)

### 🐛 Bug Fixes

- **docs:** correct branch-protection gh api snippet (#23) (1d85fa3)

### 📚 Documentation

- **write-nql:** add persona to skill body (#15) (3ac0dd4)
- add canonical skill authoring guide, rename CLAUDE.md, harness-agnostic framing (#8) (33afffc)

### 🤖 CI / Tooling

- exclude renovate config files from Biome formatter (#10) (c77ca9e)

### 🧹 Maintenance

- prep repo for going public (#20) (b7cd5fb)
- **deps:** update dependency typescript to v6 (#13) (7e45f76)
- **deps:** update actions/checkout action to v6 (#12) (5deffda)
- add CI tooling, pedantic linting, and public-ready README (#6) (06741d0)
- add github issue templates for new skills and feedback (#5) (152bf64)
- self-document README from plugin and skill manifests (#2) (25530ea)
- initial marketplace scaffolding (6c1d633)

### Other

- [Feature] Extract /find-attribute skill to narrative-common (#17) (2353b47)
- [Docs] Thread NQL gotchas + data_plane_id guidance through NQL skills (#16) (cdba031)
- Add renovate.json (#9) (02c4ae2)
- [Feature] Add write-nql skill to narrative-common (#7) (de14a32)

