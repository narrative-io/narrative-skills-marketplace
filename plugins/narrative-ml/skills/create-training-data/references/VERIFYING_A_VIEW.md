# Reading rows back out of a materialized view

A completed `materialize-view` job does not carry rows. Its `result`
carries `{dataset_id, snapshot_id, recalculation_id}`, and the rows sit
in the data plane on the dataset that `dataset_id` names.

Getting rows into the conversation takes a second asynchronous job:

1. **Request a sample.** `narrative_dataset_request_sample(dataset_id: <id>)`
   returns a new job id.
2. **Poll it** with `narrative_jobs_describe(job_ids: ["<sample_job_id>"])`
   using the same cadence as the first job.
3. **Read the rows** with
   `narrative_datasets_describe(dataset_ids: [<id>], include: ["sample"])`.

```
narrative_nql_run(query: "CREATE MATERIALIZED VIEW …", data_plane_id: <plane>)
  → poll → result.dataset_id = 1234
narrative_dataset_request_sample(dataset_id: 1234)
  → poll → completed
narrative_datasets_describe(dataset_ids: [1234], include: ["sample"])
  → sample rows, capped at 1,000
```

The sample is a point-in-time snapshot capped at 1,000 rows. It
persists until a new sampling job replaces it, so repeated describes
return the same rows.

## Why coverage checks are queries, not samples

That 1,000-row cap is smaller than most training sets, which makes a
sample useless for the questions phase 6 and phase 9 ask.

A class holding 30 rows in a 40,000-row training set appears in a
1,000-row sample zero or one times. Reading "one row for this class" off
a sample and concluding the class is thin is a coincidence, not a
measurement — and reading zero rows and concluding the class is absent
is worse, because absent and thin call for different responses.

Aggregate in the query instead. `GROUP BY label` with a `COUNT(1)`
returns one row per class, which fits in a sample with room to spare and
is exact rather than sampled.

The same reasoning applies to the leakage check in phase 9: count the
collisions with a join, then sample only if the user wants to see
examples of them.

## Sampling is still the right tool for reading rows

Use a sample when the question is what the rows look like rather than
how many there are — checking that the labeler's output is sensible,
that synthetic rows landed with their quoting intact, or that a column
holds what its name suggests. Add a `WHERE` to the view or a follow-up
query so the 1,000 rows returned are the ones worth reading.
