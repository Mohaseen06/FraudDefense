"""Leakage-aware feature engineering for the Sparkov transaction schema."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

TARGET_COLUMN = "is_fraud"
TIME_COLUMN = "trans_date_trans_time"
CUSTOMER_COLUMN = "cc_num"
CATEGORICAL_FEATURES = ["category"]
NUMERIC_FEATURES = [
    "distance_km", "hour", "day_of_week", "amount", "customer_age",
    "city_pop", "customer_avg_amount_past", "customer_txn_count_past",
    "amount_vs_customer_avg",
]
FEATURE_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def haversine_km(lat1: Any, lon1: Any, lat2: Any, lon2: Any) -> np.ndarray:
    """Return great-circle distance in kilometers for scalar or array inputs."""
    lat1, lon1, lat2, lon2 = [np.radians(pd.to_numeric(v, errors="coerce")) for v in (lat1, lon1, lat2, lon2)]
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def _first_present(frame: pd.DataFrame, *names: str, default: Any = np.nan) -> pd.Series:
    for name in names:
        if name in frame.columns:
            return frame[name]
    return pd.Series(default, index=frame.index)


def build_features(rows: pd.DataFrame, *, include_target: bool = False) -> pd.DataFrame:
    """Create features in original row order; customer aggregates use past rows only."""
    if rows.empty:
        columns = FEATURE_COLUMNS + ([TARGET_COLUMN] if include_target else [])
        return pd.DataFrame(columns=columns, index=rows.index)

    frame = rows.copy()
    frame["_original_order"] = np.arange(len(frame))
    # Normalize both transaction timestamps and dates of birth to UTC so online
    # ISO timestamps (which commonly include ``Z``) can be safely subtracted.
    timestamp = pd.to_datetime(_first_present(frame, TIME_COLUMN, "transaction_time"), errors="coerce", utc=True)
    if timestamp.isna().all() and "unix_time" in frame:
        timestamp = pd.to_datetime(pd.to_numeric(frame["unix_time"], errors="coerce"), unit="s", errors="coerce", utc=True)
    frame["_timestamp"] = timestamp
    frame = frame.sort_values(["_timestamp", "_original_order"], kind="mergesort", na_position="last")

    amount = pd.to_numeric(_first_present(frame, "amt", "amount"), errors="coerce").fillna(0.0)
    customer = _first_present(frame, CUSTOMER_COLUMN, "customer_id").fillna("__unknown_customer__").astype(str)
    previous = amount.groupby(customer, sort=False).shift(1)
    prior_sum = previous.groupby(customer, sort=False).cumsum()
    prior_count = previous.notna().astype("int64").groupby(customer, sort=False).cumsum()
    avg_past = prior_sum.div(prior_count.replace(0, np.nan))
    dob = pd.to_datetime(_first_present(frame, "dob", "date_of_birth"), errors="coerce", utc=True)

    features = pd.DataFrame(index=frame.index)
    features["distance_km"] = haversine_km(
        _first_present(frame, "lat", "customer_lat"),
        _first_present(frame, "long", "customer_long", "lon"),
        _first_present(frame, "merch_lat", "merchant_lat"),
        _first_present(frame, "merch_long", "merchant_long", "merchant_lon"),
    )
    features["hour"] = frame["_timestamp"].dt.hour
    features["day_of_week"] = frame["_timestamp"].dt.dayofweek
    features["amount"] = amount
    features["customer_age"] = (frame["_timestamp"] - dob).dt.days / 365.2425
    features["city_pop"] = pd.to_numeric(_first_present(frame, "city_pop", "city_population"), errors="coerce")
    features["customer_avg_amount_past"] = avg_past.fillna(0.0)
    features["customer_txn_count_past"] = prior_count.astype(float)
    features["amount_vs_customer_avg"] = amount.div(avg_past.replace(0, np.nan)).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    features["category"] = _first_present(frame, "category", "merchant_category", default="unknown").fillna("unknown").astype(str)

    for column in NUMERIC_FEATURES:
        features[column] = pd.to_numeric(features[column], errors="coerce").replace([np.inf, -np.inf], np.nan).fillna(0.0)
    result = features[FEATURE_COLUMNS].copy()
    if include_target and TARGET_COLUMN in frame.columns:
        result[TARGET_COLUMN] = pd.to_numeric(frame[TARGET_COLUMN], errors="coerce")
    result["_original_order"] = frame["_original_order"]
    result = result.sort_values("_original_order", kind="mergesort").drop(columns="_original_order")
    result.index = rows.index
    return result


def one_transaction_features(transaction: dict[str, Any]) -> pd.DataFrame:
    """Build an online row and optionally apply prior-customer summary fields."""
    payload = dict(transaction)
    history_avg = payload.pop("customer_avg_amount_past", payload.pop("customer_average_amount", None))
    history_count = payload.pop("customer_txn_count_past", payload.pop("customer_transaction_count", None))
    result = build_features(pd.DataFrame([payload]))
    if history_avg is not None:
        average = max(float(history_avg), 0.0)
        result.loc[:, "customer_avg_amount_past"] = average
        result.loc[:, "amount_vs_customer_avg"] = result.iloc[0]["amount"] / average if average else 0.0
    if history_count is not None:
        result.loc[:, "customer_txn_count_past"] = max(float(history_count), 0.0)
    return result[FEATURE_COLUMNS]
