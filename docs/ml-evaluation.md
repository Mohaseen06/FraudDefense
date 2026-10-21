# Fraud model evaluation

## Holdout result

The saved XGBoost model was evaluated once on `data/fraudTest.csv` (555,719 transactions, 2,145 labeled frauds). The current risk thresholds were `LOW_MAX = 0.30` and `HIGH_MIN = 0.80`. Thresholds were not chosen or adjusted using the holdout.

PR-AUC (average precision) was **0.8685**. Treating the review queue as every transaction with a score at or above `LOW_MAX` (borderline plus high) gives **61.90% precision, 85.45% recall, and 71.80% F1**.

| Actual / predicted | Not flagged | Flagged for review |
| --- | ---: | ---: |
| Not fraud | 552,446 (TN) | 1,128 (FP) |
| Fraud | 312 (FN) | 1,833 (TP) |

At the stricter high threshold (`score >= 0.80`), precision is **88.65%**, recall **76.46%**, and F1 **82.10%**.

## Traffic by risk tier

| Tier | Transactions | Traffic share | Fraud rate within tier |
| --- | ---: | ---: | ---: |
| Low | 552,758 | 99.47% | 0.056% |
| Borderline | 1,111 | 0.20% | 17.37% |
| High | 1,850 | 0.33% | 88.65% |

Borderline plus high accounts for **0.53%** of holdout traffic, below the few-percent processing goal. The chronological validation split had a **0.78%** borderline-plus-high share at the same thresholds. No threshold change is needed, and none was applied.

## Scoring latency

The local `/score` API was called sequentially for 1,000 measured requests after 25 warmups, using a separate synthetic transaction. End-to-end local HTTP latency was **42.81 ms p50** and **51.73 ms p95**. This is a single-machine local measurement, not a production capacity test.

## Method and limits

Threshold performance and the optional threshold review were calculated on the chronological validation tail of `fraudTrain.csv` before holdout scoring. The holdout was then scored with the saved model and current thresholds. Features use transaction amounts from earlier chronological rows for customer-history aggregates; labels are not features. Precision, recall, F1, and the confusion matrix are shown both for the review-queue cutoff (`LOW_MAX`) and the high-only cutoff (`HIGH_MIN`) in `ml-service/artifacts/holdout_metrics.json`.

These results describe this supplied Sparkov holdout and the current feature pipeline. They do not establish performance on live card traffic, and the measured latency does not include backend, MongoDB, or browser time.
