"""Tool: simulate_strategy — cache-first full-strategy simulation.

Decision tree mirrors backtest_pattern:

1. Hash the request.
2. Look up Supabase ``simulation_results`` by hash. If present and
   not expired, return cached.
3. Otherwise run the engine, render charts (sync or async depending
   on ``chart_samples``), cache, return.

CONVENTIONS:
- Cross-tool chart rendering is ALWAYS an in-process function call to
  ``simualpha_quant.tools.render_chart.render_tli_chart`` — never HTTP,
  never MCP.
- freqtrade import is deferred into the simulate engine, not here.
- ``supabase`` import is lazy inside each cache / audit function.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Callable

from simualpha_quant.execution.chart_annotations import (
    TradeChartInputs,
    build_chart_request,
    inputs_from_context,
)
from simualpha_quant.execution.simulate import run_simulation
from simualpha_quant.execution.trade_log import TradeRecord
from simualpha_quant.logging_config import get_logger
from simualpha_quant.schemas.simulate import (
    SYNC_CHART_LIMIT,
    EquityOHLC,
    HorizonOutcome,
    SimulateStrategyRequest,
    SimulateStrategyResponse,
    TradeChart,
)

log = get_logger(__name__)

SCHEMA_VERSION = 1
DEFAULT_TTL_DAYS = 30


def spec_hash(req: SimulateStrategyRequest) -> str:
    payload = {
        "schema_version": SCHEMA_VERSION,
        "strategy": req.strategy.model_dump(mode="json"),
        "chart_samples": req.chart_samples,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


# ─────────────────────────── Supabase cache ──────────────────────────


def _cache_read(hash_: str, ttl_days: int = DEFAULT_TTL_DAYS) -> SimulateStrategyResponse | None:
    try:
        from simualpha_quant.supabase_client import get_client

        client = get_client()
        res = (
            client.table("simulation_results")
            .select("*")
            .eq("hash", hash_)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return None
        row = rows[0]
        computed_at = row.get("computed_at")
        if computed_at:
            try:
                dt = datetime.fromisoformat(str(computed_at).replace("Z", "+00:00"))
                if dt < datetime.now(tz=timezone.utc) - timedelta(days=ttl_days):
                    return None
            except ValueError:
                pass
        return SimulateStrategyResponse.model_validate(row["result"])
    except Exception as exc:
        log.warning("simulation_results read failed", extra={"hash": hash_, "err": str(exc)})
        return None


def _cache_write(hash_: str, req: SimulateStrategyRequest, resp: SimulateStrategyResponse) -> None:
    try:
        from simualpha_quant.supabase_client import get_client

        client = get_client()
        client.table("simulation_results").upsert(
            {
                "hash": hash_,
                "strategy_spec": req.strategy.model_dump(mode="json"),
                "result": resp.model_dump(mode="json"),
                "computed_at": resp.computed_at.isoformat(),
                "ttl_days": DEFAULT_TTL_DAYS,
            },
            on_conflict="hash",
        ).execute()
    except Exception as exc:
        log.warning("simulation_results write failed", extra={"hash": hash_, "err": str(exc)})


# ─────────────────────────── chart rendering ─────────────────────────


# Type alias for the in-process render_tli_chart fn. Tests override.
Renderer = Callable[..., object]


def _default_renderer():
    # Lazy same-process import. Not HTTP, not MCP.
    from simualpha_quant.tools.render_chart import render_tli_chart

    return render_tli_chart


def _render_sample_chart(trade: TradeRecord, renderer: Renderer) -> TradeChart:
    try:
        # Stage 4.5: pull the per-trade TradeContext the engine attached
        # (wave anchors, resolved TP prices, stop price, confluence zone)
        # so the rendered chart carries the full reasoning.
        req = build_chart_request(trade, inputs=inputs_from_context(trade.context))
        resp = renderer(req)
        return TradeChart(
            ticker=trade.ticker,
            entry_date=trade.entry_date,
            exit_date=trade.exit_date,
            entry_price=trade.entry_price,
            exit_price=trade.exit_price,
            outcome_pct=trade.pct_return,
            chart_url=getattr(resp, "url", None),
            chart_status="rendered" if getattr(resp, "url", None) else "failed",
        )
    except Exception as exc:
        log.warning("chart render failed", extra={"ticker": trade.ticker, "err": str(exc)})
        return TradeChart(
            ticker=trade.ticker,
            entry_date=trade.entry_date,
            exit_date=trade.exit_date,
            entry_price=trade.entry_price,
            exit_price=trade.exit_price,
            outcome_pct=trade.pct_return,
            chart_url=None,
            chart_status="failed",
        )


def _pending_sample(trade: TradeRecord) -> TradeChart:
    return TradeChart(
        ticker=trade.ticker,
        entry_date=trade.entry_date,
        exit_date=trade.exit_date,
        entry_price=trade.entry_price,
        exit_price=trade.exit_price,
        outcome_pct=trade.pct_return,
        chart_url=None,
        chart_status="pending",
    )


# ─────────────────────────── async charts job ──────────────────────


def _submit_charts_job(
    sim_hash: str,
    trades: list[TradeRecord],
    renderer: Renderer,
) -> str:
    """Queue a charts-rendering job. Reuses research.jobs registry.

    The job mutates the cached SimulateStrategyResponse in
    ``simulation_results`` as each chart lands. Polling clients see
    progressive updates.
    """
    from simualpha_quant.research import jobs as jobs_mod

    job_id = jobs_mod.submit({"kind": "charts", "sim_hash": sim_hash, "count": len(trades)})

    async def _runner():
        _render_charts_and_patch_cache(sim_hash, trades, renderer)

    import asyncio

    asyncio.create_task(jobs_mod.run_async(job_id, lambda: asyncio.to_thread(
        _render_charts_and_patch_cache, sim_hash, trades, renderer
    )))
    return job_id


def _render_charts_and_patch_cache(
    sim_hash: str,
    trades: list[TradeRecord],
    renderer: Renderer,
):
    rendered: list[TradeChart] = []
    for t in trades:
        rendered.append(_render_sample_chart(t, renderer))
    _patch_cached_trade_log(sim_hash, rendered)


def _patch_cached_trade_log(sim_hash: str, rendered: list[TradeChart]) -> None:
    try:
        from simualpha_quant.supabase_client import get_client

        client = get_client()
        res = (
            client.table("simulation_results")
            .select("result")
            .eq("hash", sim_hash)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return
        current = rows[0]["result"]
        current["trade_log_sample"] = [c.model_dump(mode="json") for c in rendered]
        client.table("simulation_results").update(
            {"result": current}
        ).eq("hash", sim_hash).execute()
    except Exception as exc:
        log.warning("charts cache patch failed", extra={"hash": sim_hash, "err": str(exc)})


# ─────────────────────────── public tool ────────────────────────────


def simulate_strategy(
    req: SimulateStrategyRequest,
    *,
    renderer: Renderer | None = None,
) -> SimulateStrategyResponse:
    h = spec_hash(req)
    log.info(
        "tool simulate_strategy",
        extra={
            "hash": h,
            "pattern": req.strategy.entry.pattern_name,
            "custom": req.strategy.entry.custom_expression is not None,
            "chart_samples": req.chart_samples,
        },
    )

    cached = _cache_read(h)
    if cached is not None:
        return cached.model_copy(update={"cached": True, "hash": h})

    engine = run_simulation(req.strategy, chart_samples=req.chart_samples)

    render_fn = renderer or _default_renderer()

    charts_job_id: str | None = None
    if req.chart_samples <= SYNC_CHART_LIMIT:
        trade_charts = [_render_sample_chart(t, render_fn) for t in engine.sample_trades]
    else:
        trade_charts = [_pending_sample(t) for t in engine.sample_trades]
        # Async path — cache the pending response first, then kick off
        # the job which will patch the cache as charts land.
        pass  # charts_job_id assigned after the response is cached

    resp = SimulateStrategyResponse(
        summary_stats=engine.summary,
        per_horizon_outcomes=engine.per_horizon_outcomes,
        equity_curve=engine.equity_curve_close,
        equity_curve_dates=engine.equity_curve_dates,
        equity_curve_ohlc=engine.equity_curve_ohlc,
        trade_log_sample=trade_charts,
        charts_job_id=None,
        cached=False,
        hash=h,
        computed_at=datetime.now(tz=timezone.utc),
    )
    _cache_write(h, req, resp)

    if req.chart_samples > SYNC_CHART_LIMIT and engine.sample_trades:
        try:
            charts_job_id = _submit_charts_job(h, engine.sample_trades, render_fn)
        except Exception as exc:
            log.warning("charts job submit failed", extra={"err": str(exc)})
            charts_job_id = None
        resp = resp.model_copy(update={"charts_job_id": charts_job_id})
        # Re-cache with the job id attached so the first polling
        # response already shows the pending job.
        _cache_write(h, req, resp)

    return resp
