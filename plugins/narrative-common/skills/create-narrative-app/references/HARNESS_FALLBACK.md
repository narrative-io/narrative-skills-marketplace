<!-- AUTO-GENERATED from HARNESS_FALLBACK.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# Harness fallbacks

What to do when the app tools are unavailable and when the harness
doesn't expose `AskUserQuestion`.

Never silently degrade. If the app was not created, say so plainly.

## `narrative-mcp` unavailable, or an API-token session

The app tools (`narrative_app_create`, `narrative_app_manifest_update`)
need a session signed in to Narrative. A session using an API token,
including Narrative's own agent sessions, does not see them, and
`narrative_apps_list` alone cannot create anything.

- Run Phases 3 and 4 as usual: the interview and the checked,
  approved `manifest.json` do not need the server.
- If `narrative-mcp` is unavailable entirely, skip Phase 2's lookup and
  tell the user a taken slug will come back as an error. An API-token
  session can still run it.
- Give the user the `POST /v2/apps` request from
  [`MANIFEST_FIELDS.md`](MANIFEST_FIELDS.md#apps-that-need-connector_api),
  leaving out `api_key` unless the app needs `connector_api`.
- Continue with Phases 7–9 as hand-offs. State that the app has not been
  created and that the manifest was checked only against the rules in
  `MANIFEST_FIELDS.md`, not by the server.

## Write not available

Show `manifest.json` in the conversation instead, in a fenced `json`
block, and ask the user to save it.

## "AskUserQuestion" not available

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.
