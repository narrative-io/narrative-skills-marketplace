<!--
PR title must be a Conventional Commit (enforced by CI):
  type(scope?): subject

Accepted types: feat, fix, perf, refactor, docs, ci, build, chore, test,
revert, style. Subject starts lowercase.

  Examples:
    feat(narrative-common): add /score-dataset skill
    fix(write-nql): handle empty BUDGET clause
    docs(readme): regenerate plugin catalog
-->

## Summary

<!-- 1-3 bullets on what changed and why. The "why" matters more than
     the "what" — reviewers can read the diff. -->

-

## Test plan

<!-- Checklist of what you ran / verified. CI runs the linters,
     typechecker, knip, manifest validation, spec validation, and
     dry-run check that every generated artifact (SKILL.md, mcp.json,
     skills.json, README plugin catalog) is up to date — so most local
     boxes can be `bun run ci`. Call out any manual verification too. -->

- [ ] `bun run ci` passes locally
- [ ] Affected skill(s) tested end-to-end in a harness (if applicable)
- [ ] Frontmatter version bumped on every edited `SKILL.md.tmpl` (if applicable)

## Notes for the reviewer

<!-- Optional. Anything non-obvious about the approach, alternatives
     you considered and rejected, follow-ups intentionally out of scope. -->
