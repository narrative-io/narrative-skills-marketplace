# Edge cases and gotchas

Read when something doesn't add up — a referenced column isn't in
the schema, the user is about to scan a huge dataset wildcard, the
validator's verdict contradicts the user's understanding, or the
schema appears to have shifted mid-conversation.

## The user asks about a column that doesn't exist

Don't fabricate a similarly named column. Surface the closest
matches from the schema with `AskUserQuestion` and let them
confirm.

## The user asks for a wildcard scan against a huge dataset

If `metadata.record_count` is large (>50M) and no filter is
present, warn explicitly in the explanation and propose a sample
(`TABLESAMPLE BERNOULLI(1)`) or a tighter filter before running.

## `--run` plus a query that scans everything

Honor `--run`, but still surface the cost warning in the
explanation *before* submitting the job.

## Validator says the query is fine but the user disagrees

Treat the user's interpretation as the source of truth for intent.
Loop back to step 4; do not argue.

## MCP gives a non-deterministic schema

Re-describe before blaming the validator if columns "disappear"
between calls; the platform may have updated the dataset
mid-conversation.
