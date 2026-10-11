# Classifier Studio handoff

Read before phase 9. The training set is finished; this is how to
describe it so someone can configure Classifier Studio without going
back and re-deriving anything.

Classifier Studio lives at **My Models → Classifier Studio**. It only
appears on Snowflake data planes, and it only lists datasets in the
currently selected plane, so the plane selector has to match the plane
the training view was built in.

## Column shape to feature type

Classifier Studio takes each feature column with a processing type.
Pick from the observed shape of the column, not its declared SQL type:

| Column shape | Feature type | When |
| --- | --- | --- |
| Free text, high distinct count, meaning carried by the words | `text` | The default for a messy string column being mapped to an enum. |
| Free text where individual tokens matter more than order | `count_vectorizer` | Short phrases where a single word usually decides the class. Cheap and often strong on this problem. |
| String with a small, closed set of values | `categorical` | Fewer than roughly 50 distinct values, each meaningful on its own. |
| Numeric, continuous | `numeric` | Counts, prices, ages, sizes. |
| Pre-computed vectors | `embedding` | Only when the column already holds embeddings. This skill does not produce them. |

For the common case — one messy text column mapped to an enum — try
`count_vectorizer` first and `text` second. The class is usually decided
by which words are present rather than by their order, and the token
representation is the cheaper of the two to train.

The label column is `label`, type `string`.

Leave `training_source`, `labeled_by`, `label_confidence`, and
`input_freq` out of the feature list. They describe the row's origin
rather than its content, and `labeled_by` in particular would let the
model read the answer off its own provenance.

## Algorithm

Two are available, and the choice is not close for this kind of problem:

**Logistic regression** — the default here. It handles many classes and
high-dimensional sparse text features well, trains quickly, and its
coefficients can be inspected when a class behaves oddly. Start here.

**Random forest** — worth trying when features are numeric or
categorical rather than text, or when the boundary between classes
depends on combinations of features interacting. On sparse text with
many classes it tends to be slower and no better.

Each exposes its own hyperparameters with defaults that are reasonable
to start from. Regularization strength is the one worth touching first
for logistic regression, and tree count and maximum depth for random
forest.

## Split settings

| Setting | Recommended | Why |
| --- | --- | --- |
| Test size | 0.2 | Leaves enough rows on both sides when the smallest class sits near the 25-row floor. |
| Random state | Any fixed integer | Makes retrains comparable. Without it, a score change might be the split rather than the change being tested. |
| Stratification | On | Preserves the class mix in both splits. Without it a small class can land entirely on one side, leaving it either untrained or untested with no warning. |

## Reading the result

Trained classifiers appear under **My Models → Classifiers**, scoped to
the selected data plane. Each row carries accuracy, macro F1, class
count, and the job id.

Report macro F1 alongside accuracy. With many classes and a filled
tail, overall accuracy is dominated by whichever classes have the most
test rows, and macro F1 is the number that reflects the work spent
covering the rare ones.

Recommend a second read on real rows only. `training_source` makes it a
one-line filter, and the gap between the two scores is the most direct
measure available of how much the synthetic half is flattering the
model.

## Using the trained model

Once training succeeds, the classifier is callable from NQL through
`CALL_MODEL_FUNCTION`, which is what makes the whole exercise pay off —
the expensive labeler runs once over distinct values, and the cheap
model runs over everything after that:

```sql
SELECT
  src.input_col,
  CAST(PARSE_JSON(
    CALL_MODEL_FUNCTION('<model_name>', '<version>', 'PREDICT', src.input_col)
  )['OUTPUT'] AS STRING) AS predicted_label
FROM company_data."<dataset>" AS src
```

## Submitting without the UI

There is an API — `POST /model-training/train-classifier`, taking a
free-form `config` object, a `dataPlaneId`, and tags, and returning a
job id. It has no MCP tool, so this skill does not call it. Mention it
only if the user asks about automating retrains; the UI is the
supported path and the config shape is not documented.
