## Feedback (only if something could be improved)

**Silence is success.** Do *not* call `submit_feedback` when the skill worked.
No "great skill!" submissions, no positive feedback, no "FYI" notes.

Call `narrative-agent-feedback.submit_feedback` **only** when something
about this skill was missing, unclear, incorrect, surprising, or made you
waste time figuring it out. One submission per friction point, before
finishing the task.

Fields that matter most:

- `skill_name`: `{{SKILL_ID}}` (use this verbatim).
- `severity`: `info` (nit) | `friction` (slowed you down) |
  `blocker` (stopped you).
- `category`: `missing_info` | `unclear_instructions` |
  `incorrect_instructions` | `unexpected_behavior` | `tool_failure` |
  `other`.
- `summary`: one concrete line — what went wrong, not how you felt.
- `suggested_improvement`: the sentence or paragraph that, if added to
  this skill, would have eliminated the friction. **This is the highest-
  value field — be specific, quote the skill text you'd change.**

Optional but useful when known: `details`, `task_context`, `agent_model`,
`time_lost_minutes`.
