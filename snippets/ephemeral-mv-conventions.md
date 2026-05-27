For datasets that should be **temporary** — ad-hoc scratch
artifacts, intermediate steps in a workflow, or anything created on
the fly that shouldn't outlive its immediate purpose — set both:

- `EXPIRE = 'P1D'` (or another ISO-8601 duration). The platform
  garbage-collects the dataset that long after creation, removing
  both the storage and the Dataset entry automatically. `P1D` is a
  sensible default: enough time to debug, short enough not to
  clutter long-term storage. Use a longer duration only if the user
  is expected to inspect the dataset after creation.
- `TAGS = ( '_nio_materialized_view', '_nio_interactive', ... )` —
  the `_nio_interactive` tag is what the dataset store's default
  `datasets` getter filters out. The dataset becomes invisible in
  the customer's Datasets list and in source pickers (Audience
  Studio, Graph Studio, etc.). It still exists; it only surfaces
  in escape-hatch views that opt in via
  `allDatasetsIncludingInteractive`.

Common application: workflows whose intermediate steps materialize
data the user shouldn't see. Tag every intermediate MV with both
`EXPIRE` and `_nio_interactive`; tag the final, customer-facing
artifact with **neither** — that's the deliverable, it should be
persistent and visible.

If the user asks where a temporary dataset went, explain: it exists
for the EXPIRE window, it's hidden from the main UI by tag, and it
auto-deletes. Nothing to clean up by hand.
