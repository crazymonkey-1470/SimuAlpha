"""Envelope + error models shared across endpoints.

Shape mirrors backend/middleware/envelope.js so OpenClaw can parse
responses from the quant service and the Node backend with the same
logic.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


class Meta(BaseModel):
    model_config = ConfigDict(extra="allow")
    timestamp: str = Field(default_factory=_now_iso)


class SuccessResponse(BaseModel, Generic[T]):
    success: bool = True
    data: T
    meta: Meta = Field(default_factory=Meta)


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    details: Any | None = None
    meta: Meta = Field(default_factory=Meta)
