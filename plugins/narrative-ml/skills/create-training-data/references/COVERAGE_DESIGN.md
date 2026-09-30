# Coverage design

Read before phase 6. This explains where the default floors come from,
what class balance does to a trained model, and what feature coverage
means when the feature is a string.

## Class coverage

A class with zero training rows is not a weak class. It is a class the
model cannot emit at all, because nothing in training ever mapped to
it. The model will still be asked to classify values that belong to it,
and it will assign them somewhere else, with a confidence that carries
no warning.

This is why the phase 6 bucketing separates absent from thin. They look
similar in a histogram and they are different problems: a thin class is
inaccurate, an absent class is impossible.

### Why 25 rows

`--min-per-class 25` is a working floor rather than a derived one. It
comes from what goes wrong below it:

- Under about 10 rows, a stratified split cannot put a meaningful
  number on both sides, so the class is effectively untested.
- Under about 25, the model tends to memorize the specific strings
  rather than learn what they share, and any accuracy measured on that
  class is measuring recall of a short list.

Raise the floor when a class matters more than its neighbors, or when
its values vary a lot in surface form. Lower it only with a stated
reason.

### Why cap the head

`--max-per-class 500` exists because real distributions are steep. A
breed column will have hundreds of thousands of rows for the popular
breeds and a handful for the rare ones.

Left uncapped, a linear model gets most of its loss reduction from
predicting the majority class, so it does. The result reads well as
overall accuracy and poorly per class, and the per-class number is the
one that matters when every class in the enum is a real answer someone
needs.

Capping the head is cheaper and more predictable than reweighting, and
it makes the training set smaller rather than larger.

## What "balanced" should mean here

Not every class deserves equal weight. Two questions decide it:

1. **Does the production distribution matter?** If the classifier's
   output feeds a count, the training mix should resemble the real mix,
   so the model's errors distribute the way the data does.
2. **Is every class an answer someone will act on?** If yes, every
   class needs enough rows to be predictable, whatever its natural
   frequency.

For mapping a messy column onto a Rosetta Stone enum, the second is
almost always the case: the enum exists because each of its values is
meaningful. Flatten toward equal representation, with the head capped
and the tail filled.

Say which regime is in effect when reporting. A flattened training set
produces a model whose predicted class distribution does not match
reality, and someone counting its outputs later should know that.

## Feature coverage for a text classifier

For a text feature, coverage is not the number of rows. It is the
number of *distinct* values, and how much they differ from one another.

Two hundred rows of the exact string `Golden Retriever` teach the model
one thing. Twenty rows spanning canonical form, lowercase, two
misspellings, an abbreviation, and an embedded qualifier teach it what
those variants have in common — which is the thing it needs at
inference time, because production data will contain a variant it has
never seen.

This is why phase 6 checks `distinct_inputs` alongside `row_count`. A
class can clear the row floor while sitting at one or two distinct
values, and that class is memorized, not learned. Treat it as thin.

For numeric and categorical features, coverage means the range and the
combinations present. Watch for a feature that is constant within a
class across the whole training set: the model will use it as a
shortcut, and the shortcut breaks the first time production data
disagrees.

## Splits and small classes

Stratification is not optional once classes are small. Random splitting
of a class with 25 rows at a 20% test size can put all of them on one
side, and then the class is either untested or untrained, silently
either way.

Turn stratification on, set a fixed random state so retrains are
comparable, and keep the test size modest — 0.2 is a reasonable default
when the smallest class sits near the floor.

## Reading the accuracy number

Two things systematically inflate the headline score on a training set
built this way:

**Synthetic rows in the test split.** They were written by the same
process that wrote the training rows, so they share its assumptions.
The model scores well on them partly because they are the kind of thing
it was taught to expect. The `training_source` column makes the honest
second read a one-line filter: score on real rows only, and compare.

**Duplicate rows across splits.** A value appearing in both splits turns
part of the test into a memory check. Phase 9's leakage check catches
identical strings between the real and synthetic halves; near-duplicates
that differ by a character are harder to catch and worth a look when a
score comes back suspiciously high.

Overall accuracy is also the wrong headline for a many-class problem.
Macro F1 weights every class equally, which is the point of filling the
tail, so report it alongside.
