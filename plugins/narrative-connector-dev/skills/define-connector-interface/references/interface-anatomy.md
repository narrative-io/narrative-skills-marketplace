# Interface anatomy — the portable contract artifacts

A connector's data contract is the same set of artifacts no matter
which codebase hosts it, the way its runtime is the same set of
components (`/scaffold-connector`'s `connector-anatomy.md` names
those). This reference names the contract artifacts, defines the
platform contract each one must satisfy, and shows how the
stack-neutral terms typically materialize in different languages.
The platform contract — the `$ref` shapes, the discriminator, the
acceptance policy — holds whether the connector is Scala, TypeScript,
Python, or Go. Everything else (file names, serialization library,
type style, casing) belongs to the target.

## Artifacts

| Artifact | What it is | Derived from |
|---|---|---|
| Record schema | A JSON Schema document that validates the schema of any dataset a customer maps to the connector: which identifier fields may appear, the shape each must have, and which must be present. | `identifier_groups[]` |
| Quick-settings types | The connector's own typed definition of each settings payload: one type per `quick_settings[]` entry, carrying a JSON discriminator, a field list, and a parser binding. | `quick_settings[]` |
| Settings-form contract | A JSON Schema per quick-settings type (plus a UI schema where the target has that convention). `/add-connector-app-ui` renders the settings form from it. | `quick_settings[]` |
| Acceptance policy | The `required[]` / `anyOf[]` block inside the record schema stating which identifier groups a delivered record must include. | `identifier_groups[]` |

One record schema exists per record-ingesting delivery direction:
`outbound_membership` and `opt_out` share the audience record schema,
and `conversion_events` gets its own event schema built with the same
`$ref` machinery.

The record schema is pure JSON and identical on every stack; only its
file location varies. The quick-settings types are code in the
target's language. The settings-form contract is JSON generated from
the same field list as the types. That sharing is deliberate: the
form a customer fills in and the codec the connector decodes with
must agree on every discriminator and field, or settings saved
through the UI fail to parse at delivery time.

## The record schema is a schema for schemas

The record schema does not validate delivered rows. It validates the
**JSON Schema of the dataset** a customer maps to the connector — one
meta-level up. That is why the document nests `properties` inside
`properties`: the outer key is the dataset schema's own `properties`
key, and the inner keys are the dataset's field names.

A complete record schema for a connector with four identifier groups,
one per `ref_kind`:

```json
{
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "description": "Acme Ads record schema",
    "type": "object",
    "required": ["properties"],
    "properties": {
        "properties": {
            "type": "object",
            "anyOf": [
                { "required": ["sha256_hashed_email"] },
                { "required": ["hashed_email"] },
                { "required": ["telephone_number"] },
                { "required": ["narrative_id"] }
            ],
            "properties": {
                "sha256_hashed_email": {
                    "$ref": "#/$defs/attribute_value",
                    "attribute": "https://api.narrative.io/attributes/sha256_hashed_email"
                },
                "hashed_email": {
                    "$ref": "#/$defs/attribute_typed_value",
                    "attribute": "https://api.narrative.io/attributes/hashed_email"
                },
                "telephone_number": {
                    "$ref": "#/$defs/string_value_type",
                    "attribute": "https://api.narrative.io/attributes/telephone_number"
                },
                "narrative_id": {
                    "$ref": "#/$defs/attribute_context_value",
                    "attribute": "https://api.narrative.io/attributes/narrative_id"
                }
            }
        }
    },
    "$defs": { "…": "the four shapes below, plus any_value_type" }
}
```

Three rules hold in every record schema:

- **One property per identifier group.** The property name is the
  group's `name`; the `attribute` annotation is the group's canonical
  Rosetta URI, copied from the spec verbatim.
- **The `$ref` is selected by the group's `ref_kind`** — the mapping
  in the next section.
- **The `$defs` block is the platform's, not the connector's.** Copy
  the shapes below exactly; a connector never edits them.

## The `ref_kind` mapping

`ref_kind` says what shape the mapped dataset field's schema must
declare. The four shapes, as they appear in the `$defs` block
(`any_value_type` is the shared helper for the wrapped value):

```json
{
    "any_value_type": {
        "type": "object",
        "properties": {
            "type": { "type": "string", "enum": ["string", "long", "double", "boolean"] },
            "display_name": { "type": "string" }
        },
        "required": ["type"]
    },
    "string_value_type": {
        "type": "object",
        "properties": {
            "type": { "type": "string", "const": "string" },
            "display_name": { "type": "string" }
        },
        "required": ["type"]
    },
    "attribute_value": {
        "type": "object",
        "properties": {
            "type": { "type": "string", "const": "object" },
            "properties": {
                "type": "object",
                "properties": {
                    "value": { "$ref": "#/$defs/any_value_type" }
                },
                "required": ["value"]
            }
        },
        "required": ["type", "properties"]
    },
    "attribute_typed_value": {
        "type": "object",
        "properties": {
            "type": { "const": "object" },
            "properties": {
                "type": "object",
                "properties": {
                    "value": { "$ref": "#/$defs/any_value_type" },
                    "type": { "$ref": "#/$defs/string_value_type" }
                },
                "required": ["value", "type"]
            }
        },
        "required": ["type", "properties"]
    },
    "attribute_context_value": {
        "type": "object",
        "properties": {
            "type": { "const": "object" },
            "properties": {
                "type": "object",
                "properties": {
                    "value": { "$ref": "#/$defs/any_value_type" },
                    "context": { "$ref": "#/$defs/string_value_type" }
                },
                "required": ["value", "context"]
            }
        },
        "required": ["type", "properties"]
    }
}
```

What each kind demands of the mapped dataset field, with a dataset
schema fragment that passes:

| `ref_kind` | The mapped field must be | Passing dataset schema fragment |
|---|---|---|
| `attribute_value` | An object wrapping the identifier in a single `value` sub-field. | `{"type": "object", "properties": {"value": {"type": "string"}}}` |
| `attribute_typed_value` | An object carrying the identifier plus a `type` marker naming which flavor the value is — `hashed_email`'s marker says which hash function, `mobile_id_unique_identifier`'s says which id space. | `{"type": "object", "properties": {"value": {"type": "string"}, "type": {"type": "string"}}}` |
| `attribute_context_value` | An object carrying the identifier plus a `context` marker scoping it — `narrative_id`'s shape. | `{"type": "object", "properties": {"value": {"type": "string"}, "context": {"type": "string"}}}` |
| `string_value_type` | A plain string column, no wrapper. | `{"type": "string"}` |

The kinds are structurally incompatible: a dataset field that
satisfies `attribute_value` fails `attribute_typed_value` (no `type`
sub-field) and vice versa (`attribute_value` doesn't permit one). A
wrong `ref_kind` therefore rejects every dataset a customer maps, or
accepts shapes the delivery executor can't read. This is why
`/preflight-connector` sanity-checks each group's `ref_kind` against
the attribute's catalog schema before this skill runs.

## The acceptance policy

The `anyOf` block inside the record schema is the acceptance policy:
each entry is a `{"required": [...]}` object, and a mapped dataset
must satisfy at least one entry. The default derivation is one entry
per identifier group — any single group is sufficient:

```json
"anyOf": [
    { "required": ["sha256_hashed_email"] },
    { "required": ["narrative_id"] }
]
```

A destination that only matches on identifier combinations (say,
email plus postal code) is expressed as a multi-name `required` list
in one entry. The spec's `identifier_groups` cannot state
combination requirements, so if the vendor research says the
destination needs one, that is a question for the user and a proposed
spec `open_questions` entry — not a guess.

## The quick-settings surfaces

Each `quick_settings[]` entry defines one settings payload. On the
wire, the payload is a JSON object whose `type` key carries the
entry's discriminator string and whose remaining keys are the
entry's fields, named exactly as the spec names them:

```json
{
    "type": "acme_audience_quick_settings",
    "advertiser_id": "12345",
    "membership_ttl_days": 30
}
```

The same entry drives two artifacts that must stay in lockstep:

- **The connector's type and codec.** A type whose decoder accepts
  the payload only when `type` equals the discriminator, and whose
  encoder writes the discriminator back. The entry's `parser` names
  the delivery-side parser this settings type selects; the binding
  lives with the type so the delivery executor can go from decoded
  settings to the right parser without a lookup table elsewhere.
- **The settings-form contract.** A JSON Schema whose properties are
  the same fields with the same types and the same `required` set,
  plus the same discriminator. `/add-connector-app-ui` renders the
  form from this schema, so a field added to the type but not the
  schema is invisible in the UI, and a field added to the schema but
  not the type produces payloads the connector rejects.

Spec field types map across surfaces mechanically: `string` →
JSON Schema `"string"` → the language's string type; `integer` →
`"integer"` → the language's integer type; `boolean` → `"boolean"` →
the language's boolean. A field with `required: false` is optional
on every surface, not just one.

## Typical realizations per language

How the portable terms usually land, per language. These rows are
illustrations for orientation, not defaults: the target's manifest
`stack` block, its exemplar connector's files, or its runtime profile
decide the real idiom, and when any of those supplies an answer,
ignore this table.

| Portable term | Scala | TypeScript | Python | Go |
|---|---|---|---|---|
| Quick-settings type set | Sealed trait with one case class per type; an enum object lists the types | Discriminated union keyed on the `type` member | One dataclass or pydantic model per type | One struct per type |
| Discriminator | Encoder/decoder pair that injects and checks the `type` key | Literal `type` member narrows the union | `Literal["<value>"]` field | `Type string` field checked in `UnmarshalJSON` |
| Parser binding | The type's enum entry carries its parser type | A map from `type` value to parser function | An attribute or registry mapping model to parser | A method or map from struct to parser func |
| Record schema | JSON resource file in the interface-owning module | JSON file or exported const | JSON file or module-level dict | Embedded JSON file |
| Settings-form contract | Derived from the case class by the serialization library, or a JSON resource | Derived from the union type, or a JSON file | Derived from the model, or a JSON file | A JSON file |

Whatever the language: the discriminator strings, field names, field
types, and `required` sets come from `quick_settings[]` verbatim, and
the record schema's `$defs` come from this reference verbatim. Only
the packaging is the target's.
