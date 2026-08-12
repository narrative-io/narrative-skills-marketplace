# Generating the synthetic half

Read before phase 7. Synthetic rows exist for one reason: the classes
real data covers thinly or not at all. A class with no training rows is
a class the model can never predict, so filling those gaps changes what
the model is capable of, not just how accurate it is.

These rows are written by the agent in the conversation rather than by
`AI_COMPLETE` in the plane. Inventing a spread of plausible surface
forms needs the real data as a style reference and needs the user to
read the result, and both are easier in the conversation than in a
query whose output only becomes visible after it has been materialized.

## Look at the real data first

Before writing a single row, pull a sample of the real values and read
them for conventions:

- **Casing.** All lower, all upper, title case, or mixed?
- **Punctuation.** Are hyphens, slashes, and parentheses present?
- **Separators.** How does the source express a compound value —
  `lab/golden`, `lab x golden`, `Labrador Retriever Mix`?
- **Abbreviation.** Does the source shorten anything, and how?
- **Length.** Are these single words or descriptive phrases?
- **Noise.** What do the junk values look like — `n/a`, `-`, `unknown`,
  a stray digit, an empty-looking string of spaces?

Then match those conventions. This is the rule the whole phase turns
on: **a synthetic row that is cleaner than real data teaches the
classifier that cleanliness predicts the label.** Write every synthetic
value in tidy title case against a source that is all lowercase, and
the model learns to split on case rather than on meaning. It will score
well on a test split that shares the same flaw and fail on production
data.

## Vary along axes, not by repetition

Twelve copies of one string is one training example carrying twelve
times the weight. It is not twelve examples, and the extra weight is
not something anyone asked for.

Vary each class along these axes instead:

| Axis | Example for `Golden Retriever` |
| --- | --- |
| Canonical form | `Golden Retriever` |
| Casing variant | `golden retriever`, `GOLDEN RETRIEVER` |
| Abbreviation | `golden ret`, `g. retriever` |
| Misspelling | `golden retreiver`, `goldn retriever` |
| Embedded qualifier | `golden retriever (male, 3yo)`, `golden retriever puppy` |
| Alternate name | `goldie`, `yellow retriever` |
| Near-miss confusable | `flat coated retriever` labeled as its own class, not this one |

The last row is the one most often skipped and the one that most often
decides whether the model is usable. A classifier trained only on clear
examples has never been shown where a class stops. Deliberately include
values that sit close to the boundary between two classes and label
each one correctly, so the boundary is learned rather than guessed.

## Catch-all classes need their own examples

Enums usually carry one or two classes that mean "none of the above" —
`Unknown`, `Other`, `Mixed Breed`, `Unspecified`. These are the classes
most likely to be absent from real labeled data, because the exact
match never produces them and the model rarely picks them.

They also fail in a distinctive way. A model with no examples of
`Unknown` has nowhere to put garbage, so it assigns garbage to whichever
real class is nearest, confidently.

Write explicit rows for them:

- Junk that means nothing: `n/a`, `-`, `null`, `???`, `test`, `12345`
- Values that name the domain but not a class: `dog`, `puppy`, `canine`
- Genuinely ambiguous compounds, where the enum has a class for that:
  `lab/poodle mix`, `shepherd cross`

## Multi-column features have to stay consistent

When the features span several columns, generate whole rows, not
independent values per column. Sampling each column on its own produces
rows that are individually plausible and jointly impossible — a weight
of 4 lbs on a Great Dane, a breed and a size that contradict each other.

A classifier trained on impossible combinations learns that the columns
are unrelated, which is exactly the correlation it was supposed to pick
up. Write each row as a unit and read it back as one.

## Show the rows before materializing

Synthetic rows are invented and will be trained on, so the review step
is not a formality. It is the cheapest point in the whole process at
which a wrong label can be removed.

For a small set, show every row. For a large one, show every row for
two or three classes so the user can judge the style, plus per-class
counts for the rest. Say plainly how many rows are about to be created
and what share of the final training set they will be.

## Emitting the rows

The rows reach the platform as SQL string literals: a seed statement
creates the dataset with the first row, then one `INSERT … VALUES`
statement per chunk appends the rest, all sequenced as a workflow. The
mechanism, the chunk sizing, and the re-run behavior are in
[`WRITING_ROWS.md`](WRITING_ROWS.md).

Two things about the rows themselves:

**Quote escaping.** Every value is a single-quoted SQL string literal,
so an apostrophe inside one has to be doubled. Misspellings and
punctuation noise are the point of many of these rows, which makes
stray quoting errors more likely here than anywhere else in the skill.
Scan each chunk before submitting it.

**Order matters.** `INSERT` binds expressions to columns by position,
not by name, so each row's values must follow the column list in the
same order. A row that puts the label where the input belongs will
insert cleanly and train a model on nonsense.

## Sizing

Generate enough rows per gap class to reach `--min-per-class`, and stop.
Overshooting inverts the imbalance it was meant to fix: a class with 25
real rows and 200 synthetic ones is now mostly invented, and the model's
idea of that class is mostly the agent's idea of it.

Track the synthetic share of the final training set and report it. Past
roughly half, say so plainly — at that point the model is learning
invented data with real data as the minority, and the accuracy number
should be read accordingly.
