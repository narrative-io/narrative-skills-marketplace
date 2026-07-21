# <Platform> Connector — Product Spec

> Template for the prose `spec.md`. Fill in every `<placeholder>`.
> Delete sections that don't apply with a one-line note explaining
> why. Keep headers exactly as written — consistency across specs is
> the point. The machine-readable twin of this document is
> `connector-spec.yaml`; the two must agree, and the yaml wins on
> conflict.

| | |
|---|---|
| **Destination** | <Platform> — <use-case shape: outbound membership / events / opt-out / measurement> |
| **Status** | DRAFT |
| **Date** | <YYYY-MM-DD> |
| **Target epic** | <link or "—"> |
| **Owner** | <name> |
| **Tech lead** | <name> |
| **Hard deadline** | <date or "—"> |

---

## §0 — Connector-specific notes (READ FIRST)

> One row per differentiator axis (see
> `references/differentiator-axes.md`). "Same as `<connector>`" is a
> valid and common answer. If three or more rows are genuinely
> different, that's the headline of this spec.

| Axis | This connector | Closest precedent |
|---|---|---|
| **Auth model** | | |
| **Destination data model** *(what a record becomes; container; who provisions it)* | | |
| **Identifiers & matching** *(match key; notable gaps)* | | |
| **Sync semantics** *(update model / TTL / deletion & opt-out)* | | |
| **Operational constraints** *(limits / batching / pagination / approvals)* | | |

---

## Problem

<2–3 sentences.>

*Initial use case: <starting customer + use case>*

## Goals

1.
2.
3.

## Non-goals

*

## Appetite

<T-shirt size + reasoning. **Hard deadline:** <date or "None">.>

---

## Connector Setup

> The meat of the spec. Walks the engineer from "no integration" to
> "data flowing."

### Profile creation

* **Auth:** <OAuth 2.0 / static credentials / JWT / SFTP key / partner-ID header>
* **OAuth flow** *(delete if not OAuth)*:
  * Authorization URL: `<url>`
  * Token URL: `<url>`
  * **Scopes / permissions:** `<scope_1>`, … — what each grants and why we need it (or "none — <cite>")
  * Redirect URI: `<our callback>`
  * Token response & lifetime: <e.g. "access + refresh; 60-day refresh, continuously refreshable" / "non-expiring access token, no refresh token">
* **Account binding:** <which vendor object the profile binds to — advertiser, ad account, workspace, portal, data center>
* **Profile persists:**

| Field | Type | Notes |
|---|---|---|
| `<token>` | string (encrypted) | |
| `<account_id>` | string | |

* **Multi-tenant model:** <one Narrative-wide credential, or per-customer; service-provider details>
* **Pre-provisioning by the customer:** <anything they must create in the vendor UI first — lists, event sets, business verification — or "nothing">
* **Test environment / SDK:** <sandbox? official SDK? Or "none — say so">

### Quick Settings

One JSON shape per quick-setting type — a full field list, not a
description:

```json
{
  "type": "<platform>_<kind>_quick_settings",
  "<field_1>": "<value>"
}
```

* `<field_1>` (`<type>`, required/optional): <purpose; valid values>

### Identifiers (CRITICAL)

| Destination field | Hash | Normalization | Match semantics | Rosetta Stone attribute |
|---|---|---|---|---|
| `<email>` | <SHA-256 / MD5 / none / either> | <lowercase, trim> | <how the destination dedupes on it> | `<verified attribute name>` |

Every attribute in the last column is verified via
`narrative-common:find-attribute` — never typed from memory. A
missing attribute is a blocker recorded in Open Questions.

**Not accepted** *(but customers will assume they work)*:
<the identifiers that work on comparable platforms but not this one —
e.g. hashed email on an ESP that requires raw email; iOS IDFA on a
platform that rejects it. Caps the match-rate ceiling.>

### Destination data model & sync

* **A delivered record becomes:** <audience member / list member / segment member / CRM contact / dataset row / event>
* **Container:** <custom audience / list / segment / event set / dataset / bucket path> — provisioned by <connector via API / customer in the vendor UI / either>
* **Associations:** <secondary objects a record links to, e.g. CRM list memberships — or "none">
* **Update model:** <native replace / add-then-remove / swap-and-promote / TTL-forced / upsert>
* **TTL / expiry:** <value + cite, or "none">
* **Deletion & opt-out:** <which API operation; what it actually does (suppress / archive / permanent); whether removed records can be re-added; how vendor-side unsubscribes flow back — cite or open-question each>

### Delivery API

* **Endpoint(s):** `<METHOD /path>` (or SFTP path / bucket layout)
* **Batch / payload limit:** <max records or bytes, cited>
* **Rate limits:** <per-second / concurrent / daily; "not publicly documented" if so — cited either way>
* **Pagination:** <page-number / offset / cursor / none>
* **Idempotency:** <dedupe key + retry semantics>
* **Failure semantics:** <whole-batch reject vs row-level errors>
* **Feedback channel:** <sync response / async logs / match metrics / nothing>

### Event attribute *(event/conversion flows only — delete otherwise)*

> Spell out the full attribute JSON — engineers paste this into
> Rosetta Stone authoring. No "see `<other connector>`" handwaves.

```json
{ "name": "<platform>_event", "type": "object", "...": "..." }
```

* **Routing:** <row-level / config-level + one-line justification>
* **Dedup key & window:** `(<receiver_id>, <event_id>, …)`; <window>
* **Late-arrival window:** <value; cite>
* **Consent fields:** <how consent/permission signals map into the attribute or Quick Settings>

---

## Open Questions

| Question | Owner | Status |
|---|---|---|
| | partner / internal / customer | ask <party> |

> Real unknowns only — these mirror `open_questions` in the yaml. If
> five more minutes of vendor-doc reading would answer it, read.

---

## Resources & Sources

* **People:** <vendor contacts>, <Narrative owner>, <tech lead>
* **Vendor docs:** <official developer-docs URL>, <API reference>
* **Prior art:** <closest existing Narrative connector + link to its spec>
