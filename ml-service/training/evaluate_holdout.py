"""Evaluate the saved model once on fraudTest.csv and measure online latency."""

from __future__ import annotations

import argparse
import http.client
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml-service"))
from app.features import build_features  # noqa: E402
from train import chronological_split, load_csv  # noqa: E402


def read_root_env() -> dict[str, str]:
    result: dict[str, str] = {}
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                result[key.strip()] = value.strip().strip("\"'")
    return result


def confusion(labels: np.ndarray, predictions: np.ndarray) -> dict[str, int]:
    return {
        "true_negative": int(np.sum((labels == 0) & (predictions == 0))),
        "false_positive": int(np.sum((labels == 0) & (predictions == 1))),
        "false_negative": int(np.sum((labels == 1) & (predictions == 0))),
        "true_positive": int(np.sum((labels == 1) & (predictions == 1))),
    }


def classification_metrics(labels: np.ndarray, probabilities: np.ndarray, threshold: float) -> dict:
    predicted = probabilities >= threshold
    tp = int(np.sum((labels == 1) & predicted))
    fp = int(np.sum((labels == 0) & predicted))
    fn = int(np.sum((labels == 1) & ~predicted))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "threshold": float(threshold), "precision": precision, "recall": recall, "f1": f1,
        "confusion_matrix": confusion(labels, predicted.astype(int)),
    }


def tier_summary(labels: np.ndarray, probabilities: np.ndarray, low_max: float, high_min: float) -> dict:
    tiers = {
        "low": probabilities < low_max,
        "borderline": (probabilities >= low_max) & (probabilities < high_min),
        "high": probabilities >= high_min,
    }
    total = len(labels)
    summary = {}
    for name, mask in tiers.items():
        count = int(mask.sum())
        fraud_count = int(labels[mask].sum())
        summary[name] = {
            "count": count,
            "share": count / total if total else 0.0,
            "fraud_count": fraud_count,
            "fraud_rate": fraud_count / count if count else 0.0,
        }
    summary["borderline_plus_high_share"] = summary["borderline"]["share"] + summary["high"]["share"]
    return summary


def measure_latency(service_url: str, requests_count: int = 1000) -> dict:
    parsed = urlparse(service_url)
    connection = http.client.HTTPConnection(parsed.hostname, parsed.port or 80, timeout=10)
    path = (parsed.path.rstrip("/") + "/score") or "/score"
    body = json.dumps({"transaction": {
        "trans_date_trans_time": "2020-06-21T12:00:00Z", "cc_num": "latency-benchmark-customer",
        "category": "grocery_pos", "amt": 42.5, "lat": 40.7, "long": -74.0,
        "merch_lat": 40.71, "merch_long": -74.01, "city_pop": 8000000, "dob": "1990-01-01",
        "customer_avg_amount_past": 0, "customer_txn_count_past": 0,
    }}).encode()

    def request() -> float:
        start = time.perf_counter()
        connection.request("POST", path, body=body, headers={"Content-Type": "application/json"})
        response = connection.getresponse()
        payload = response.read()
        elapsed = (time.perf_counter() - start) * 1000
        if response.status != 200:
            raise RuntimeError(f"/score latency request failed ({response.status}): {payload[:300]!r}")
        return elapsed

    try:
        for _ in range(25):
            request()
        samples = np.array([request() for _ in range(requests_count)], dtype=float)
    finally:
        connection.close()
    return {
        "endpoint": service_url.rstrip("/") + "/score", "measured_requests": requests_count,
        "warmup_requests": 25, "method": "sequential local HTTP requests; end-to-end request time",
        "p50_ms": float(np.percentile(samples, 50)), "p95_ms": float(np.percentile(samples, 95)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train", type=Path, default=ROOT / "data" / "fraudTrain.csv")
    parser.add_argument("--holdout", type=Path, default=ROOT / "data" / "fraudTest.csv")
    parser.add_argument("--artifacts", type=Path, default=ROOT / "ml-service" / "artifacts")
    parser.add_argument("--service-url", default=os.getenv("ML_SERVICE_URL", "http://127.0.0.1:8000"))
    args = parser.parse_args()
    if not args.train.exists() or not args.holdout.exists():
        raise FileNotFoundError("Both fraudTrain.csv and fraudTest.csv are required")

    env = read_root_env()
    low_max = float(env.get("LOW_MAX", "0.30"))
    high_min = float(env.get("HIGH_MIN", "0.80"))
    if not 0 <= low_max < high_min <= 1:
        raise ValueError("Thresholds must satisfy 0 <= LOW_MAX < HIGH_MIN <= 1")

    bundle = joblib.load(args.artifacts / "fraud_model.joblib")
    pipeline = bundle["pipeline"]

    # Threshold assessment uses only the chronological validation tail of fraudTrain.
    train_rows, valid_rows = chronological_split(load_csv(args.train))
    validation_rows = pd.concat([train_rows, valid_rows], ignore_index=True)
    validation_features = build_features(validation_rows).iloc[len(train_rows):]
    validation_labels = pd.to_numeric(valid_rows["is_fraud"], errors="coerce").fillna(0).astype(int).to_numpy()
    validation_probabilities = pipeline.predict_proba(validation_features)[:, 1]
    proposed_low = float(np.quantile(validation_probabilities, 0.95, method="higher"))
    proposed_high = float(np.quantile(validation_probabilities, 0.99, method="higher"))
    if proposed_high <= proposed_low:
        proposed_high = min(1.0, float(np.nextafter(proposed_low, 1.0)))
    validation_threshold_review = {
        "data_source": "chronological validation tail of fraudTrain.csv; holdout not used",
        "rows": len(validation_labels),
        "current_thresholds": {"low_max": low_max, "high_min": high_min},
        "current_tiers": tier_summary(validation_labels, validation_probabilities, low_max, high_min),
        "current_metrics_at_review_queue_threshold": classification_metrics(validation_labels, validation_probabilities, low_max),
        "current_metrics_at_high_threshold": classification_metrics(validation_labels, validation_probabilities, high_min),
        "proposal_for_at_most_five_percent_review_queue": {
            "low_max": proposed_low, "high_min": proposed_high,
            "validation_tiers": tier_summary(validation_labels, validation_probabilities, proposed_low, proposed_high),
            "validation_metrics_at_review_queue_threshold": classification_metrics(validation_labels, validation_probabilities, proposed_low),
            "validation_metrics_at_high_threshold": classification_metrics(validation_labels, validation_probabilities, proposed_high),
            "selection": "LOW_MAX is the validation 95th percentile and HIGH_MIN the validation 99th percentile of risk scores.",
            "applied": False,
        },
    }

    # Holdout is now read and scored once, after thresholds have been fixed from validation.
    holdout_rows = load_csv(args.holdout)
    combined_rows = pd.concat([train_rows, valid_rows, holdout_rows], ignore_index=True)
    combined_features = build_features(combined_rows)
    holdout_features = combined_features.iloc[len(train_rows) + len(valid_rows):]
    holdout_labels = pd.to_numeric(holdout_rows["is_fraud"], errors="coerce").fillna(0).astype(int).to_numpy()
    holdout_probabilities = pipeline.predict_proba(holdout_features)[:, 1]
    result = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_file": str(args.holdout),
        "model_file": str(args.artifacts / "fraud_model.joblib"),
        "holdout_rows": len(holdout_labels),
        "fraud_count": int(holdout_labels.sum()),
        "fraud_rate": float(holdout_labels.mean()),
        "pr_auc": float(average_precision_score(holdout_labels, holdout_probabilities)),
        "thresholds": {"low_max": low_max, "high_min": high_min},
        "metrics_at_review_queue_threshold": classification_metrics(holdout_labels, holdout_probabilities, low_max),
        "metrics_at_high_threshold": classification_metrics(holdout_labels, holdout_probabilities, high_min),
        "tiers": tier_summary(holdout_labels, holdout_probabilities, low_max, high_min),
        "validation_threshold_review": validation_threshold_review,
        "latency": measure_latency(args.service_url),
        "definitions": {
            "review_queue_threshold": "Transactions at or above LOW_MAX (borderline plus high).",
            "high_threshold": "Transactions at or above HIGH_MIN (high tier only).",
            "pr_auc": "Average precision over all holdout risk scores.",
            "fraud_rate_by_tier": "Labeled fraud transactions divided by all transactions in that tier.",
            "feature_history": "Past-only customer aggregates are computed over chronological training and holdout rows; labels are not used as features.",
        },
    }
    args.artifacts.mkdir(parents=True, exist_ok=True)
    output = args.artifacts / "holdout_metrics.json"
    output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    print(f"Saved {output}")


if __name__ == "__main__":
    main()
