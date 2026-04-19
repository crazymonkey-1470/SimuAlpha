"""Response envelope helpers mirroring backend/middleware/envelope.js."""

from __future__ import annotations

from typing import Any

from fastapi.responses import JSONResponse

from simualpha_quant.schemas.common import ErrorResponse, Meta, SuccessResponse


def success(data: Any, status_code: int = 200, **meta_extra: Any) -> JSONResponse:
    payload = SuccessResponse(data=data, meta=Meta(**meta_extra))
    return JSONResponse(payload.model_dump(mode="json"), status_code=status_code)


def fail(error: str, status_code: int = 400, details: Any | None = None) -> JSONResponse:
    payload = ErrorResponse(error=error, details=details)
    return JSONResponse(payload.model_dump(mode="json"), status_code=status_code)
