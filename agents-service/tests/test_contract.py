import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import InvestigateRequest, investigate


class InvestigationContractTests(unittest.TestCase):
    def test_mock_response_matches_documented_shape(self):
        response = investigate(InvestigateRequest(
            case_id="case-123", transaction={"amt": 42}, customer_history_summary="",
            ml_score=0.72, risk_tier="borderline",
        ))
        payload = response.model_dump() if hasattr(response, "model_dump") else response.dict()
        self.assertIn(payload["recommendation"], {"allow", "verify", "block"})
        self.assertGreaterEqual(payload["confidence"], 0)
        self.assertLessEqual(payload["confidence"], 1)
        self.assertEqual(payload["citations"], [])
        self.assertTrue(payload["reasons"][0].startswith("Mock response:"))
        self.assertEqual(payload["agent_trace"][0]["agent"], "mock-investigator")


if __name__ == "__main__":
    unittest.main()
