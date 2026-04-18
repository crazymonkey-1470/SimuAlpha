"""FastAPI app exposing the tool registry as HTTP endpoints.

Routes are generated from `simualpha_quant.tools.registry.TOOLS` — the
business logic lives in `tools/`, not here. This module is only
transport (HTTP body validation, auth, envelope).
"""

from __future__ import annotations

import time
from functools import partial
from typing import Callable

from fastapi import Depends, FastAPI, Request
from pydantic import BaseModel, ValidationError

from simualpha_quant.api.auth import AuthError, AuthedKey, require_auth
from simualpha_quant.api.responses import fail, success
from simualpha_quant.logging_config import configure_logging, get_logger
from simualpha_quant.tools.registry import TOOLS, ToolSpec

configure_logging()
log = get_logger(__name__)


def _make_handler(spec: ToolSpec) -> Callable:
    """Bind a tool spec to an async FastAPI handler closure."""

    async def handler(request: Request, auth: AuthedKey = Depends(require_auth)):
        started = time.time()
        try:
            body = await request.json()
        except Exception:
            return fail("Body must be JSON", 400)
        try:
            req_model = spec.request_model.model_validate(body)
        except ValidationError as exc:
            return fail("Invalid request body", 422, details=exc.errors())

        log.info(
            "tool call",
            extra={"tool": spec.name, "auth": auth.name, "bootstrap": auth.is_bootstrap},
        )
        try:
            result: BaseModel = spec.handler(req_model)
        except Exception as exc:
            log.exception("tool handler failed", extra={"tool": spec.name})
            return fail(f"{spec.name} failed", 500, details=str(exc))

        elapsed_ms = int((time.time() - started) * 1000)
        return success(result.model_dump(mode="json"), tool=spec.name, elapsed_ms=elapsed_ms)

    handler.__name__ = f"handle_{spec.name}"
    return handler


def create_app() -> FastAPI:
    app = FastAPI(
        title="SimuAlpha Quant Tools",
        description="HTTP tool provider for OpenClaw. Cache-first data access backed by OpenBB.",
        version="0.1.0",
    )

    @app.exception_handler(AuthError)
    async def _auth_error_handler(request: Request, exc: AuthError):  # noqa: ARG001
        return fail(exc.message, status_code=exc.status_code)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "service": "simualpha-quant-api", "tools": [t.name for t in TOOLS]}

    @app.get("/v1/tools")
    async def list_tools(_: AuthedKey = Depends(require_auth)) -> dict:
        return {
            "tools": [
                {
                    "name": t.name,
                    "route": t.http_route,
                    "description": t.description,
                    "request_schema": t.request_model.model_json_schema(),
                    "response_schema": t.response_model.model_json_schema(),
                }
                for t in TOOLS
            ]
        }

    for spec in TOOLS:
        app.add_api_route(
            spec.http_route,
            _make_handler(spec),
            methods=["POST"],
            name=spec.name,
            summary=spec.description,
        )

    return app


app = create_app()
