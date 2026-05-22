# Table references, identifier quoting, and Rosetta Stone scopes

The full schema/identifier reference for NQL. Read this when the
happy-path summary in the syntax-essentials snippet
(`company_data.<dataset_name>`, double-quote reserved identifiers)
isn't enough — e.g. you're querying another company's access rule,
addressing a freshly created dataset by numeric id, attaching a
Rosetta Stone scope, or hit a reserved-word collision on a column
name.

## Schema-qualified table references

Every table reference is **schema-qualified**. The three schemas
you'll meet in practice:

| Schema | Holds | Example |
| --- | --- | --- |
| `company_data` | Your own datasets, views, and the data shared into your tenant. | `company_data.web_events` |
| `<provider_slug>` | Another company's resources, exposed to you through an access rule. The schema name is that company's slug. | `acme."ar_fitness"` |
| `narrative` | Platform-wide special tables — most notably `narrative.rosetta_stone` for global identity resolution. | `narrative.rosetta_stone` |

## Addressing by `unique_name` vs. numeric id

Within a schema, a dataset, view, or access rule can be addressed two
ways:

| Form | Looks like | When to use |
| --- | --- | --- |
| **`unique_name`** (preferred) | `company_data.web_events` | Always, when you know it. Stable across environments, readable in code review, and survives dataset re-creation. Datasets, views, and access rules share a single `unique_name` namespace, so the same syntax works for all three. |
| Numeric id | `company_data."12345"` | Only when you don't have a `unique_name` — e.g. a freshly created dataset, or one referenced from a job payload. The id is numeric and **must** be double-quoted, otherwise NQL parses it as a number. |

```sql
-- Preferred: address by unique_name
SELECT user_id, email FROM company_data.web_events LIMIT 10

-- Fallback: address by numeric id (quoted)
SELECT user_id, email FROM company_data."12345" LIMIT 10
```

The schema name itself is just an identifier, so `"company_data"."12345"`
is equivalent to `company_data."12345"` — bare is the convention.

**Quoting a `unique_name`.** Leave safe snake_case slugs unquoted
(`web_events`). Double-quote when the name collides with a reserved
word, contains uppercase letters or dashes, or — as the docs do for
access rules — when you want to be defensive about an externally
supplied name: `acme."ar_fitness"`, `company_data."Order_History"`.

**Cross-dataset queries.** Fully qualify each side and alias them.
This works identically whether you mix forms or not:

```sql
SELECT u.user_id, o.order_id, o.total_cents
FROM company_data.users        AS u
JOIN company_data.order_history AS o ON u.user_id = o.user_id
```

## Identifier vs. literal quoting

Double quotes = identifier. Single quotes = string literal. Reversing
them is the single most common validation error.

| Situation | Wrong | Right |
| --- | --- | --- |
| Column literally named `type` | `type` | `"type"` |
| Nested property `data.value` | `data.value` | `data."value"` |
| Safe column name | (either works) | `email_address` |
| String literal | `"email"` | `'email'` |
| Type discriminator value | `email` | `'email'` |

Reserved words that must always be double-quoted when used as
identifiers: `type`, `value`, `user`, `order`, `group`, `select`,
`from`, `where`, `join`, `case`, `when`, `then`, `else`, `end`,
`null`, `true`, `false`.

## Rosetta Stone scopes

The `_rosetta_stone` virtual table attaches to any schema or dataset
to surface normalized identity data. The same name/id rule applies
to the dataset segment:

```sql
-- Global
FROM narrative.rosetta_stone
-- Company-scoped
FROM company_data._rosetta_stone
-- Dataset-scoped, by unique_name
FROM company_data.web_events._rosetta_stone
-- Dataset-scoped, by id
FROM company_data."12345"._rosetta_stone
```

When you don't already know the `unique_name`, look it up with
`narrative_datasets_search` / `narrative_datasets_describe` before
falling back to the id.
