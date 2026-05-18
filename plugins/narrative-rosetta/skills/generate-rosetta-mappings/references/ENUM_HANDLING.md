# Enum handling for Rosetta Stone mappings

Many Rosetta Stone attributes — and many *properties* of object
attributes — are enum-constrained. `narrative_attributes_describe`
surfaces these as `{value1|value2|value3}` annotations on the property
or attribute type.

Common enum-constrained properties:

- Identifier `type` → `email | phone | sha256_email | md5_email | sha1_email | ip_address | device_id | …`
- Gender `value` → `male | female | non_binary | unknown`
- US state → two-letter codes (`AL | AK | … | WY`)
- Hash type → `sha256 | md5 | sha1` (sometimes appended with `_email`/`_phone`)

Enum matching is **case-sensitive** and **exact-string**. `'SHA256'`
does NOT match `'sha256_email'`. This is the single most common cause
of low-confidence mappings in production.

## Generation flow (creating a new mapping)

When `narrative_attributes_describe` shows enum constraints on the
target attribute/property:

1. **Compare sample values against the enum exactly.**
   - Pull at least 25 sample rows via `narrative_dataset_request_sample`.
   - Look at the distinct values of the source column. If the column
     has high cardinality, also pull
     `narrative_dataset_get_column_stats` for `top_values`.

2. **If every distinct source value matches an enum value exactly**
   → direct column reference, confidence 95+.

   ```json
   { "path": "type", "expression": "hash_algo" }
   ```

3. **If values need transformation** → generate a CASE WHEN. Common
   patterns:

   - Case-only mismatch:
     ```sql
     LOWER(hash_algo)
     ```
   - Prefix/suffix difference (`device` vs `device_id`):
     ```sql
     CASE WHEN id_type = 'device' THEN 'device_id'
          ELSE id_type
     END
     ```
   - Full remap:
     ```sql
     CASE WHEN hash_algo = 'SHA256' THEN 'sha256_email'
          WHEN hash_algo = 'MD5'    THEN 'md5_email'
          WHEN hash_algo = 'SHA1'   THEN 'sha1_email'
          ELSE NULL
     END
     ```
     Returning `NULL` for unknown values is correct — the runtime drops
     null records. Don't fall back to an arbitrary enum value.

4. **If values cannot be reliably mapped**:
   - Lower the suggestion's confidence to <70.
   - Add a per-suggestion warning:
     ```json
     { "type": "enum_mismatch", "message": "Source values include 'EMAIL_V2' and 'em' which don't map to any allowed enum value. User must define the mapping." }
     ```
   - Still emit the suggestion so the user can review and patch.

## Evaluation flow (rating an existing mapping)

When evaluating a mapping whose target has enum constraints:

1. Call `narrative_nql_run` on a sample slice to see what the
   expression actually produces:
   ```sql
   SELECT <the_expression> AS produced, COUNT(*) AS n
   FROM <dataset>
   GROUP BY 1
   ORDER BY n DESC
   LIMIT 50
   ```

2. Compare each distinct `produced` value to the enum.

3. Severities:
   - **error** — any produced value is outside the enum *and* appears
     in a non-trivial share (>1%) of records. The mapping will produce
     invalid data downstream.
   - **warning** — produced value is outside the enum but only in a
     tiny tail (rounding error). Still flag, suggest a CASE WHEN tweak.
   - **info** — every produced value is in the enum, but the user might
     be missing a source value (e.g., the source has `device_id` raw
     records that the expression isn't routing into the enum).

4. Include `suggested_fix` with a corrected expression on every
   `error`-severity recommendation. Validate the fix with
   `narrative_nql_validate` before emitting it.

## Anti-patterns

- **Quoting an enum literal as a double-quoted identifier**: `"email"`
  parses as a column reference. Use `'email'` for the literal.
- **Returning the source value verbatim when only one mismatch exists**:
  if 99% of values match but 1% (`'Email'` with a capital E) doesn't,
  use `LOWER(col)` rather than a CASE WHEN with one branch — simpler
  expressions are easier to maintain.
- **Falling back to `'unknown'` for unmappable values when the enum
  doesn't include 'unknown'**: emit `NULL`, not an invented value.
- **Forgetting that object attributes can have multiple enum-constrained
  properties**: a single `Identifier` object has `type` (enum) and
  `value` (free). Score each property independently and report
  `property_scores[]`.
- **Trusting search-result snippets over describe responses for the
  enum list**: `narrative_attributes_search` returns shortened
  descriptions. Always `narrative_attributes_describe` to get the full
  enum list before generating or evaluating.

## Cross-reference

- For SQL/NQL syntax of the CASE WHEN expressions themselves, see
  `EXPRESSION_SYNTAX.md`.
- For the LLM-prompt versions of these rules (which this skill
  replaces at runtime), see
  `utils/llm/templates/shared-instructions.ts` —
  `ENUM_HANDLING_INSTRUCTIONS` (generation) and
  `ENUM_VALIDATION_INSTRUCTIONS` (evaluation).
