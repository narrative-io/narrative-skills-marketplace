# Edge cases and gotchas

Read when something does not add up: the attribute has no classes, the
plane is wrong, every label came back null, or the coverage report says
something the source data seemed to rule out.

## The attribute has no enum

An unconstrained string attribute has no class list, so there is
nothing to train toward. Stop and offer two ways forward: choose a
different attribute, or have the user supply an explicit class list,
which the skill then treats exactly as it would an enum.

Do not derive a class list from the distinct values in the source
column. That produces a model that reproduces the source's existing
categories, including its mistakes, and it will not match the Rosetta
Stone attribute anyone downstream is expecting.

## The attribute has hundreds of classes

Not a stop, but three things change and the user should hear them
before the first model call:

- The per-class floor now sets the row count. 200 classes at 25 rows is
  5,000 rows minimum, most of which will be synthetic.
- Every prompt carries every class name, so per-call cost scales with
  the class list, not just the value being labeled.
- Accuracy will be lower and macro F1 much lower than on a small class
  list. That is the problem being hard, not the training set being bad.

Offer to narrow the class list to the classes the source data can
plausibly contain.

## The data plane is not Snowflake

Stop. `AI_COMPLETE` does not exist on other planes, and Classifier
Studio does not appear in the navigation for them, so even a
hand-labeled dataset would have nothing to train in.

Do not offer to label in the conversation instead. At training-set
scale it is neither cheaper nor faster than the in-plane path, and it
moves customer data into the transcript for no gain.

## Cortex is not granted

The failure arrives at run time, not at validation, and it reads
`Insufficient privileges to operate on database role 'CORTEX_USER'`.

Surface it verbatim and name the fix: a Snowflake account admin runs
the grant once. The skill cannot work around it and should not try
another model id, since the missing grant is not model-specific.

## Every label came back null

Almost always `show_details` and the parse path disagreeing. The query
succeeds, the model responds, and the extraction reaches into a shape
that is not there.

Check that pairing before suspecting the prompt: `FALSE` pairs with
`PARSE_JSON(response)['value']`, `TRUE` pairs with
`PARSE_JSON(response)['structured_output'][0]['raw_message']['value']`.

## The exact match resolves nearly everything

Good news that is worth stating plainly: if the source column already
holds clean class names, a classifier may be solving a problem that
does not exist. A Rosetta Stone mapping expression is cheaper to build,
cheaper to run, and exact.

Offer `/generate-rosetta-stone-mappings` and let the user decide. They
may still want the classifier for the values that arrive next month.

## The exact match resolves nothing

Check the enum strings against a sample of source values before
spending anything on inference. Resolving nothing usually means the
source expresses the concept differently enough that the label input is
wrong — labeling from a code column against a display-name enum, for
instance.

## Class names differing only by case or accent

The exact match folds case, so two enum values differing only in case
collide and one of them silently never matches. Accents do not fold, so
`Frisé` and `Frise` stay distinct and a source carrying the
unaccented form never matches the accented class.

Both are class-design problems in the attribute rather than data
problems. Surface them; do not quietly normalize the enum, because
downstream consumers are matching against the attribute's actual
strings.

## A class the labeler was never confident about

When a class's mean confidence sits near the gate across most of its
rows, the usual cause is two enum values that overlap in meaning, so no
value is clearly one rather than the other.

Report it as a class-design observation. Training on it produces a
model that is confidently wrong at the boundary, and no amount of extra
data fixes an ambiguity in the class list.

## Name collision with an existing dataset

Stop and ask. `WRITE_MODE = 'overwrite'` will replace the contents of a
view that a model may already have been trained on, and once it is
overwritten, that model's training set cannot be reconstructed.

## The synthetic half outgrows the real half

Report the share and say what it means: past roughly half, the model is
mostly learning invented data. This is sometimes the right call — a
mostly-absent enum leaves no alternative — but it should be a decision
rather than a side effect of the floors.

## Leakage between the halves

Identical strings in both halves put the same value in the training
split and the test split, turning part of the score into a memory
check. Phase 9 counts them; offer to regenerate the colliding synthetic
rows rather than deleting them, since deleting drops the class back
below its floor.

## Re-running after a partial failure

The three views are independent, so a failure part-way through leaves
whatever succeeded in place. Re-run the phase that failed rather than
starting over, then rebuild the union. Check the class histogram
afterwards: a re-run against changed source data can shift coverage
even when the query is unchanged.
