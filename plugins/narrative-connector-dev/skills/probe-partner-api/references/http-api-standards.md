# HTTP API standards for partner probes

What a vendor's API returns in an underspecified spot is rarely
arbitrary — it is usually one of a small set of documented conventions.
This reference lists those conventions by probe topic, so a probe can
be designed to distinguish the candidates in one shot rather than
collecting responses and guessing afterward. Read the section for the
topic being probed before designing the probe; skip the rest.

Vendors deviate from all of these. The standards are the candidate
readings, not a prediction.

## Rate limiting

- **IETF RateLimit header fields** —
  [draft-ietf-httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)
  (the HTTPAPI working group's adoption of the earlier individual
  submission,
  [draft-polli-ratelimit-headers](https://www.ietf.org/archive/id/draft-polli-ratelimit-headers-02.html)).
  Defines `RateLimit` and `RateLimit-Policy` as structured fields;
  reset values are **delta seconds**. Few vendors implement it yet —
  seeing these headers is itself a finding worth recording.
- **Legacy `X-RateLimit-Limit` / `-Remaining` / `-Reset`** —
  convention only; no standard defines their semantics. `-Reset` in
  the wild is any of: **epoch seconds** (GitHub), **delta seconds
  until reset**, or an **HTTP date**. Probe: two spaced GETs. A
  countdown shrinks with wall-clock time; an epoch stays fixed until
  the window rolls; an HTTP date is self-identifying.
- **429 Too Many Requests** —
  [RFC 6585 §4](https://www.rfc-editor.org/rfc/rfc6585#section-4).
  May carry `Retry-After`. Record whether the vendor's 429 body says
  anything machine-readable; most don't.
- **`Retry-After`** —
  [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3).
  Two legal forms: an HTTP date or delay seconds. A client must parse
  both, so a probe that captures one 429 should record which form the
  vendor uses.

## Retries and idempotency

- **`Idempotency-Key` request header** —
  [draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/).
  Popularized by Stripe. If the vendor documents anything like it,
  probe whether a replayed key returns the original response or an
  error.
- **Method idempotency** —
  [RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2):
  PUT and DELETE are idempotent by definition, POST is not. Vendor
  deviations (a PUT that appends, a DELETE that 404s on replay
  instead of succeeding) are exactly what a `reversible_write` probe
  catches, and they decide the executor's retry policy.

## Pagination

- **`Link` header** —
  [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288), relations
  `next` / `prev` / `first` / `last`. Check response headers, not
  just the body — some vendors paginate only there.
- **Body conventions** — no standard: cursor (`page_token`,
  `next_cursor`), offset + limit, or page number + size. Probe with
  the smallest page size the API accepts, twice: a token that
  changes every response and appears verbatim in the next request is
  a cursor; stable numeric parameters are offsets. Record the
  maximum page size if the API states it in an error.

## Error shapes

- **Problem Details** —
  [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) (obsoletes RFC
  7807), media type `application/problem+json`. Probe: send one
  well-formed-but-invalid request (`read_only` class when the API
  rejects before acting) and record the error content type and body
  shape — the client's error taxonomy is built on it.

## Webhooks and inbound signatures

- **Standard Webhooks** —
  [standardwebhooks.com](https://www.standardwebhooks.com/):
  `webhook-id` / `webhook-timestamp` / `webhook-signature` headers,
  HMAC-SHA256 over `id.timestamp.body`.
- **HTTP Message Signatures** —
  [RFC 9421](https://www.rfc-editor.org/rfc/rfc9421). Rare in
  webhook use but the only standard in the space.
- **Vendor conventions** — the differences that break verifiers:
  HMAC output as hex vs base64; signed payload as body-only vs
  timestamp + body; and always **raw request bytes** — JSON
  re-serialization silently breaks verification. A webhook probe
  records a captured delivery's headers and verifies the signature
  both ways before the receiver is built.

## Async jobs

- **202 Accepted** —
  [RFC 9110 §15.3.3](https://www.rfc-editor.org/rfc/rfc9110#section-15.3.3)
  promises nothing about where status lives. Conventions: a
  `Location` header pointing at a status resource, a body job id
  plus a documented status endpoint, and sometimes `Retry-After` on
  the status resource as poll guidance.
- Probe (`reversible_write`): submit the smallest possible job in a
  disposable account, then walk the status endpoint until terminal,
  recording **every distinct state string** seen and the transition
  timing. The observed state list seeds the executor's terminal-state
  handling; states not observed stay an open question, since rare
  states (partial failure) may not appear on a trivial job.

## Quick reference

| Probing | Standard to read | The one-shot probe |
|---|---|---|
| Reset-header semantics | RateLimit drafts + RFC 9110 `Retry-After` | Two spaced GETs; countdown vs fixed epoch |
| Retry behavior on 429 | RFC 6585, RFC 9110 §10.2.3 | Capture one 429; record `Retry-After` form |
| Write replay safety | RFC 9110 §9.2.2, Idempotency-Key draft | Replay one write verbatim in a disposable account |
| Pagination style | RFC 8288 | Smallest page size, twice; token vs offset |
| Error taxonomy | RFC 9457 | One invalid request; record content type + shape |
| Webhook signature | Standard Webhooks, RFC 9421 | Verify one captured delivery against raw bytes |
| Job status shape | RFC 9110 §15.3.3 | Smallest job; walk status to terminal |
