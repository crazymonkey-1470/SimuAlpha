"""FastAPI app exposing the tool registry as HTTP endpoints.

Routes are generated from `simualpha_quant.tools.registry.TOOLS` — the
business logic lives in `tools/`, not here. This module is only
transport (HTTP body validation, auth, envelope, async-job glue).
"""

from __future__ import annotations

import asyncio
import time
from typing import Callable

from fastapi import Depends, FastAPI, Request
from pydantic import BaseModel, ValidationError

from simualpha_quant.api.auth import AuthError, AuthedKey, require_auth
from simualpha_quant.api.responses import fail, success
from simualpha_quant.logging_config import configure_logging, get_logger
from simualpha_quant.research import jobs as jobs_mod
from simualpha_quant.research import universes
from simualpha_quant.schemas.backtest import BacktestPatternRequest
from simualpha_quant.schemas.simulate import SimulateStrategyRequest
from simualpha_quant.tools.backtest_pattern import backtest_pattern
from simualpha_quant.tools.registry import TOOLS, ToolSpec
from simualpha_quant.tools.simulate_strategy import simulate_strategy

configure_logging()
log = get_logger(__name__)

_BACKTEST_TOOL_NAME = "backtest_pattern"
_SIMULATE_TOOL_NAME = "simulate_strategy"

# Stage-4 async thresholds — stricter than Stage-3 because simulations
# run the full freqtrade backtest loop per trade.
SIMULATE_SYNC_COST_LIMIT: int = 200         # len(tickers) * num_years
SIMULATE_SYNC_TIME_LIMIT_SECONDS: float = 10.0


# ─────────────────────────── generic tool handler ──────────────────────


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

        # backtest_pattern and simulate_strategy have their own async-aware handlers.
        if spec.name == _BACKTEST_TOOL_NAME:
            return await _handle_backtest(request, req_model, started)  # type: ignore[arg-type]
        if spec.name == _SIMULATE_TOOL_NAME:
            return await _handle_simulate(request, req_model, started)  # type: ignore[arg-type]

        try:
            result: BaseModel = spec.handler(req_model)
        except Exception as exc:
            log.exception("tool handler failed", extra={"tool": spec.name})
            return fail(f"{spec.name} failed", 500, details=str(exc))

        elapsed_ms = int((time.time() - started) * 1000)
        return success(result.model_dump(mode="json"), tool=spec.name, elapsed_ms=elapsed_ms)

    handler.__name__ = f"handle_{spec.name}"
    return handler


# ─────────────────────────── backtest async glue ───────────────────────


def _years_in_range(req: BacktestPatternRequest) -> float:
    return max((req.date_range.end - req.date_range.start).days / 365.25, 1.0)


async def _handle_backtest(request: Request, req: BacktestPatternRequest, started: float):
    universe_size = (
        len(req.universe_spec.tickers) if req.universe_spec.tickers
        else len(universes.snapshot("tracked_8500").tickers)
    )
    years = _years_in_range(req)
    force_async = request.query_params.get("async", "").lower() in {"1", "true", "yes"}

    if force_async or jobs_mod.should_async(universe_size, years):
        job_id = jobs_mod.submit(req.model_dump(mode="json"))
        # Background runner is just an async wrapper around the sync tool.
        asyncio.create_task(
            jobs_mod.run_async(
                job_id,
                lambda: asyncio.to_thread(backtest_pattern, req),
            )
        )
        return success(
            {"job_id": job_id, "status": "queued"},
            status_code=202,
            tool=_BACKTEST_TOOL_NAME,
            async_mode="enqueued",
        )

    # Sync path with watchdog.
    try:
        result = jobs_mod.run_with_watchdog(lambda: backtest_pattern(req))
    except jobs_mod.SyncTimeoutExceeded as exc:
        # Work already completed but exceeded the time budget. Persist
        # as a "done" job and return the job_id mid-flight.
        job_id = jobs_mod.submit(req.model_dump(mode="json"))
        # We don't have the partial result here (watchdog raised before
        # returning); re-execute on the background so the job lifecycle
        # is correct, mark the existing call as "in flight, see job".
        asyncio.create_task(
            jobs_mod.run_async(
                job_id,
                lambda: asyncio.to_thread(backtest_pattern, req),
            )
        )
        log.info(
            "backtest exceeded sync time budget, converted to async",
            extra={"elapsed_s": float(str(exc)) if str(exc).replace(".", "", 1).isdigit() else None,
                   "job_id": job_id},
        )
        return success(
            {"job_id": job_id, "status": "queued"},
            status_code=202,
            tool=_BACKTEST_TOOL_NAME,
            async_mode="watchdog_converted",
        )
    except Exception as exc:
        log.exception("backtest_pattern failed", extra={"hash": getattr(exc, "hash", None)})
        return fail("backtest_pattern failed", 500, details=str(exc))

    elapsed_ms = int((time.time() - started) * 1000)
    return success(result.model_dump(mode="json"), tool=_BACKTEST_TOOL_NAME, elapsed_ms=elapsed_ms)


# ─────────────────────────── simulate async glue ───────────────────────


def _simulate_cost(req: SimulateStrategyRequest) -> int:
    universe = req.strategy.universe_spec
    if universe.tickers is not None:
        n = len(universe.tickers)
    else:
        n = len(universes.snapshot("tracked_8500").tickers)
    years = max((req.strategy.date_range.end - req.strategy.date_range.start).days / 365.25, 1.0)
    return int(n * years)


async def _handle_simulate(request: Request, req: SimulateStrategyRequest, started: float):
    force_async = request.query_params.get("async", "").lower() in {"1", "true", "yes"}
    cost = _simulate_cost(req)

    if force_async or cost > SIMULATE_SYNC_COST_LIMIT:
        job_id = jobs_mod.submit(req.model_dump(mode="json"))
        asyncio.create_task(
            jobs_mod.run_async(
                job_id,
                lambda: asyncio.to_thread(simulate_strategy, req),
            )
        )
        return success(
            {"job_id": job_id, "status": "queued"},
            status_code=202,
            tool=_SIMULATE_TOOL_NAME,
            async_mode="enqueued",
        )

    try:
        result = jobs_mod.run_with_watchdog(
            lambda: simulate_strategy(req),
            time_limit=SIMULATE_SYNC_TIME_LIMIT_SECONDS,
        )
    except jobs_mod.SyncTimeoutExceeded:
        job_id = jobs_mod.submit(req.model_dump(mode="json"))
        asyncio.create_task(
            jobs_mod.run_async(
                job_id,
                lambda: asyncio.to_thread(simulate_strategy, req),
            )
        )
        log.info(
            "simulate exceeded sync time budget, converted to async",
            extra={"job_id": job_id},
        )
        return success(
            {"job_id": job_id, "status": "queued"},
            status_code=202,
            tool=_SIMULATE_TOOL_NAME,
            async_mode="watchdog_converted",
        )
    except Exception as exc:
        log.exception("simulate_strategy failed")
        return fail("simulate_strategy failed", 500, details=str(exc))

    elapsed_ms = int((time.time() - started) * 1000)
    return success(result.model_dump(mode="json"), tool=_SIMULATE_TOOL_NAME, elapsed_ms=elapsed_ms)


# ─────────────────────────── jobs / admin ──────────────────────────────


async def _jobs_status_handler(job_id: str, _: AuthedKey = Depends(require_auth)):
    status = jobs_mod.status(job_id)
    if status is None:
        return fail(f"unknown job: {job_id}", 404)
    return success(status.model_dump(mode="json"), tool="jobs.status")


async def _admin_reload_universe_handler(_: AuthedKey = Depends(require_auth)):
    count = await universes.refresh("tracked_8500")
    return success(
        {"universe": "tracked_8500", "ticker_count": count},
        tool="admin.reload_universe",
    )


# ─────────────────────────── factory ───────────────────────────────────


def create_app() -> FastAPI:
    app = FastAPI(
        title="SimuAlpha Quant Tools",
        description=(
            "HTTP tool provider for OpenClaw. Cache-first data access "
            "backed by OpenBB; pattern backtesting backed by qlib."
        ),
        version="0.2.0",
    )

    @app.exception_handler(AuthError)
    async def _auth_error_handler(request: Request, exc: AuthError):  # noqa: ARG001
        return fail(exc.message, status_code=exc.status_code)

    @app.on_event("startup")
    async def _startup():
        # Best-effort initial snapshot + 15-minute refresher loop.
        try:
            await universes.refresh("tracked_8500")
        except Exception as exc:
            log.warning("initial universe load failed", extra={"err": str(exc)})
        universes.start_refresher()

    @app.on_event("shutdown")
    async def _shutdown():
        universes.stop_refresher()

    @app.get("/health")
    async def health() -> dict:
        snap = universes.snapshot("tracked_8500")
        return {
            "status": "ok",
            "service": "simualpha-quant-api",
            "tools": [t.name for t in TOOLS],
            "tracked_8500_count": len(snap.tickers),
            "tracked_8500_refreshed_at": snap.refreshed_at,
        }

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

    app.add_api_route(
        "/v1/jobs/{job_id}",
        _jobs_status_handler,
        methods=["GET"],
        name="jobs_status",
        summary="Poll the status of an async backtest job.",
    )
    app.add_api_route(
        "/admin/reload-universe",
        _admin_reload_universe_handler,
        methods=["POST"],
        name="admin_reload_universe",
        summary="Force-refresh the tracked_8500 universe snapshot.",
    )

    return app


app = create_app()
