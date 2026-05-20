# Edge cases and gotchas

Read when the dataset doesn't fit the audit's assumptions — no
identifier columns, every identifier is unique, mixed grains, very
low row count, the user is insisting on a threshold without
evidence, a filter removes a huge share of rows, hypotheses
overlap, or `/write-nql` won't validate the materialization.

## The dataset has no identifier columns

Do not triage. Refuse, point at `/generate-rosetta-stone-mappings`
to map columns to Rosetta Stone identifiers first.

## All identifiers are unique (degree = 1 everywhere)

No bridges possible from this dataset alone, so the hub /
high-degree / over-connected hypotheses don't apply. Audit narrows
to format / malformed / encodes-session hypotheses.

## The dataset has < 10,000 rows

Statistical hubs are hard to spot at low volume. Flag in the
headline; recommend re-running the audit after the dataset reaches
a meaningful scale.

## The source table mixes grains

(One row per event vs. one row per session vs. one row per
entity-snapshot.) Stop and clarify before hypothesizing — the unit
of analysis must be one row = one edge or all the degree math is
wrong.

## User insists on a specific threshold without evidence

Refuse. Ask them to phrase the threshold as a falsifiable
hypothesis and run it through Phase 4 first.

## A confirmed issue removes > 10% of rows

This is a "stop and show the user" moment. Filters that big are
sometimes correct (whole-column garbage) but usually mean the
hypothesis was too broad and needs narrowing.

## Two hypotheses overlap

(Same rows confirmed by H2 and H5.) Report the overlap. The
total-rows-removed headline must dedupe across filters, not sum
naively.

## The graph builder is already running on this data

This skill is pre-graph. If the user is post-build, redirect to a
post-build-repair workflow (separate skill, not yet shipped).

## Zero confirmed issues

Skip Phase 8's NQL composition. Report the headline (hypotheses
tested, all disproven) and state plainly that the source table is
graph-ready as-is. Do not invent a no-op `CREATE MATERIALIZED VIEW`
— copying the source verbatim adds storage and refresh overhead
with no quality gain.

## `/write-nql` cannot validate the materialization query

Loop back to Phase 6 (filters reference a missing column, function,
or type). If validation still fails after revision, ship the audit
findings without the NQL block and explicitly flag the validation
failure with the schema mismatch in the report — never ship an
unvalidated NQL block as if it were validated.
