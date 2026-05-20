# Harness fallbacks

What to do when a required tool or MCP server is unavailable. Load
this file only when the body's `## Harness fallbacks` section points
you here for a specific gap.

> **Goal:** shrink this file as the MCP server gains coverage. Every
> raw-HTTP shape below should eventually be wrapped by a first-class
> MCP tool. Until then, this is the documented escape hatch — use it
> only when no MCP tool covers the call you need to make.

## When `narrative_workflows_create` is unavailable

The Phase 7 submission and the Phase 8 run-status polling run over
the raw Narrative API.

### Authentication

Read the bearer token from a `.env` file in the current working
directory (or its parent). Look for one of:

- `NARRATIVE_API_TOKEN` — primary
- Any `NARRATIVE_API_TOKEN_<COMPANY_SLUG>` for cross-company runs

The token format is base64 (`r9UUut6RORv6LFK1lHItbw==`-style). Pass
it as `Authorization: Bearer <token>`. **Never log, echo, or write the
token to a non-secret file.**

### Base URL

`https://api.narrative.io` (production). For app-dev,
`https://api-dev.narrative.io`. Confirm via the `NARRATIVE_API_URL`
env var if present.

### Endpoints

**Submit workflow:**

```
POST /workflows
Headers:
  Authorization: Bearer <token>
  Content-Type: application/json
Body:
{
  "specification": "<full YAML as a single string>",
  "tags": ["_nio_ci_match_report_workflow", "<RUN_SLUG_LOWER>"]
}
Response (200):
{ "id": "<workflowId UUID>" }
```

**Submit and immediately run** (most APIs accept a `?run=true`):

```
POST /workflows?run=true
... same body ...
Response (200):
{ "id": "<workflowId>", "run": { "run_id": "<runId>", "status": "running", "start_time": "..." } }
```

**Poll run status:**

```
GET /workflows/<workflowId>/runs
Headers: Authorization: Bearer <token>
Response (200):
{
  "runs": [
    { "run_id": "<runId>", "status": "running" | "completed" | "failed" | "terminated",
      "start_time": "...", "close_time": null | "..." }
  ]
}
```

Poll every 15–30 seconds. Total runtime is typically 5–25 minutes.

**Fetch a workflow spec** (debugging):

```
GET /workflows/<workflowId>
Response (200):
{ "id": "...", "name": "...", "specification": "<YAML string>" }
```

### Calling convention

If the host environment has a generic HTTP tool, use it. If only
shell is available, the canonical call is:

```
curl -s -X POST "$NARRATIVE_API_URL/workflows?run=true" \
  -H "Authorization: Bearer $NARRATIVE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/workflow-body.json
```

Where `/tmp/workflow-body.json` contains the JSON body with the YAML
embedded as the `specification` string. **Avoid here-docs**; write
the body to a file first, then point `curl` at it with `@`. YAML
indentation breaks otherwise.

### Documenting what you did

After every API-fallback call, log:

- The HTTP method + endpoint
- The response status + (redacted) body
- A one-line reason this used the fallback instead of MCP

Surface the log at the end of the skill so the human reviewing it
knows which MCP gaps to file tickets for.

## When `narrative_nql_validate` is unavailable

Skip the Phase 6 pre-flight validation. Surface a one-line warning to
the user before the submit gate ("NQL validation tool not available —
the workflow runner will catch any syntax errors after ~5 minutes
instead of up front"). Do not auto-substitute `narrative_nql_run` —
that allocates compute.

## When `AskUserQuestion` is unavailable

The skill ships as an interactive interview. Without
`AskUserQuestion`, ask the same options as a numbered list in prose:

```
**Pick one — reply with 1, 2, or 3:**
1. <option A> (recommended)
2. <option B>
3. <option C>
```

For multi-select prompts (id-type subsetting, enrichment attribute
groups), default selections are still pre-ticked. Ask the user to
reply with the numbers to *uncheck* — keeps the prose short.

Mandatory steps (pre-flight validation, schema-fidelity rule, dry-run
gate) do not change.
