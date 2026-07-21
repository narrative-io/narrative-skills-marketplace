# Research guide — where connector facts come from

The research workflow behind `/spec-connector` Phase 2, plus the
deep-research prompt template for Phase 4. Covers where the facts come
from, in what priority, and what the guardrail is when they can't be
found.

## Hard rule: official sources first

Before opening a blog post or a third-party integration guide, exhaust
the API owner's own materials in this order:

1. The official developer portal (`developers.<platform>.com`,
   `mailchimp.com/developer`, `developers.hubspot.com`, …)
2. Official PDF integration guides (often emailed by vendor support —
   ask the user if they have one)
3. Official API reference (OpenAPI / GraphQL / Postman collection)
4. Official changelog / release notes
5. Official partner or data-provider portal docs (gated; if the user
   has access, ask them to fetch)
6. *(only then)* third-party integration guides, SaaS landing pages,
   blog posts

If a fact only appears on a third-party site, write it down with the
source — but mark it `[unverified]` until the platform's own docs
corroborate. A spec built on unverified secondary sources leaks errors
into engineering.

## Hard rule: DO NOT GUESS

If you cannot find an authoritative answer to any of:

- **Identifier types accepted** (and their hashing rules)
- **Rate limits**
- **Data-removal / opt-out semantics**

…escalate to the user to ask the partner. Don't infer, don't
approximate, don't reuse another platform's answer. A prior Pinterest
spec contained an AI-invented "1P/3P flag" that didn't exist in
Pinterest's API; it was caught at kickoff. The cost of "I don't know"
is far lower than the cost of a fabricated requirement.

If 3+ items hit this guardrail, generate the deep-research prompt
below instead of speculating.

## What to extract, in this order

For each item, capture the source URL + a 1–3 sentence answer.
Internal lore only counts if it's in the platform's own docs — flag it
`[internal lore, unverified]` otherwise.

1. **Platform object model.** Top-level org → account-equivalent →
   the object that receives data (audience, list, segment, CRM
   object, event set, dataset). Which APIs exist for which flows.
2. **Authentication.** OAuth scopes (or static-credential / JWT
   model), token lifetimes and refresh behavior, service-provider
   model, sandbox credentials.
3. **The endpoint(s) we'd use.** Method, path, batch limits, failure
   semantics, rate limits, idempotency (dedupe key + window).
4. **Identifier matrix.** Every accepted identifier with hashing
   rules + normalization, and **the destination's match key** — how
   it decides two delivered records are the same entity (e.g.
   Mailchimp keys members on `md5(lowercase(email))`; ad platforms
   match on the hashed identifier itself). Every notably-rejected
   identifier, cross-checked against the closest comparable platform.
5. **Data lifecycle / sync semantics.** Add/remove/replace/upsert
   operations, TTL or expiry, late-arrival windows for events,
   recommended refresh cadence, what deletion actually does
   (archive vs permanent), and what happens to records the
   destination's own users remove.
6. **Privacy & consent.** GDPR/TCF, USP/GPP, COPPA, GPC, LDU,
   marketing-permission fields. Per-record vs per-connection vs both.
   Mandatory vs optional.
7. **Multi-tenant model.** One credential for all customers, or
   per-customer? Service-provider recommendations?
8. **Feedback channel.** Sync response? Async logs? Quality/match
   metrics? Nothing?
9. **Partner approval / sandbox.** App review, dev-account approval,
   rate-limit-increase processes — **where they exist**. Many
   destinations (most email/CRM platforms) have none; record "none"
   explicitly rather than inventing a review process.
10. **Pre-provisioning.** What the customer must create in the vendor
    UI before the connector works (lists, event sets, business
    verification), and what the connector can create via API.

Write to `$SPEC_DIR/vendor-notes.md`.

## Research questionnaire → spec sections

The answers feed the spec sections directly; they don't get their own
section:

- Identifiers → §Identifiers + `identifier_groups`
- Auth, sandbox, SDK → §Profile creation + `auth`
- APIs, rate limits, batching, pagination → §Delivery API +
  `partner_api`
- Record model, containers, sync → §Delivery API + `destination` +
  `delivery`
- Partner approval processes → §0 axis 5
- Opt-out support → §Delivery API + `delivery.optout_handling`
- Quick-settings shape → §Quick Settings + `quick_settings`

## What "good" looks like

Research is done when:

1. Every identifier the platform accepts is in the matrix, with
   hashing, normalization, and the match key.
2. Every identifier the platform rejects that customers will assume
   works (because it works elsewhere) is named.
3. Failure semantics are explicit — engineers know whether to
   pre-validate or retry-on-fail.
4. The sync model (update operations + TTL/expiry + deletion
   behavior) is explicit.
5. The multi-tenant credentials model is explicit.
6. Every claim has a citation to the vendor's own docs (or is flagged
   `[unverified]`).
7. Nothing was fabricated — every unanswerable item became an open
   question, not a guess.

---

## Deep-research prompt template (Phase 4)

When official docs are sparse, ambiguous, or gated, generate this
prompt for the user to paste into their preferred deep-research tool
(Claude, OpenAI Deep Research, Gemini, Perplexity, …). The pass is
human-in-the-loop on purpose — deep-research-with-citations is more
grounded than a direct model answer.

**When NOT to use:** the official docs answer directly (cite them); a
Narrative engineer has built against the platform (ask them); the
customer has the answer (ask the customer).

Fill in the bracketed sections:

````markdown
# Deep-research brief: <Platform> <use-case shape>

You are a senior integration architect researching <Platform> as a
destination for a B2B data-collaboration platform. Produce a
tightly-cited, factually grounded brief.

## Hard rules

1. **Cite the platform's own documentation first.** Third-party posts
   are tertiary and must be marked as such.
2. **No hedging without a reason.** If a fact is unknown, say "not
   publicly documented" and stop.
3. **No bullet padding.** Two lines with a citation beat ten without.
4. **Recency matters.** Prefer docs updated in the last 12 months;
   note publication dates.
5. **Match-affecting decisions are load-bearing.** Spend 80% of the
   effort on identifiers, hashing/matching, and deletion/consent
   semantics.

## Questions

### 1. Platform object model
Object hierarchy (org → account-equivalent → the object that receives
data: audience / list / segment / CRM object / event set / dataset).
Which APIs exist for which flows — separate or combined surfaces?

### 2. Authentication
OAuth scopes (or static-credential / JWT model) required for
<use case>. Token lifetime and refresh behavior. Partner or app
review required? Service-provider / multi-tenant model? Sandbox?

### 3. Endpoint(s) for <use case>
Exact endpoints with request/response schemas. Max batch and payload
size. Rate limits (per sec / min / day; concurrent connections).
Failure semantics — whole-batch reject vs row-level. Idempotency —
match/dedupe key and window. Pagination model.

### 4. Identifier matrix
For *every* identifier the platform accepts on the relevant endpoint:
field name, hashing requirement (SHA-256 / MD5 / none / either),
normalization, constraints, max length/format, and how the platform
matches/dedupes on it. Then list identifiers *commonly accepted on
comparable platforms but rejected here*, with citations. Check at
least: email (raw and hashed), phone, name, postal, DOB, gender,
mobile ad IDs, CTV IDs, platform click IDs.

### 5. Privacy, consent, and data removal
GDPR / CCPA-USP / GPP / COPPA / GPC / marketing-permission fields?
Per-record or per-connection? Mandatory vs optional? What does the
deletion API actually do (suppress / archive / permanent)? How does
the platform handle users who opt out or unsubscribe via its own UI,
and can a removed record be re-added by API?

### 6. Data lifecycle
TTL or expiry? Late-arrival window for events? Replace/upsert
operations or only add/remove? Recommended refresh cadence per docs.

### 7. Pre-provisioning
What must the customer create in the platform's UI first? What can
the integration create via API? Approvals gating go-live?

### 8. Multi-tenant / partner model
Can one credential act on behalf of many customer accounts?
Per-customer or partner-wide? Service-provider recommendations?

### 9. Feedback channel
Synchronous API response? Async logs? Match-rate or quality metrics?
A UI the customer can see?

### 10. Known sharp edges
GitHub issues on the official SDKs, Stack Overflow, practitioner
forums. Top 3–5 recurring complaints from real integrators, cited.

## Customer context

* Starting customer: <name + use case>
* Identifiers the customer has: <list>
* Hard customer constraint: <if any>

## Output format

Single Markdown doc, ~1,500–2,500 words, organized by the questions
above. Every factual claim ends with `[cited as: <url + access date>]`.
Conclude with one confidence-assessment paragraph: which sections are
well-grounded, which rely on secondary sources, which questions remain
unanswered.

## Do NOT

- Invent identifier types. If the platform doesn't list it, don't.
- Invent rate limits. "Not publicly documented" is a valid answer.
- Present a blog post as if it were the platform's own docs.
- Skip §10 — that's often where the biggest spec-shaping insights are.
````

**After the user pastes the output back:** read it end-to-end;
cross-check every claim against the official docs (contradictions get
dropped or flagged `[contradicts vendor docs — confirm]`); promote
validated findings into the spec; save the raw output to
`$SPEC_DIR/deep-research-output.md` with a header noting the tool and
date; refresh `open_questions` — closed ones go away, new ones get
`status: confirm with vendor`.
