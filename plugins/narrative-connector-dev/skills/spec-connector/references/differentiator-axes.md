# Differentiator axes — what to call out as different

Reference for `/spec-connector` Phase 3 and §0 of the prose spec. For
each axis, answer: *"same as `<precedent>`"* or *"different — here's
how."* If three or more axes are genuinely different, this connector
is unusual and that's the headline of the spec.

The precedents below span the portfolio's destination flavors: ad
platforms (TikTok, Meta, Pinterest, Yahoo DSP, PubMatic/Magnite),
raw storage (object stores), model registries (Hugging Face), and — validated
during this skill's design — email/CRM platforms (Mailchimp, HubSpot).
Ad platforms are one flavor, not the frame: an axis answer like
"audience TTL" or "app review" only applies where the destination
actually has the concept.

## 1. Auth model

What changes: auth mechanism (OAuth2 / static credentials / JWT /
SFTP key), token shape and lifetime, scopes, account selection,
multi-tenant credentials model, which vendor object a profile binds
to.

* **TikTok** — OAuth via advertiser-authorization URL; token response
  carries `access_token` (long-lived, no refresh token) + the list of
  authorized `advertiser_ids`; numeric scope codes.
* **Pinterest** — OAuth with a 60-day continuously-refreshable
  refresh token; ad account selected at connection creation.
* **Meta** — 2-tier Business Manager (parent BM + programmatically
  created child BMs).
* **Mailchimp** — OAuth2 with a **non-expiring** access token and no
  refresh token; a post-exchange metadata endpoint returns the
  per-account data-center prefix that becomes part of the API base
  URL; no scopes.
* **HubSpot** — OAuth2 with refresh tokens and granular `crm.*`
  scopes; profile binds to a HubSpot portal (account).
* **Magnite / PubMatic** — SFTP key or partner-ID header; Narrative
  is always the data provider; per-client folders.
* **Hugging Face** — static access token; many profiles per company.

## 2. Destination data model

What a delivered record *becomes*, and where it lands:

* **Audience membership in a per-advertiser container** (TikTok,
  Meta, Pinterest) — no taxonomy; container created by the connector
  or chosen from existing ones.
* **Hierarchical taxonomy + status workflow above the audience**
  (Trade Desk, Yahoo DSP — Yahoo enforces a 30-minute gap between
  taxonomy and audience writes).
* **Flat name + price segments** (Magnite, PubMatic audience).
* **List member in a customer-owned list** (Mailchimp) — the record
  is a *contact* with its own marketing status; the list pre-exists
  in the customer's account.
* **CRM object + list association** (HubSpot) — the record is a CRM
  contact; list membership is an association on top of it, and the
  contact persists after removal from the list.
* **Dataset/file rows** (object stores, Hugging Face) — the record is a row
  in a file; the container is a path or repo.

The engineering consequence: when the record is an independent object
(CRM contact, list member), "remove from the connection" and "delete
the object" are different operations with different compliance
weight. Pin down both.

## 3. Identifier requirements & matching

Which identifiers, hashed or raw, and — just as load-bearing — **how
the destination matches/dedupes**:

* **Hashed-identifier matching** (TikTok, Meta, Pinterest) — SHA-256
  email/phone/MAID; the hash *is* the match key.
* **Raw-only ingestion** (PubMatic audience) — no hashing accepted.
* **Email as primary key** (Mailchimp) — requires the **raw** email
  to create a member; the member key is `md5(lowercase(email))`.
  Hashed-only datasets cannot be delivered at all — a gap customers
  coming from ad platforms will not expect.
* **Configurable/multi-key matching** (HubSpot) — contacts dedupe on
  email by default; other keys need explicit handling.

### The most-cited gotcha: identifier-matrix gaps

If the platform rejects an identifier customers will assume works
because it works elsewhere (Pinterest rejecting iOS IDFA / phone /
postal is the canonical case; Mailchimp rejecting hashed email is the
non-ad equivalent), the "Not accepted" line in the identifier table is
the single most consequential thing in the whole spec. It lives in
§Identifiers, not §0 — but if it's the biggest difference, say so in
§0 anyway.

## 4. Sync semantics

* **TTL with incremental re-adds** (Yahoo 45-day, TikTok audience
  refresh window, PubMatic 30-day auto-expiry) — re-deliver before
  expiry.
* **No TTL, overwrite on every delivery** (Pinterest full-refresh
  flavor) — swap/promote semantics.
* **Upsert with no expiry** (Mailchimp `PUT` on the member key;
  HubSpot contact upsert) — membership persists until removed.
* **Removal ≠ deletion** (Mailchimp: unsubscribe vs archive vs
  permanent delete — permanently deleted members **cannot be re-added
  by API**; HubSpot: list removal vs contact deletion). Opt-out
  handling must name which operation is used and why.
* **Late-arrival windows for events** (Meta 7 days, Yahoo 30 days).

## 5. Operational constraints

* **Rate limits & batch sizes** — TikTok: 1,000 identifiers per
  mapping request, published QPS caps; Mailchimp: 10 simultaneous
  connections and a 120-second call timeout, no published QPS;
  HubSpot: per-10-second buckets by product tier. "Not publicly
  documented" is a valid, citable answer.
* **Pagination** — page/page-size (TikTok), offset/count (Mailchimp),
  cursor (HubSpot). Downstream client code needs to know which.
* **Partner approval, where it exists** — TikTok requires a
  demo video for rate-limit increases; Meta requires App Review +
  business verification; Pinterest gates opt-outs and CAPI
  separately. **Mailchimp and HubSpot have no app review for basic
  API access** — record "none" explicitly; absence is information.
* **Sandbox** — available (Yahoo) or absent; say which.

## Anti-pattern: don't flag these as "unique"

Universal across connectors — leave them out of §0:

* "OAuth authentication"
* "Rate limits exist"
* "Requires hashed PII"
* "Has a Quick Settings shape"
* "Supports incremental updates"

If one of these shows up in §0, the actual delta hasn't been found
yet — keep researching.
