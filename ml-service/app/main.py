"""FastAPI scoring service. Train the model before calling /score."""

import json
from functools import lru_cache
from typing import Any

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException

from . import config
from .features import one_transaction_features
from .schemas import ScoreRequest

app = FastAPI(title="Fraud Defense ML Service", version="0.1.0")


@lru_cache(maxsize=1)
def load_bundle() -> dict[str, Any] | None:
    return joblib.load(config.MODEL_PATH) if config.MODEL_PATH.exists() else None


@lru_cache(maxsize=1)
def load_metrics() -> dict[str, Any]:
    if not config.METRICS_PATH.exists():
        return {"status": "not_trained", "message": "Run training/train.py to create model metrics."}
    with config.METRICS_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def load_holdout_metrics() -> dict[str, Any] | None:
    path = config.ARTIFACT_DIR / "holdout_metrics.json"
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def risk_tier(score: float) -> str:
    if score < config.LOW_MAX:
        return "low"
    if score < config.HIGH_MIN:
        return "borderline"
    return "high"


def score_transaction(transaction: dict[str, Any]) -> dict[str, Any]:
    bundle = load_bundle()
    if bundle is None:
        raise RuntimeError("Model is not trained. Run training/train.py first.")
    features = one_transaction_features(transaction)
    pipeline = bundle["pipeline"]
    score = float(np.clip(pipeline.predict_proba(features)[0, 1], 0.0, 1.0))
    matrix = pipeline.named_steps["preprocessor"].transform(features)
    import xgboost as xgb
    contributions = pipeline.named_steps["classifier"].get_booster().predict(
        xgb.DMatrix(matrix), pred_contribs=True
    )[0][:-1]
    names = pipeline.named_steps["preprocessor"].get_feature_names_out()
    ranked = np.argsort(np.abs(contributions))[::-1][:5]
    top = [{"feature": str(names[i]).split("__", 1)[-1], "contribution": float(contributions[i])} for i in ranked]
    return {"risk_score": score, "risk_tier": risk_tier(score), "top_contributing_features": top}


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "model_loaded": config.MODEL_PATH.exists()}


@app.post("/score")
def score(request: ScoreRequest) -> dict[str, Any]:
    dump = request.model_dump if hasattr(request, "model_dump") else request.dict
    transaction = request.transaction if request.transaction is not None else dump(exclude_unset=True)
    if not transaction:
        raise HTTPException(status_code=422, detail="A transaction object is required")
    try:
        return score_transaction(transaction)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (TypeError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid transaction: {exc}") from exc


@app.get("/model-info")
def model_info() -> dict[str, Any]:
    result = dict(load_metrics())
    holdout = load_holdout_metrics()
    if holdout is not None:
        result["holdout_evaluation"] = holdout
    return result
