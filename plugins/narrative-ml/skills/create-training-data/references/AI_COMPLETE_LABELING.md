# Labeling real values with AI_COMPLETE

Read before drafting phase 5. This covers how to build the prompt and
the response schema, which parse path to use, and the rules that keep
the inference bill proportional to the problem.

`AI_COMPLETE` runs inside the customer's Snowflake data plane through
Cortex. Source values never leave that plane, and no request goes to a
model provider from outside it.

## The cost rule

Label distinct values, not rows.

A column with 40M rows and 3,000 distinct values is a 3,000-call
problem, and the `GROUP BY` that reduces it costs a fraction of one
model call. Getting this wrong is not a factor-of-two mistake; on a
wide table it is a factor of ten thousand.

Three further reductions, in the order worth applying them:

1. **Match against the enum first.** A trimmed, case-folded equality
   join resolves every value that already is a class name. This is
   free, exact, and on partly normalized source data it often clears
   most of the distinct values before the model sees anything.
2. **Filter before labeling.** Nulls, empty strings, and any junk the
   profile flagged should be excluded in the first CTE. A model call
   spent on `''` returns a label the training set should not contain.
3. **Cap during development.** While iterating on the prompt, add
   `FETCH NEXT 50 ROWS ONLY` to the CTE feeding `AI_COMPLETE`, read the
   labels, and remove the cap once they look right. Fifty calls is the
   cost of finding out the prompt is wrong; the full set is the cost of
   finding out afterwards.

## The prompt

`AI_COMPLETE` requires its prompt argument to be a column reference, so
build the text in a CTE with `CONCAT` and pass the resulting column.

The prompt does four things, and each one earns its place:

1. States the task in one line.
2. Lists the allowed labels verbatim.
3. Says the label must be copied exactly from that list.
4. Explains what the confidence number is for, in terms of what happens
   to a low score.

That fourth point matters more than it looks. A model asked for a
confidence with no stated consequence tends to report high confidence
throughout, because reporting high confidence reads as being helpful.
Telling it that a low score means the answer is discarded rather than
recorded gives the number something to track.

A working shape:

```
You are a strict text classifier.

<task>
Assign the entry to exactly one label from <allowed_labels>, and score
how confident you are that the label is correct.
</task>

<guidelines>
- The label you return MUST be copied verbatim from <allowed_labels> —
  same spelling, casing, and spacing.
- Never invent a label, combine labels, or return more than one.
- Score 1 when the entry plainly is that label, and near 0 when nothing
  in the list fits it.
- An unsure answer is thrown away rather than stored, so scoring a guess
  high to look helpful is worse than scoring it honestly.
</guidelines>

<allowed_labels>
- <class 1>
- <class 2>
...
</allowed_labels>

Reply with a single JSON object in exactly this form, and nothing else:
{"value": "<the chosen label>", "confidence_score": <0 to 1>}

Entry:
```

The whole thing is a single-quoted SQL string literal, so every
apostrophe inside it has to be doubled. Class names are the usual place
this bites: `Cavalier King Charles Spaniel` is fine, `Xoloitzcuintle`
is fine, but a class name containing an apostrophe needs `''`.

When the label input spans several columns, label each element in the
concatenation so the model can tell them apart:

```sql
CONCAT('<prefix>', ' Brand: ', COALESCE(src.brand, 'unknown'),
                   ' Product: ', src.product_name)
```

## The response schema

Constrain the output with an enum in the JSON Schema. This is the
difference between a model that can only return a real class and one
that returns a plausible-looking string the training set has no place
for.

```json
{
  "type": "json",
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["value", "confidence_score"],
    "properties": {
      "value": {
        "type": "string",
        "description": "The single label from <allowed_labels> the entry belongs to, copied verbatim.",
        "enum": ["<class 1>", "<class 2>", "..."]
      },
      "confidence_score": {
        "type": "number",
        "description": "How confident you are that the label is correct, from 0 to 1. 1 is certainty; 0 means nothing in the list fits the entry."
      }
    }
  }
}
```

The enum appears twice: once in the prompt for the model to read, once
in the schema to constrain what it can emit. Generate both from the
same array so they cannot drift.

Keep `temperature` at 0. Labeling is not a task that benefits from
variety, and a deterministic labeler makes a re-run reproducible.

Even with the schema enum in place, join the returned label back
against the enum table in SQL. It costs nothing, and it means a schema
that was edited without the join being updated fails loudly rather than
admitting an unknown class.

## The two parse paths

`show_details` decides the shape of the returned JSON, and the parse
path has to match it. Mismatching them yields a column of nulls with no
error anywhere — the query succeeds, every label is null, and the
training view comes back empty.

| `show_details` | Returned JSON | Parse path |
| --- | --- | --- |
| `FALSE` | The schema object itself | `PARSE_JSON(response)['value']` |
| `TRUE` | The object wrapped in a details envelope | `PARSE_JSON(response)['structured_output'][0]['raw_message']['value']` |

Either works. `FALSE` with the direct path is the shorter of the two
and is what the templates use. If a label column comes back entirely
null, check this pairing before suspecting the prompt.

Cast on the way out, since `PARSE_JSON` returns a variant:

```sql
CAST(PARSE_JSON(response)['value'] AS STRING) AS raw_label,
CAST(PARSE_JSON(response)['confidence_score'] AS DOUBLE) AS confidence
```

## The confidence gate belongs in a WHERE

This is where a training-data query differs from a mapping query, and
the difference is easy to miss because the two look almost identical.

A mapping query keeps every input row and leaves the value null when
the labeler was unsure:

```sql
LEFT JOIN enum_vals ON UPPER(enum_vals."value") = UPPER(TRIM(raw_label))
  AND confidence >= 0.75
```

A training query drops the row instead:

```sql
JOIN enum_vals ON UPPER(enum_vals."value") = UPPER(TRIM(raw_label))
WHERE confidence >= 0.75
```

An unsure guess admitted to a training set is a mislabeled example, and
a model trained on it learns the mistake as readily as it learns
anything else. Dropping the row costs one example. Keeping it costs
accuracy on every future row that resembles it.

## Setup and failure modes

Cortex access is granted once per Snowflake account, by an account
admin:

```sql
ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION';
GRANT DATABASE ROLE snowflake.cortex_user TO APPLICATION <narrative_app_name>;
```

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Insufficient privileges to operate on database role 'CORTEX_USER'` | The grant above has not been run. | A Snowflake admin runs it once. This is not something the skill can work around. |
| `Function AI_COMPLETE does not exist` | The query ran against a non-Snowflake plane. | Stop. Phase 3 should have caught this. |
| `Model '<id>' not available in this region` | Cross-region Cortex access is off. | Set `CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION'`. |
| Every label is null, no error | `show_details` and the parse path disagree. | See the table above. |
| Validation passes, run returns HTTP 500 | The materialized-view body is wrapped in parentheses. | Write `AS SELECT …`, never `AS (SELECT …)`. |

These are run-time failures, not validation failures. A query that
passes `narrative_nql_validate` can still hit every one of them.

## Which rows survive the cap

The template orders the per-class cap by `row_freq DESC`, keeping the
most common surface forms of each class. That is the right default:
frequent forms are what the classifier will meet most often in
production.

It does trade away the rare spellings, which are also the hard cases.
When a class has far more distinct values than the cap and the goal is
handling unusual forms rather than matching the common ones, order the
cap randomly instead, or raise `--max-per-class` for that class. Say
which one is in effect when reporting, because the two produce visibly
different models.
