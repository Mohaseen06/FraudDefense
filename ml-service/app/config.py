"""Environment-backed configuration for the scoring service."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = Path(os.getenv("ARTIFACT_DIR", BASE_DIR / "artifacts"))
MODEL_PATH = Path(os.getenv("MODEL_PATH", ARTIFACT_DIR / "fraud_model.joblib"))
METRICS_PATH = Path(os.getenv("METRICS_PATH", ARTIFACT_DIR / "metrics.json"))
LOW_MAX = float(os.getenv("LOW_MAX", "0.30"))
HIGH_MIN = float(os.getenv("HIGH_MIN", "0.80"))
if not 0 <= LOW_MAX < HIGH_MIN <= 1:
    raise ValueError("Risk thresholds must satisfy 0 <= LOW_MAX < HIGH_MIN <= 1")
