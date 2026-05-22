# Analytical patterns — worked examples

Common archetypes that `/design-analysis` is asked to scope. Each
pattern lists the typical unit of analysis, the dimensions worth
decomposing along, the biases and confounders to watch for, and the
shape the resulting brief should take. Use these as a starting frame
when the user's question fits one of the archetypes — adapt
dimensions and watch-fors to the specific data context.

## "Why did `<metric>` drop last quarter?"

Decomposition-over-comparison-period analysis.

- Unit of analysis: usually the lowest grain the metric is reported
  at (user-day, session, transaction).
- Comparison period: prior quarter (or year-ago for seasonal metrics).
- Decomposition dimensions: typical first cuts are by acquisition
  channel, plan tier, geography, cohort, and product surface — pick
  2–3 that the user can act on.
- Watch for: Simpson's paradox (the aggregate drop may flip sign
  inside segments), seasonality, marketing-campaign timing.

Brief contains: total-counts validation, by-dimension breakdown,
period-over-period delta by dimension, ranked attribution.

## "Is there a relationship between `<A>` and `<B>`?"

Correlation / association analysis.

- Unit of analysis: the entity at which both A and B vary.
- Time window: pick a window where both are observable.
- Watch for: collider bias, both A and B driven by a third
  variable, scale mismatch (rates vs. counts).
- Always include a "what we cannot conclude" line about causation.

Brief contains: per-entity joined dataset, marginal distributions of
A and B, joint distribution, conditional summary (B by buckets of A),
plus an explicit note that observational data cannot prove cause.

## "Who are our highest-value `<segment>`?"

Segmentation + ranking.

- Unit of analysis: customer / account / user.
- "Value" must be defined precisely: revenue, gross margin, LTV,
  engagement, retention — push back if vague.
- Watch for: survivorship bias (high-value retained customers ≠
  high-value cohort at acquisition), short-window bias.

Brief contains: per-entity value calculation, distribution of value
(so the user can see top-decile vs. long-tail), top-N table with
attribution dimensions, validation that the totals reconcile with a
known company-level number.

## "What's driving the change in `<Y>`?"

Decomposition analysis.

- Unit of analysis: typically the entity that contributes to Y.
- Decomposition strategy: additive (`Y = sum of components`),
  multiplicative (`Y = rate × volume`), or by dimension.
- Watch for: composition shift (`Y` changes because the mix of
  contributing entities changes, not their per-entity rate).

Brief contains: component-decomposition query, by-dimension shift
analysis, a "rate vs. volume" split if applicable.
