# Edge cases and gotchas

Read when the analytical question feels off — the user is being
vague, the schema doesn't fit the question, causal claims are at
stake, the user is bypassing the interrogation, or two tables
could answer the same question.

## The question is too vague to plan

Push back with the Phase 2 checklist — name the missing rows and
ask the user to fill them one at a time. Do not invent assumptions.

## The schema is missing the entity the question implies

Surface the gap explicitly. Either redirect (the data can't answer
this) or propose a proxy and name the limitation in the brief's
"what this will not answer" section.

## The question implies causal inference but the data is observational

Compose the brief, but lead with a clear note that the analysis can
only measure association. Suggest what intervention /
quasi-experimental design would be needed to claim cause.

## The user insists on a specific query before the brief is done

Honor their judgment, but write the one-off into the brief as Q0
with the caveat that its result is informational only until Q1/Q2
validation passes. Don't skip Phase 2 entirely.

## A cohort window crosses a known data-quality break

(Pipeline migration, schema change, dedup-rule change.) Add a
"data-quality caveat" row to the brief and split the window into a
before/after comparison rather than averaging across the break.

## Two tables could answer the same question, and the user picked the wrong one

State the tradeoff in the brief and recommend the better source;
let the user override.
