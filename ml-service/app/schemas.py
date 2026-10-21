"""Request and response models for the scoring endpoint."""

from typing import Any
from pydantic import BaseModel


class ScoreRequest(BaseModel):
    transaction: dict[str, Any] | None = None

    class Config:
        extra = "allow"
