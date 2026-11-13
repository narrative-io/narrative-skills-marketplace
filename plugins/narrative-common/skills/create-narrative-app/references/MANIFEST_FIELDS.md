# App manifest fields

The manifest (`manifest_version` `1.0.0`) holds what installing,
launching and framing an app need, and what security decisions rest on.
How the app is presented in the marketplace belongs on its listing, not
here.

The API's schema is the source of truth:
[`AppManifestV2`](https://docs.narrative.io/api-reference/apps/create-app).
If this file and the schema disagree, the schema wins; report the
difference through `submit_feedback`.

## Fields

| Field | Required | What it is |
|---|---|---|
| `manifest_version` | yes | Always `"1.0.0"`. |
| `display_name` | yes | What users see, including on the install consent screen. Non-blank, at most 256 characters. |
| `capabilities` | no | Any of `destination_connector`, `model_connector`, `connector_api`. A UI-only app has none. |
| `api_url` | with `connector_api` | The app's API, which Narrative calls. |
| `ui_url` | no | The app's UI. An app with a `ui_url` opens framed inside Narrative. |
| `embedding` | no | For the framed UI: `{"initial_guest_path": "<path>", "device_permissions": ["<permission>"]}`. Leave out unless the user needs it. |
| `required_scopes` | no | What the app may do in the installing company's account, granted at install. |
| `app_token_scopes` | no | What the app may do with its own token, outside any one installation. |

<!-- Until SC-84925 ships, the API also accepts `icon` and `docs_url`,
and requires `icon` before Narrative activates an app. Do not ask for
them: they are moving to the app's marketplace listing. -->

## Scopes

Each scope is `{"access": "read" | "write", "resource": "<resource>"}`.
`admin` access is always rejected.

Resources apps most often need:

| Resource | Lets the app |
|---|---|
| `datasets` | see (`read`) or change (`write`) the company's datasets |
| `connections` | see or create connections from datasets to the app |
| `installations` | see its installations |
| `app_profiles` | read or write the company's settings for the app |
| `app_events` | read or post the app's events |
| `nql` | run NQL queries |
| `mappings` | see or change Rosetta Stone mappings |
| `usage` | report usage for billing |

Ask for the least that works: `read` before `write`, and only the
resources the user's description of the app needs. If the app needs a
resource not listed here, check the API reference before using its
name; an unknown resource fails the create.

## Rules the API enforces

Check all of these before showing a draft:

1. `manifest_version` is `"1.0.0"`.
2. `display_name` is non-blank and at most 256 characters.
3. `api_url`, `ui_url` and any other URL are absolute `https` URLs with
   a host.
4. `connector_api` in `capabilities` means `api_url` is present.
5. No scope in either list has `admin` access.
6. Field names are spelled exactly as above. Unknown keys are dropped
   without an error, so a typo loses the field silently.

And for the slug:

7. Lowercase letters, digits and hyphens; starts and ends with a letter
   or digit; at most 63 characters.
8. Not used by any app, archived ones included.

## Apps that need `connector_api`

`narrative_app_create` cannot set the API key Narrative sends when it
calls the app, so these apps are created with the App API. The user
runs this, with a key they generate and keep:

```bash
curl -sS -X POST "https://api.narrative.io/v2/apps" \
  -H "Authorization: Bearer $NARRATIVE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"slug": "<slug>", "api_key": "<key>", "manifest": <manifest.json>}'
```

Narrative sends the key as `Authorization: ApiKey <key>` on every call
to `api_url`, and the app checks it. The key can only be set here, at
creation.

## Sharing a pending app

A pending app may be shared only with named companies. `install` must
be a subset of `view`.

```bash
curl -sS -X PUT "https://api.narrative.io/v2/apps/<slug>/collaborators" \
  -H "Authorization: Bearer $NARRATIVE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"view":    {"type": "inclusion", "company_ids": [1234]},
       "install": {"type": "inclusion", "company_ids": [1234]}}'
```

Sharing with every company (`all`) or every company but some
(`exclusion`) needs an active app.
