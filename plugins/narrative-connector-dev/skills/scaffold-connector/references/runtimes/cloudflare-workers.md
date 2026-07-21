# Greenfield runtime profile — `cloudflare-workers`

A runtime profile is what `target.mode: greenfield` scaffolds from: a
description of how the portable components
([`connector-anatomy.md`](../connector-anatomy.md)) materialize on a
specific runtime when there is no template repo to copy. This is the
first profile; others follow the same three-part shape (project
structure, component mapping, generation rules).

## Project structure

Generate a TypeScript Workers project at the path the user chooses:

```
<slug>-connector/
├── wrangler.jsonc            # worker name "<slug>-connector"; bindings below
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # fetch handler: routes service_api endpoints
│   ├── api/                  # service_api: profile/connection lifecycle,
│   │   └── routes.ts         #   quick-settings validation, OAuth callback
│   ├── partner/              # partner_client: typed destination-API client
│   │   └── client.ts
│   ├── delivery/             # delivery_executor: batch → partner calls
│   │   └── executor.ts
│   ├── store/                # credential_store: token/credential persistence
│   │   └── credentials.ts
│   └── measurement/          # measurement_poller (only when the spec calls for it)
│       └── poller.ts
└── test/
    └── delivery.test.ts      # one seeded test per generated component
```

## Component mapping

| Component | Materialization |
|---|---|
| `service_api` | The Worker's `fetch` handler; routes in `src/api/`. |
| `delivery_executor` | A [Queues](https://developers.cloudflare.com/queues/) consumer in the same Worker — delivery batches arrive as queue messages, sized to `partner_api.batch_limit`. |
| `partner_client` | Plain module in `src/partner/`; outbound `fetch` with auth from the credential store and rate limiting per `partner_api.rate_limits`. |
| `credential_store` | KV binding by default; D1 when `auth.oauth.token_response` implies relational shape (multi-account bindings, scope arrays). Declared in `wrangler.jsonc`. |
| `background_worker` | Not a separate unit — the Queues consumer covers async delivery. |
| `measurement_poller` | A [scheduled trigger](https://developers.cloudflare.com/workers/configuration/cron-triggers/) in the same Worker, reading the `measurement.inbox_prefix` source. |

## Generation rules

- Consult the `cloudflare` and `wrangler` skills (when mounted) for
  current Workers/Queues/KV/D1 configuration syntax rather than
  generating bindings from memory.
- Seed every module with typed signatures derived from the spec
  (`identifier_groups`, `quick_settings` fields, `partner_api.endpoints`)
  and a body that fails loudly with "not implemented". The
  implementation skills (`/implement-partner-client`,
  `/implement-delivery-executor`) fill those bodies in.
- `verify` for this profile is `npx tsc --noEmit` — the project must
  typecheck immediately after scaffolding.

## The platform-contract gate

Narrative's platform calls an externally hosted connector on a surface
the connector must expose: endpoint paths, payload schemas, and the
registration handshake. That surface is not yet published as supported
API. Until it is, this profile scaffolds the *internal* shape (partner
client, executor, stores, and the routing skeleton) and marks every
platform-facing stub explicitly:

- Generate the `src/api/` routes as typed stubs with a
  `PLATFORM CONTRACT PENDING` marker comment.
- Record one `open_questions` entry in the spec (owner: internal):
  "Platform-facing contract for externally hosted connectors —
  endpoint and payload shapes needed to finish `service_api`."

Do not invent the contract. A scaffold with an honest gap beats one
with a plausible-looking surface the platform will never call.
