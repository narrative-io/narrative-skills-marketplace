# Edge cases and gotchas

Read when a search feels off — the snippet doesn't describe an
enum-constrained attribute, shape matching is rejecting candidates
that look fine on name, pagination yields nothing, the phrase is
genuinely ambiguous, or the caller is looking for a custom (non-
Rosetta-Stone) attribute.

## Catalog snippets lie about enum constraints

The search result description is truncated and may omit enum
values. Always call `narrative_attributes_describe` (phase 3) before
claiming any enum-constrained attribute matches the user's intent.

## Shape matching is by name, casing-insensitive

A catalog attribute with `source_id` matches `--shape SOURCE_ID`.
But matching is structural — extra columns are allowed (and counted
in the tiebreaker), missing columns are disqualifying.

## Pagination is opt-in

`narrative_attributes_search` returns the first `--per-page`
results. Walk pages 2+ only when the first page is thin; an
attribute that doesn't surface in the top 50 results almost
certainly doesn't exist.

## Ambiguous phrases

"email" is genuinely ambiguous (raw, sha256, md5, sha1, …). Don't
pick one silently when alternatives cluster within 1-2 ranking
points; surface the alternatives and let the user choose, or — if
`--no-confirm` — return `medium` confidence with a warning.

## Empty result is a legitimate answer

If walking all pages yields nothing, return the empty-result shape
from phase 5. Do not loop on more pages, do not invent an ID. The
caller will decide whether to author a custom attribute or refine.

## Custom attributes are not in scope

This skill finds Rosetta Stone attributes only. Custom attributes
(per-company, `custom.<name>`) need a different lookup path; if a
caller needs them, they should call `narrative_attributes_search`
directly with the custom namespace.

## Don't paraphrase the catalog

The user's downstream skill cares about the exact `attribute_id`
and `schema`. Return the describe payload's values verbatim — no
rewording display names, no rounding column types.
