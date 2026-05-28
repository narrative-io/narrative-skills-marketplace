Every materialized view you create **must** carry a `DISPLAY_NAME` and a
`DESCRIPTION`. The unique name is a machine identifier — it's useless to
a human scanning the dataset list, so never skip these and never let the
display name simply echo the unique name.

- **`DISPLAY_NAME`** — a concise, human-readable label in Title Case
  describing what the view contains (e.g. `Distinct Users — Last 30 Days`).
  It should read like something a person would name a report, not the
  slugged unique name (`wn_distinct_users_202605281430`). No timestamp —
  that lives in metadata and already disambiguates reruns.
- **`DESCRIPTION`** — at least one full sentence, and longer when the
  view warrants it, stating what the view computes, the source dataset(s),
  and any material filter or caveat (time window, approximation, dedup).
  Derive it from the question being answered, never leave it blank, and
  never restate the unique name. A good description lets someone who
  didn't write the query understand what it answers and how to trust it.

```
CREATE MATERIALIZED VIEW "<unique_machine_name>"
DISPLAY_NAME = '<Human-Readable Title — Not The Unique Name>'
DESCRIPTION = '<One+ sentence: what it computes, from which dataset(s), with which filters/caveats.>'
...
```
