<!-- AUTO-GENERATED from HARNESS_FALLBACK.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->
# Harness fallbacks

What to do when a declared tool or server is unavailable. Never silently
degrade — if the recommendation rests on user-supplied numbers rather
than measured ones, say so in the output.

## `narrative-mcp` unavailable

This skill cannot inspect data planes, compute pools, datasets, or job
history without the server. Everything in Phases 1–4 is unreachable, and
that includes the two facts the recommendation depends on most: the
provider type and the dataset's byte counts. Say so explicitly before
offering anything.

The degraded mode is interview-only:

- Ask which provider the data plane uses (AWS or Snowflake). Without it
  you cannot pick a branch, and the two share no sizing logic — if the
  user doesn't know, stop rather than guessing.
- Ask for the dataset's approximate compressed size, whether the job is
  a full build or an incremental refresh, the cadence, the deadline, and
  the verbatim error if it is failing.
- Ask which pools already exist on the plane, by id and size. You cannot
  enumerate them, so a recommendation to "use the shared always-on pool"
  is unverifiable — describe it by its properties (`always_on`,
  `idle_timeout_seconds: -1`) and let the user confirm it exists.
- Apply the ladder in [`EMR_SIZING.md`](EMR_SIZING.md) normally. It is
  self-contained and needs no MCP.
- Label the whole recommendation **unverified**: no byte count was read,
  no pool list was enumerated, no job duration was measured. State every
  input as "you told me" rather than "I measured."

Do not fabricate a pool id. If you cannot enumerate pools, recommend a
size and a resolution level, and tell the user to read the pool id off
the plane themselves.

## `narrative-knowledge-base` unavailable

Only the published-docs cross-check is lost. The size ladder, cost
multipliers, timeout semantics, and resolution chain in
[`EMR_SIZING.md`](EMR_SIZING.md) are self-contained, so the
recommendation is unaffected. Skip the cross-check silently — this one
does not need to be surfaced to the user.

The exception is the Snowflake branch, which points at the Native App
installation guide for warehouse registration. Without the server, give
the user the guide's title and let them find it rather than inventing a
URL.

## `AskUserQuestion` not available

If the harness does not expose `AskUserQuestion` as a named tool
(Claude Code does; most others don't), ask the user the same question
in plain prose — **one question per turn**, never batched — and wait
for a reply before continuing. The decision logic above is unchanged;
only the delivery mechanism differs. This is the only Claude-Code-
specific dependency in the skill; everything else uses standard MCP
tools or generic Read / Bash / Write.

Phase 5's priority order is unchanged — ask the same questions in the
same sequence, one per turn, and stop as soon as you can decide. When
the caller passed `--quick`, there are no questions to ask in the first
place; state the unfilled gaps as assumptions instead.
