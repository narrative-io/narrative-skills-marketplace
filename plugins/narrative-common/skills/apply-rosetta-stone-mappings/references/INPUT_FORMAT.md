# Input format

Three accepted shapes for the mappings input, plus the field-name
aliases the parser tolerates. Read when Phase 2 rejects something
the user expected to work.

## Accepted top-level shapes

The parser unwraps in this order and stops at the first hit:

1. **Full `final_answer` envelope** — straight from
   `/generate-rosetta-stone-mappings`:

   ```json
   {
     "type": "final_answer",
     "data": {
       "summary": "...",
       "suggested_mappings": [ /* entries */ ],
       "warnings": [ /* dataset-wide concerns */ ]
     }
   }
   ```

   The parser reads `data.suggested_mappings`. `summary` and
   `warnings` are surfaced in the approval gate but never submitted.

2. **Bare envelope** — common when the user piped the generator's
   output through a transformation:

   ```json
   { "suggested_mappings": [ /* entries */ ] }
   ```

3. **Bare array** — minimal hand-built input:

   ```json
   [ /* entries */ ]
   ```

If the input is none of the above, surface the parsing failure with
the input prefix verbatim and stop. Do NOT guess.

## Entry shape (per-mapping)

Every entry must resolve to:

```json
{
  "attributeId": <positive integer>,
  "mapping": {
    "type": "value_mapping" | "object_mapping",
    "expression": "<NQL expression>",                // only for value_mapping
    "propertyMappings": [                            // only for object_mapping
      { "path": "<property path>", "expression": "<NQL expression>" }
    ]
  }
}
```

## Field-name aliases (snake_case → camelCase)

The generator emits snake_case; the workflow task requires
camelCase. The parser accepts either on input and always emits
camelCase to the workflow. The translation table:

| Input alias (accepted) | Canonical (emitted) |
| --- | --- |
| `attribute_id` | `attributeId` |
| `property_mappings` | `propertyMappings` |
| `dataset_name` | `datasetName` |
| `allow_partial` | `allowPartial` |

If both casings appear in the same entry, prefer the camelCase
value and warn the user — that's a sign of a hand-merged JSON file
with conflicting sources.

## Fields stripped before submission

The generator emits several fields for human review. None of them
are part of the `CreateRosettaStoneMappingsIfNotExist` task
contract. The parser drops them silently:

- `confidence`
- `reasoning`
- `match_reason`
- `warnings` (per-entry or top-level)
- `alternatives`
- `dataset_id` (the target is passed via `--dataset`, not embedded
  in entries — if it disagrees with `--dataset`, surface the
  mismatch in the approval gate)

## Worked example

Generator output (`final_answer`):

```json
{
  "type": "final_answer",
  "data": {
    "summary": "I mapped 2 of 3 columns; the third had no Rosetta Stone equivalent.",
    "suggested_mappings": [
      {
        "attribute_id": 92,
        "mapping": {
          "type": "object_mapping",
          "property_mappings": [
            { "path": "value", "expression": "SHA2(NORMALIZE_EMAIL(email), 256)", "confidence": 95, "reasoning": "..." },
            { "path": "type",  "expression": "'sha256_email'",                    "confidence": 100, "reasoning": "..." }
          ]
        },
        "confidence": 95,
        "reasoning": "..."
      },
      {
        "attribute_id": 50,
        "mapping": { "type": "value_mapping", "expression": "country_code" },
        "confidence": 98,
        "reasoning": "..."
      }
    ],
    "warnings": []
  }
}
```

Rendered workflow `mappings:` block (after normalization):

```yaml
mappings:
  - attributeId: 92
    mapping:
      type: object_mapping
      propertyMappings:
        - path: value
          expression: SHA2(NORMALIZE_EMAIL(email), 256)
        - path: type
          expression: '''sha256_email'''
  - attributeId: 50
    mapping:
      type: value_mapping
      expression: country_code
```

Note the YAML single-quote escaping on `'sha256_email'`: a literal
single-quoted string inside YAML doubles its outer quotes, so
`'sha256_email'` (NQL) becomes `'''sha256_email'''` (YAML). See
[`EDGE_CASES.md`](EDGE_CASES.md) for the quoting rules in full.
