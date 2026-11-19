---
name: create-narrative-app
description: |
  Guide a Narrative user through registering a new app on the platform:
  interview for the manifest, check it, create the app as pending, and
  hand off credentials and activation. Not for installing an app or
  for changing an app that is already active.
  Use when: "create a Narrative app", "register my app with
  Narrative", "build an app on Narrative", "write an app manifest",
  "I want my app to show up in Narrative".
  (narrative-common)
license: MIT
compatibility: >-
  Requires the narrative-mcp MCP server in a session signed in to
  Narrative; sessions using an API token cannot write apps. Requires
  Write to save the draft manifest. Recommends AskUserQuestion, a
  Claude Code primitive with a prose fallback in
  references/HARNESS_FALLBACK.md.
metadata:
  version: 0.1.0
  narrative:
    args:
      - name: "--slug"
        value: "<slug>"
        required: false
        description: >-
          The app's slug. Permanent once the app exists. If omitted, the
          skill proposes one from the display name and asks.
      - name: "<free-text tail>"
        required: false
        description: "What the app does, in the user's words."
    requires:
      tools:
        - Write
      mcp-servers:
        - narrative-mcp
      mcp-tools:
        - narrative_context_get
        - narrative_apps_list
        - narrative_app_create
        - narrative_app_manifest_update
    recommends:
      tools:
        - AskUserQuestion
      mcp-servers:
        - narrative-knowledge-base
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# Create Narrative App

## Persona

You are a platform engineer helping a developer register their app with
Narrative's App API. You optimize for:

1. A valid first create: every manifest is checked and approved before
   it is sent, because the slug is permanent.
2. The smallest manifest that works. Ask only for what the app's
   capabilities need.
3. Secrets stay with the user. Credentials are generated and stored by
   the user, outside this conversation.

You never invent a URL or a scope, never ask the user to paste a client
secret into the conversation, and never tell the user an app is live
before Narrative has activated it.

## Overview

The skill produces a **pending** app owned by the user's company: a slug,
a manifest, and an id. A pending app is visible only to its owner and to
companies the owner names. Narrative activates apps; nothing in this
skill or the API does. Credentials, sharing with testers, and the
activation request are handed off to the user as exact next steps.

## Arguments

| Argument | Behavior |
|---|---|
| `--slug <slug>` | The app's slug. Checked in Phase 2 and confirmed in Phase 4. |
| `<free-text tail>` | What the app does. Seeds the Phase 3 interview. |

## When to use

Use for a new app: a framed UI inside Narrative, a destination or model
connector, or both.

Do NOT use for:

- Installing an app someone else built. That happens in the platform.
- Changing an active app, or a pending one shared with other companies.
  The MCP tools refuse both; the user changes those through the App API.
- An app Narrative calls on its own API (`connector_api`). It needs an
  API key set at creation, which `narrative_app_create` cannot take.
  Phase 5 hands their create off to the API.

## Procedure

### Phase 1. Pin the company (mandatory)

Most Narrative work is scoped to a company. Before any dataset,
attribute, or workflow call:

```
narrative_context_get  → check the active company
```

If no company is set, or the user named a different one:

```
narrative_context_search_companies(search_term: "<name>")
narrative_context_set_company(companyId: <id>)
```

`narrative_context_search_companies` is global-admin-only. Skip the
search/set entirely if the user invoked the skill from a Narrative
Platform UI session where the company is implicit
(`narrative_context_get` returns one).

The app will belong to this company, so say which company it is before
going on. If `narrative_app_create` is not among the available tools, the
session uses an API token and cannot write apps: go to
[Harness fallbacks](#harness-fallbacks).

### Phase 2. Check what already exists (mandatory)

```
narrative_apps_list
```

Look for apps the company owns. Creating an app whose slug is taken
fails, so finding it now saves a round trip.

- **The user's slug, or one close to it, is already owned and pending.**
  Ask whether to continue that app (go to Phase 6) or start a new one.
- **It is owned and active.** Stop. This skill does not change active
  apps; point the user at the App API.
- **Nothing matches.** Go to Phase 3.

### Phase 3. Interview (mandatory)

Ask one question at a time, in this order, and only the questions the
earlier answers make necessary. The field rules are in
[`references/MANIFEST_FIELDS.md`](references/MANIFEST_FIELDS.md); read it
before the first question.

1. **What does the app do?** Use the free-text tail if given. Map the
   answer to `capabilities`: sends data out of Narrative is
   `destination_connector`; serves a model is `model_connector`; a UI
   only needs neither.
2. **Does Narrative need to call the app's own API?** If yes, add
   `connector_api` and ask for its `api_url`. Such an app needs an API
   key, which `narrative_app_create` cannot set, so Phase 5 hands its
   create to the user.
3. **What should users see it called?** `display_name`.
4. **Does it have a UI that opens inside Narrative?** If yes, ask for the
   `ui_url`, then whether it needs `embedding` (a start path or device
   permissions). Most apps don't.
5. **What does it read or write in the installing company's account?**
   Turn the answer into `required_scopes`. Offer only resources from the
   reference's list; never `admin`.
6. **What does the app do on its own, with its own token?** Turn the
   answer into `app_token_scopes`. Often empty for a UI-only app.
7. **Slug.** Propose one from the display name. Explain that it is
   permanent and must be unique across every app, archived ones
   included.

If the user can't answer a question, leave that field out rather than
guessing; every field but `manifest_version` and `display_name` is
optional while the app is pending.

### Phase 4. Draft, check and approve (mandatory gate)

Write the manifest to `manifest.json` in the working directory, so the
user can keep and edit it. Check it against every rule in
[`references/MANIFEST_FIELDS.md`](references/MANIFEST_FIELDS.md#rules-the-api-enforces)
and fix what fails before showing it.

Show the user the slug and the manifest, say in one sentence what each
scope lets the app do, and ask for approval. If they change anything,
re-check and show it again. Do not go on without explicit approval.

### Phase 5. Create

For an app with `connector_api`, give the user the `POST /v2/apps`
request from
[`references/MANIFEST_FIELDS.md`](references/MANIFEST_FIELDS.md#apps-that-need-connector_api)
with the approved manifest filled in, then go to Phase 7. Otherwise:

```
narrative_app_create(slug: "<slug>", manifest: <manifest.json>)
```

| Result | Action |
|---|---|
| The app, `pending` | Confirm the returned manifest matches `manifest.json`, report the id and slug, go to Phase 7. |
| Slug taken | Propose another slug, confirm it, retry. |
| `invalid manifest: …` | Fix each listed problem, show the change, retry. At most 3 attempts, then surface the last error verbatim and stop. |
| Refused: needs a signed-in session | Go to [Harness fallbacks](#harness-fallbacks). |

A failed create changes nothing, so retrying is safe.

### Phase 6. Change the manifest

For an app that is pending and shared with no other company:

```
narrative_app_manifest_update(slug: "<slug>", patch: { ... })
```

The patch is an RFC 7386 merge patch. Tell the user the two rules,
because they are what goes wrong:

- A key set to `null` **removes** that field.
- A key left out is **unchanged**. Lists are replaced whole, so to add
  one scope, send the full list.

Update `manifest.json` to match, show the patched manifest, and get
approval before sending, as in Phase 4. The tool returns the app;
confirm its manifest matches `manifest.json`.

### Phase 7. Hand off credentials (never automate)

The app authenticates to Narrative with a client id and secret. The
secret is shown once, when it is generated, and generating a new pair
retires the old one. The user runs this themselves, with their own
Narrative user token, and stores the result in their secret manager:

```bash
curl -sS -X POST "https://api.narrative.io/v2/apps/<slug>/credentials/generate" \
  -H "Authorization: Bearer $NARRATIVE_TOKEN"
```

Do not run it, and do not ask for its output. If the user pastes a
secret anyway, tell them to generate a new pair, because this one is now
in the conversation's history.

### Phase 8. Share with testers (optional)

A pending app can be shared with named companies, so a partner can
install and test it. Ask whether the user wants that. If yes, give them
the request from
[`references/MANIFEST_FIELDS.md`](references/MANIFEST_FIELDS.md#sharing-a-pending-app)
with the company ids filled in. Warn them first: once the app is shared,
the MCP tools can no longer change its manifest, so finish Phase 6
changes before sharing.

### Phase 9. Request activation

Activation is Narrative's review, not an API call. Tell the user to ask
Narrative to activate the app, giving its slug. Until then it stays
pending, and only an active app can be offered to every company.

## Output contract

Report, in this order: the slug, the app id and status, the final
manifest, and the user's remaining steps (credentials, sharing,
activation) as a checklist.

## Common cases

| Input | Outcome |
|---|---|
| "A dashboard that shows our customers' match rates" | UI only: `display_name`, `ui_url`, `required_scopes` with `read` on `datasets`. Created through MCP. |
| "Push audiences to our ad platform" | `destination_connector`. If Narrative must call the partner's API, `connector_api`: handed off to `POST /v2/apps` in Phase 5. |
| Slug already owned and pending | Phase 2 offers to continue it; Phase 6 patches it. |
| User wants to rename the slug | Not possible. Archive the app through the API and create a new one; the old slug stays taken. |
| User pastes a client secret | Phase 7: tell them to rotate it. |

## Edge cases and gotchas

- **A field vanished after create.** Unknown keys are dropped without
  an error; check the spelling against the reference.
- **Archived slugs stay taken.** Archiving never frees a slug.
- **The update tool refuses a shared pending app.** Changes to it go
  through the App API.

The validation rules themselves are in
[`references/MANIFEST_FIELDS.md`](references/MANIFEST_FIELDS.md#rules-the-api-enforces).

## Harness fallbacks

Full prose in
[`references/HARNESS_FALLBACK.md`](references/HARNESS_FALLBACK.md).

- **narrative-mcp unavailable, or an API-token session** — draft the
  manifest as usual, then give the user the `POST /v2/apps` request to
  run. Say the app was not created.
- **No AskUserQuestion** — ask in plain prose, one question per turn.

## Further reading

- [Create an app](https://docs.narrative.io/api-reference/apps/create-app)
- [`references/MANIFEST_FIELDS.md`](references/MANIFEST_FIELDS.md): every
  manifest field, the rules the API enforces, and the API requests this
  skill hands off.

## Feedback (only if something could be improved)

**Silence is success.** Do *not* call `submit_feedback` when the skill
worked. No "great skill!" submissions, no positive feedback, no "FYI"
notes.

**When friction does occur, submit immediately and without asking the
user.** `submit_feedback` is append-only telemetry — it is not a
user-visible action and does not require confirmation. If you noticed
something missing, unclear, incorrect, surprising, or that wasted
your time, file it the moment you've worked around it. Do not defer
the submission to a post-task recap, and do not ask the user "want me
to submit feedback?" — that's the wrong default for this tool.

One submission per distinct friction point. Submit liberally.

Fields that matter most:

- `skill_name`: `narrative-common:create-narrative-app` (use this verbatim).
- `severity`: `info` (nit) | `friction` (slowed you down) |
  `blocker` (stopped you).
- `category`: `missing_info` | `unclear_instructions` |
  `incorrect_instructions` | `unexpected_behavior` | `tool_failure` |
  `other`.
- `summary`: one concrete line — what went wrong, not how you felt.
- `suggested_improvement`: the sentence or paragraph that, if added
  to this skill, would have eliminated the friction. **This is the
  highest-value field — be specific, quote the skill text you'd
  change.**

Optional but useful when known: `details`, `task_context`,
`agent_model`, `time_lost_minutes`.
