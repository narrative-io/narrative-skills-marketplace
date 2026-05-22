# Common Cases — per-graph-type hypothesis starters

Read this when scoping the audit to confirm which failure modes to
prioritize for the specific graph shape. These are starting points,
not a checklist — every threshold still has to be re-justified
against this dataset's Phase 5 evidence.

## Person graph with email + phone identifiers

Typical hypotheses worth pre-loading (still re-justify on the data):

- `email IN (sentinel set)` — `noreply@*`, `test@*`, common
  placeholders.
- `LOWER(email)` degree > 10 distinct entities — email legitimately
  spans 2–3 family members; > 10 is almost always a shared inbox or
  service email.
- `phone_e164` degree > 5 distinct households — phones reasonably
  span a household, but not 50.
- Rows per entity per day implies bot traffic.

## Device graph with cookie + device_id identifiers

- Cookies have very high churn — almost any cookie with degree > 1
  is suspicious because cookies are usually 1:1 with browser-session.
- `device_id` should be very sticky; degree > 1 is unusual and worth
  inspection.
- Watch for cookie format that changed at a vendor migration —
  pre- and post-migration cookies look identical-shape but reference
  different sessions.

## Customer graph from a CRM export

- Test accounts (`email LIKE '%@<your-company>.com'` if the export
  isn't supposed to include internal users).
- System users / API-integration users (often have very high
  activity volume).
- Opt-out sentinel rows where every identifier is blanked but the
  row still has an entity_id.
