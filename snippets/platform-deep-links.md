### Platform deep links

Link a user to an object with its canonical platform URL. Base is
`https://app.narrative.io/platform`.

| Object | Path |
|---|---|
| Dataset | `/my-data/dataset/<dataset_id>` |
| Access rule | `/my-data/access-rules/<access_rule_id>` |
| Match report | `/my-data/match-reports/<dataset_id>` |
| Workflow | `/my-data-planes/workflow/<workflow_id>` |
| Normalized dataset | `/rosetta-stone/normalized-datasets/<dataset_id>` |

The `/platform` segment is the application's base path and is
required — omitting it 404s. Match reports are addressed by the
**dataset** id, not by a report id.

Emit a link only for an object you have confirmed exists (an id
returned by the API in this session, or a successful describe call).
Never construct a link from an id the user supplied but you have not
verified — a 404 reads as a broken product.
