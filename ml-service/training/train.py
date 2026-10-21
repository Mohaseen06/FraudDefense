"""Train and evaluate an XGBoost fraud model with a chronological holdout."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import average_precision_score, precision_recall_fscore_support
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml-service"))
from app.features import CATEGORICAL_FEATURES, FEATURE_COLUMNS, NUMERIC_FEATURES, build_features  # noqa: E402
from generate_synthetic_data import make_rows  # noqa: E402


REQUIRED = {
    "trans_date_trans_time", "cc_num", "amt", "category", "lat", "long",
    "city_pop", "dob", "merch_lat", "merch_long", "is_fraud",
}
READ_COLUMNS = list(REQUIRED | {"unix_time"})


def load_csv(path: Path) -> pd.DataFrame:
    """Inspect headers, ignore Sparkov's exported index column, then load needed data."""
    header = pd.read_csv(path, nrows=0).columns.tolist()
    actual = [column for column in header if not str(column).startswith("Unnamed:") and column != ""]
    missing = REQUIRED.difference(actual)
    if missing:
        raise ValueError(f"{path} is missing required columns: {', '.join(sorted(missing))}. Found: {actual}")
    selected = [column for column in actual if column in READ_COLUMNS]
    print(f"Reading {path.name}; detected columns: {', '.join(actual)}")
    return pd.read_csv(path, usecols=selected, low_memory=False)


def make_pipeline(scale_pos_weight: float, n_jobs: int) -> Pipeline:
    preprocess = ColumnTransformer(
        transformers=[
            ("numeric", SimpleImputer(strategy="median"), NUMERIC_FEATURES),
            ("category", Pipeline([
                ("imputer", SimpleImputer(strategy="most_frequent")),
                ("onehot", OneHotEncoder(handle_unknown="ignore")),
            ]), CATEGORICAL_FEATURES),
        ],
        remainder="drop",
    )
    classifier = XGBClassifier(
        n_estimators=350,
        max_depth=7,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=2,
        reg_lambda=1.0,
        objective="binary:logistic",
        eval_metric="aucpr",
        tree_method="hist",
        scale_pos_weight=scale_pos_weight,
        n_jobs=n_jobs,
        random_state=42,
    )
    return Pipeline([("preprocessor", preprocess), ("classifier", classifier)])


def chronological_split(rows: pd.DataFrame, validation_fraction: float = 0.2) -> tuple[pd.DataFrame, pd.DataFrame]:
    ordered = rows.copy()
    order = pd.to_datetime(ordered["trans_date_trans_time"], errors="coerce")
    ordered["_sort_time"] = order
    ordered = ordered.sort_values("_sort_time", kind="mergesort").drop(columns="_sort_time").reset_index(drop=True)
    cut = int(len(ordered) * (1 - validation_fraction))
    if cut < 1 or cut >= len(ordered):
        raise ValueError("Need at least two rows for a chronological train/validation split")
    return ordered.iloc[:cut].copy(), ordered.iloc[cut:].copy()


def train(train_path: Path, artifact_dir: Path, n_jobs: int = 4) -> dict:
    raw = load_csv(train_path)
    train_rows, valid_rows = chronological_split(raw)
    # Features are calculated on the ordered full frame, using only preceding values.
    # This allows validation transactions to use earlier training transactions as history.
    ordered = pd.concat([train_rows, valid_rows], ignore_index=True)
    features = build_features(ordered)
    split_at = len(train_rows)
    labels = pd.to_numeric(ordered["is_fraud"], errors="coerce").fillna(0).astype(int).to_numpy()
    x_train, x_valid = features.iloc[:split_at], features.iloc[split_at:]
    y_train, y_valid = labels[:split_at], labels[split_at:]
    positives = int(y_train.sum())
    negatives = int(len(y_train) - positives)
    if positives == 0 or len(np.unique(y_valid)) < 2:
        raise ValueError("Training and validation time windows must contain both fraud and legitimate examples")

    pipeline = make_pipeline(negatives / positives, n_jobs)
    pipeline.fit(x_train, y_train)
    probabilities = pipeline.predict_proba(x_valid)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)
    precision, recall, f1, _ = precision_recall_fscore_support(y_valid, predictions, average="binary", zero_division=0)
    metrics = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_file": str(train_path),
        "time_split": {
            "train_start": str(train_rows["trans_date_trans_time"].min()),
            "train_end": str(train_rows["trans_date_trans_time"].max()),
            "validation_start": str(valid_rows["trans_date_trans_time"].min()),
            "validation_end": str(valid_rows["trans_date_trans_time"].max()),
            "train_rows": len(train_rows),
            "validation_rows": len(valid_rows),
        },
        "fraud_counts": {"train": positives, "validation": int(y_valid.sum())},
        "scale_pos_weight": float(negatives / positives),
        "threshold": 0.5,
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "pr_auc": float(average_precision_score(y_valid, probabilities)),
        "feature_columns": FEATURE_COLUMNS,
    }
    artifact_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": pipeline, "feature_columns": FEATURE_COLUMNS}, artifact_dir / "fraud_model.joblib")
    (artifact_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train", type=Path, default=ROOT / "data" / "fraudTrain.csv")
    parser.add_argument("--artifacts", type=Path, default=ROOT / "ml-service" / "artifacts")
    parser.add_argument("--n-jobs", type=int, default=4)
    args = parser.parse_args()
    if not args.train.exists():
        print(f"{args.train} was not found; generating a synthetic dataset first.")
        args.train = ROOT / "data" / "syntheticTrain.csv"
        args.train.parent.mkdir(parents=True, exist_ok=True)
        make_rows(12000, datetime(2019, 1, 1), 21).to_csv(args.train, index=False)
    metrics = train(args.train, args.artifacts, args.n_jobs)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
