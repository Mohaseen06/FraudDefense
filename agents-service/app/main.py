"""Contract-only investigator response. No LLM, tools, agents, or RAG are used."""

from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Fraud Defense Investigation Stub", version="0.1.0")


class InvestigateRequest(BaseModel):
    case_id: str
    transaction: dict
    customer_history_summary: str = ""
    ml_score: float = Field(ge=0, le=1)
    risk_tier: Literal["low", "borderline", "high"]


class Citation(BaseModel):
    source: str
    section: str


class TraceEntry(BaseModel):
    agent: str
    action: str
    summary: str
    timestamp: str


class InvestigateResponse(BaseModel):
    recommendation: Literal["allow", "verify", "block"]
    confidence: float = Field(ge=0, le=1)
    reasons: list[str]
    citations: list[Citation]
    agent_trace: list[TraceEntry]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "mock"}


@app.post("/investigate", response_model=InvestigateResponse)
def investigate(request: InvestigateRequest) -> InvestigateResponse:
    """Return a clearly labelled placeholder matching docs/api-contracts.md."""
    return InvestigateResponse(
        recommendation="verify",
        confidence=0.5,
        reasons=["Mock response: no agents, language model, or policy retrieval are configured."],
        citations=[],
        agent_trace=[TraceEntry(
            agent="mock-investigator",
            action="return_mock_recommendation",
            summary=f"Mock response for case {request.case_id}; no investigation was performed.",
            timestamp=datetime.now(timezone.utc).isoformat(),
        )],
    )
