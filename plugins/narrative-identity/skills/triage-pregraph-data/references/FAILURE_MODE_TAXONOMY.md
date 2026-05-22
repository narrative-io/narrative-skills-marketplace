# Failure-Mode Taxonomy

Starter taxonomy of failure modes the audit should consider during
Phase 3 hypothesis generation. **Extend, do not just copy.** Reason
from how this data was collected, what the identifiers represent,
and what realistic behavior looks like for the entity type. The
taxonomy is a starting point, not a checklist — the worst edges
usually come from source-specific quirks not captured here.

| Failure mode | What to look for | Why it kills graph quality |
| --- | --- | --- |
| **Hub identifiers** | A single identifier value shared across many entities — placeholders, defaults, sentinels: `NULL`, empty string, `foo@bar.baz`, `noreply@*`, `0000000000`, `test@`, source-system sentinels. | One value forms a hub that bridges every entity that ever fell back to it. |
| **High-degree nodes** | Identifiers connected to far more entities than is plausible, even if not obviously a placeholder. Top-N by degree, plus the long tail. **Also check the inverse**: entities carrying implausibly many identifiers (e.g., a `person` with 400+ ids). The inverse is invisible to standalone bridge analysis when identifier_values happen to be unique within the source, but it propagates as overconnection under UNION. | Each high-degree node is a potential bridge between unrelated components. The inverse (over-attached entities) seeds bridges once the source is combined with others. |
| **Behaviorally suspicious** | Activity volume that doesn't fit the entity type (an "individual" producing hundreds of rows per day a real person couldn't generate; a single `person` carrying hundreds of identifiers). | Suggests the identifier is a service / bot / system actor or a household/cluster merge, not the labeled entity. In a combined graph (the default), behaviorally implausible per-entity activity propagates bad attachments into other components when UNIONed with other sources. |
| **Over-connected** | Same email across N customer accounts, same phone across many households. Threshold varies by identifier type: email legitimately spans 2–3 family members; device IDs generally shouldn't span more than 1; phones span 4–5 in a household. | Plausible-vs-implausible co-occurrence collapses households or accounts that should remain distinct. |
| **Malformed identifiers** | Format violations: emails without `@`, phone numbers without enough digits, UUIDs with wrong length. | Often pass through ETL silently and form their own little hub at the malformed value. |
| **Identifier-encodes-session-not-entity** | The "identifier" is actually a session_id, transaction_id, or cookie that should not persist across entities. | Edges built on these will fragment one entity across many components. |
| **Format-changes-over-time** | The identifier format changed at a known cutover (vendor change, schema migration, regex upgrade) and the same logical value now appears under two formats. | Both formats reference the same entity but build separate components; opposite of the hub problem, equally bad. |
| **Identifiers that are labels** | A field labeled `customer_id` actually stores a free-text customer name or an enum code. | The "identifier" lacks the uniqueness contract the graph builder assumes. |

## How to use this taxonomy

1. Walk the list and ask: which of these are **plausible** for this
   dataset, given the source system and entity type? Skip the ones
   that aren't.
2. For each plausible failure mode, write a falsifiable claim with a
   concrete threshold — e.g., "H1: `email = 'noreply@example.com'`
   appears on > 0.1% of rows and bridges > 100 distinct entities."
3. **Add hypotheses that don't appear in the table.** The
   source-specific quirk of how this particular table was assembled
   is often what produces the worst edges. Quirky pipeline behavior,
   vendor-specific identifier conventions, opt-out sentinel rows,
   and migration artifacts rarely fit a generic taxonomy entry.
4. Aim for 5–12 hypotheses on a typical dataset. Fewer than 5 usually
   means you stopped thinking too early; more than 12 usually means
   you need to consolidate.
