"""Dependency-light feature engineering and endpoint contract checks."""

import unittest
import sys
from pathlib import Path
from unittest.mock import patch

import pandas as pd
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.features import build_features, haversine_km, one_transaction_features
from app.main import score
from app.schemas import ScoreRequest


class FeatureTests(unittest.TestCase):
    def test_haversine_same_point_is_zero(self):
        self.assertAlmostEqual(float(haversine_km(40, -70, 40, -70)), 0.0, places=4)

    def test_customer_average_uses_only_prior_amounts(self):
        rows = pd.DataFrame({
            "trans_date_trans_time": ["2024-01-01 10:00:00", "2024-01-02 10:00:00", "2024-01-03 10:00:00"],
            "cc_num": ["a", "a", "a"], "amt": [10, 30, 50], "category": ["x"] * 3,
        })
        features = build_features(rows)
        self.assertEqual(features["customer_avg_amount_past"].tolist(), [0.0, 10.0, 20.0])
        self.assertEqual(features["customer_txn_count_past"].tolist(), [0.0, 1.0, 2.0])

    def test_online_history_summary_is_used(self):
        row = one_transaction_features({"amt": 20, "category": "x", "customer_average_amount": 10, "customer_transaction_count": 3})
        self.assertEqual(row.iloc[0]["customer_avg_amount_past"], 10)
        self.assertEqual(row.iloc[0]["amount_vs_customer_avg"], 2)
        self.assertEqual(row.iloc[0]["customer_txn_count_past"], 3)

    def test_score_endpoint_returns_contract_shape(self):
        expected = {"risk_score": 0.7, "risk_tier": "borderline", "top_contributing_features": []}
        with patch("app.main.score_transaction", return_value=expected):
            result = score(ScoreRequest(transaction={"amt": 15}))
        self.assertEqual(result, expected)

    def test_score_endpoint_requires_transaction(self):
        with self.assertRaises(HTTPException) as error:
            score(ScoreRequest())
        self.assertEqual(error.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
