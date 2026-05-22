# Sample and Stats Sub-APIs

Reference for fetching sample rows and column stats *beyond* what
step 2's `narrative_datasets_describe` already returns. The describe
response — with `include: ["sample", "stats"]` — bundles the dataset's
most recent sample and per-column stats summary. Use the sub-APIs
below only when you need a fresher sample, finer-grained stats, or
histograms.

## Request a fresh sample

To enqueue a brand-new sampling job (async — returns a job id you
must poll with `narrative_jobs_describe(job_ids: ["<id>"])` until
`state` is `completed`):

```
narrative_dataset_request_sample(dataset_id: <id>)
```

There is no `limit` parameter; the platform decides sample size. Skip
this if the sample returned from step 2 is recent enough.

## Pull per-column stats (with optional histograms)

To pull per-column stats without re-describing the dataset, or to
opt into histograms:

```
narrative_dataset_get_column_stats(
  dataset_id: <id>,
  columns: ["<name>", "<name>"],
  include: ["basic_column_stats"]
)
```

`columns` is an array — omit it to get stats for every column with
stats (one call covers a 200-column dataset). Pass
`include: ["basic_column_stats", "histogram"]` with a
`histogram_bin_limit` (e.g., 25) when you need value distributions;
histograms are off by default because they can blow the response cap
on wide columns.

## Recalculate when stats are missing

If stats are missing entirely, call
`narrative_dataset_recalculate_statistics(dataset_id: <id>)` (async,
returns a `recalculation_id`) and proceed with sample data only,
noting it in a `data_quality` global warning. Don't block on the
recalculation completing.

## What to look for in stats

- `null_rate` — high null rates (>30%) → per-suggestion `data_quality` warning
- `distinct_count` and `top_values` — clue to enum-like columns
- `min`/`max` — clue to numeric ranges, timestamps, identifiers

## What to look for in sample rows

- Email shape (`@` symbol), phone shape, hash length (32 = MD5, 40 = SHA1, 64 = SHA256)
- ISO timestamp shape, US ZIP shape, IATA codes, etc.
- Whether a column is a literal type discriminator (e.g., `'email'`, `'phone'`, `'sha256_email'`)
