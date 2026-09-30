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

Variation comes in two kinds, and they are not worth the same.

**Vocabulary** is what people call the thing. Every entry below is a
different word, so each one teaches the model something it could not
have derived from the others:

| Axis | Example for `German Shepherd Dog` |
| --- | --- |
| Canonical form | `German Shepherd Dog` |
| Registry or standard-body alternate | `Alsatian`, `Deutscher Schäferhund` |
| Historical or superseded name | `Alsatian Wolf Dog` |
| Regional name | `Alsatian` (UK), `German Shepherd` (US) |
| Slang and colloquial | `shep`, `sheppy` |
| Other language | `Berger Allemand`, `Pastor Alemán`, `Perro policía` |
| Domain shorthand or code | `GSD`, `K9`, a clinic's internal breed code |
| Descriptive compound | `black and tan shepherd`, `working line shepherd` |
| Metonym or role name | `police dog`, `service shepherd` |

**Surface** is how the same word gets typed. Each entry is a
transformation of a string the model has already seen, so it teaches
robustness to noise and nothing about meaning:

| Axis | Example |
| --- | --- |
| Casing | `german shepherd dog`, `GERMAN SHEPHERD DOG` |
| Clipping and abbreviation | `germ shep`, `g. shepherd` |
| Spacing, joining, hyphenation | `germanshepherd`, `german-shepherd`, `german shepard dog` |
| Misspelling | `german shepard`, `germen shepherd`, `sheperd` |
| Embedded qualifier | `german shepherd (male, 3yo)`, `gsd puppy` |

**Vocabulary first, surface second.** Exhaust the vocabulary axes
before reaching for surface ones. Ten different names for a breed span
ten regions of the input space; ten misspellings of one name span one
region and its immediate neighbourhood. A set built surface-first looks
diverse by row count and is narrow by content.

**Running out of vocabulary is a signal, not a quota to fill.** When a
class has one name and no slang, no second language in the source
population, and no shorthand, it genuinely supports fewer distinct
examples than a class with nine names. Padding it to the floor with
mechanical string mutations — the same word with a different letter
doubled, twenty times — produces rows that are technically distinct and
carry almost no information. Two responses are legitimate: lower the
floor for that class and say so, or take the padding and report that
the class is mostly one string wearing hats. Silently emitting twenty
doubled-letter variants and calling the class covered is not.

**Boundary cases decide whether the model is usable.** A classifier
trained only on clear examples has never been shown where a class
stops. Deliberately include values sitting close to the line between
two classes and label each one correctly, so the boundary is learned
rather than guessed: `flat coated retriever` belongs to its own class,
not to `Golden Retriever`, and a training set that never says so leaves
the model to guess. This axis is the one most often skipped.

## Build the vocabulary before writing any rows

The vocabulary axes are the ones that carry information, and they are
also the ones that cannot be derived from the class name by
transformation. `Alsatian` is not reachable from `German Shepherd Dog`
by any string edit. Either you know it or the class does not get it.

So collect the vocabulary as a separate step, before generating, and
write it down per class:

1. **Read the real values first.** The source has already told you which
   alternate names the population actually uses. If clinic staff type
   `Wiener Dog` and `mutt`, those registers are live in this data and
   belong in the synthetic half too.
2. **Ask what else this population would type.** Consider the
   attribute's domain and the source's likely authors: a US vet clinic,
   a UK shelter, a bilingual intake desk, a breeder registry. Different
   authors reach for different names for the same class.
3. **Name the languages in scope.** A dataset from a region with a
   second working language will contain that language's terms. Adding
   `Pastor Alemán` to a training set whose source population never
   writes Spanish is noise; omitting it from one that does is a gap the
   classifier will hit in production.

### Fan the research out when the class list is long

Above roughly 30 classes, researching vocabulary one class at a time in
the main conversation is slow and tends to degrade — the later classes
get thinner treatment than the earlier ones, which shows up directly as
uneven per-class quality in the finished set.

When the harness offers subagents, fan the work out instead: batch the
classes into groups of 10 to 20 and give each agent the same brief —
the attribute, the domain, the observed real values as a style
reference, the languages in scope, and the axes table above. Ask each
to return, per class, the alternate names it is confident a real author
would type, with a one-word note on which axis each came from.

Two things make the results usable rather than merely plentiful:

- **Ask for confidence, and drop what comes back weak.** An invented
  alternate name is worse than a missing one: it teaches the model that
  a string nobody writes belongs to a class. A name the agent is unsure
  about is exactly the kind that gets invented.
- **Deduplicate across groups before generating.** Independent agents
  will return the same obvious names, and two agents can return the
  same name for two different classes — which becomes a contradictory
  label if it reaches the training set. Resolve those collisions in the
  conversation, not in the data.

The generation itself stays in the conversation. The fan-out gathers
vocabulary; it does not write the rows.

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
