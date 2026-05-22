# YAML Rendering Invariants

Phase 7 renders the final workflow YAML before the approval gate.
These invariants apply at render time. They only fire when actually
producing the YAML — if you are not in Phase 7, you do not need
them. The main `SKILL.md` keeps the high-level Phase 7 step and the
load-bearing `allowPartial: false` safety rule inline; everything
else about how to format the document lives here.

## DSL version pinning

- `document.dsl` is always `'1.0.0'`. Do not bump this on a whim —
  the workflow runtime validates against the pinned DSL.
- `document.version` is `'1.0.0'` for a fresh apply; bump on
  resubmits (e.g., `'1.0.1'`) so the platform can distinguish
  successive specifications.

## `document.name` — kebab-case rules

- `document.name` is kebab-case (lowercase ASCII letters, digits,
  and hyphens — no underscores, no camelCase, no spaces).
- Maximum length is 256 characters.
- Suffix with a short timestamp (`-<yyyymmdd>`) if the user is
  likely to re-apply, so successive runs are easy to tell apart in
  the workflow list.

## `datasetName` regex

- `datasetName` matches `^[A-Za-z0-9_]{1,256}$` — alphanumerics and
  underscores only, 1–256 characters.
- This is the dataset's `name` field from `narrative_datasets_describe`,
  not the numeric ID. If the describe response gives you a numeric
  ID and no name, stop and surface the issue — do not synthesize a
  name from the ID.

## Expression placement and quoting

- NQL expressions go in `with.mappings[].mapping.expression` (or
  `propertyMappings[].expression`) verbatim — no re-quoting, no
  reformatting, no whitespace collapsing.
- String literals inside expressions stay single-quoted. To
  preserve YAML's quoting rules when an expression contains a
  single-quoted literal, wrap the whole expression in single
  quotes and double every embedded single quote. For example, the
  NQL literal `'sha256_email'` becomes `'''sha256_email'''` inside
  the YAML string.
- If the expression contains no single quotes, single-quoting the
  outer YAML string is still the safer default — it avoids the
  YAML parser interpreting `#`, `:`, or `&` specially.
