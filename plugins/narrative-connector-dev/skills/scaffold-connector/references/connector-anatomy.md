# Connector anatomy — the portable component model

A connector is the same set of responsibilities no matter which codebase
hosts it. This reference names those responsibilities, states when the
spec calls for each one, and defines the mapping rule every scaffold
target follows. `/scaffold-connector` derives the component set from
`connector-spec.yaml` using the table below, then asks the target (the
scaffold manifest, the inferred reference-connector conventions, or the
greenfield runtime profile) how each component materializes.

Components are responsibilities, not directories. A target may split one
component across several code units or fuse several components into one
unit — a JVM monorepo might give each component its own module, while a
single Cloudflare Worker can host the service API, the delivery
executor, and the partner client in one deployable. The component set is
what the spec demands; the unit layout is the target's business.

This reference stays at derivation altitude: which components exist and
when. How they behave at runtime (event intake, the work queue,
idempotency layers, credentials, observability) and the axes along
which real connectors vary are covered in
[`reference-architecture.md`](reference-architecture.md).

## Components

| Component | Responsibility | Generated when |
|---|---|---|
| `partner_client` | Typed client for the destination's API: request signing per `auth.model`, pagination per `partner_api.pagination`, rate-limit handling per `partner_api.rate_limits`, and the endpoint calls in `partner_api.endpoints`. | Always. |
| `delivery_executor` | Turns delivery batches into partner API calls or files: batching to `partner_api.batch_limit`, the update model in `delivery.update_model`, retry per `partner_api.idempotency`, opt-out handling per `delivery.optout_handling`. | `delivery.directions` includes `outbound_membership`, `conversion_events`, or `opt_out`. |
| `service_api` | The connector's own HTTP surface: profile and connection lifecycle, quick-settings validation against `quick_settings`, and (when `auth.model: oauth2`) the OAuth authorize/callback exchange. | Always. |
| `credential_store` | Persistence for partner credentials shaped by `auth`: token tables or key-value entries whose columns/fields follow `auth.oauth.token_response` (or the static-credential shape for other auth models). | `auth.model` is present. |
| `background_worker` | Async job loop for deliveries too long for a request/response cycle: claims delivery jobs, drives the `delivery_executor`, reports status. | The target's runtime separates long-running work from the service API (the target decides; the spec only supplies the delivery semantics). |
| `measurement_poller` | Polling loop for measurement data the partner writes into an object-store inbox: scans the inbox per `measurement.partition_layout`, copies new files into the dataset ingestion path, dedups so no file lands twice. | `delivery.directions` includes `measurement_ingestion` and `measurement.ingestion_mode` is `bucket_inbox` (the default). |
| `measurement_receiver` | HTTP endpoint for measurement events the partner pushes to the connector, per `measurement.webhook`: verifies the inbound call per `auth.inbound`, persists the raw payload, acknowledges before any processing, and dedups on `measurement.webhook.dedupe_key`. A buffer-flush step then lands the persisted events on the same dataset ingestion path the poller uses. | `delivery.directions` includes `measurement_ingestion` and `measurement.ingestion_mode` is `partner_webhook`. |

## Derivation rules

- Read `delivery.directions`, `auth.model`, `destination_type`, and
  `measurement.ingestion_mode` (when the directions include
  `measurement_ingestion`) from the spec; select components per the
  table. Never generate a component the spec doesn't call for. An empty
  poller is noise, not future-proofing.
- Every selected component maps to at least one code unit in the
  target. The mapping comes from the target, in priority order: the
  scaffold manifest's `components` block, the inferred layout of the
  reference connector, or the runtime profile's mapping table.
- A component the target's layout doesn't split out is noted in the
  summary `/scaffold-connector` prints when it finishes ("partner
  client and executor share the worker unit") so the implementation
  skills know where to write.

## What this model deliberately excludes

Infrastructure, database provisioning, platform registration, catalog
listings, and deploy pipelines are not components of the connector;
they are environment concerns owned by separate skills
(`/scaffold-connector-infra`, `/provision-connector-db`,
`/register-connector-app`, `/add-connector-listing`,
`/deploy-connector`). Scaffolding stops at code the implementation
skills fill in.
