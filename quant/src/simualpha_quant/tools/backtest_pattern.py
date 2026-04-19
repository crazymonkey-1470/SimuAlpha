"""Tool: backtest_pattern — cache-first pattern validation on historical data.

Decision tree (mirrors render_tli_chart's cache-first pattern):

1. Hash the request.
2. Look up Supabase ``pattern_stats_cache`` by hash. If present and
   not expired (``ttl_days``), return cached result with ``cached=true``.
3. Otherwise: resolve universe → run backtest engine → aggregate
   stats → cache the result → return.

The HTTP layer on top of this function decides whether the request
should go async (either pre-emptively if cost > SYNC_COST_LIMIT, or
mid-flight if the sync watchdog trips).
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

from simualpha_quant.logging_config import get_logger
from simualpha_quant.research import custom_expression, universes
from simualpha_quant.research.backtest import run_backtest
from simualpha_quant.research.patterns import PATTERNS, PatternDef, by_name
from simualpha_quant.schemas.backtest import (
    BacktestPatternRequest,
    BacktestPatternResponse,
)

log = get_logger(__name__)

SCHEMA_VERSION = 1
DEFAULT_TTL_DAYS = 30


def spec_hash(req: BacktestPatternRequest) -> str:
    payload = {
        "schema_version": SCHEMA_VERSION,
        "pattern_name": req.pattern_name,
        "custom_expression": req.custom_expression,
        "universe_spec": req.universe_spec.model_dump(mode="json"),
        "date_range": {
            "start": req.date_range.start.isoformat(),
            "end": req.date_range.end.isoformat(),
        },
        "horizons": sorted(req.horizons),
        "params": req.params or {},
        "include_per_year": req.include_per_year,
        "sample_size": req.sample_size,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


# ─────────────────────────── cache (Supabase) ──────────────────────────


def _cache_read(hash_: str, ttl_days: int = DEFAULT_TTL_DAYS) -> BacktestPatternResponse | None:
    try:
        from simualpha_quant.supabase_client import get_client  # lazy

        client = get_client()
        res = (
            client.table("pattern_stats_cache")
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
        return BacktestPatternResponse.model_validate(row["result"])
    except Exception as exc:
        log.warning("pattern_stats_cache read failed", extra={"hash": hash_, "err": str(exc)})
        return None


def _cache_write(hash_: str, req: BacktestPatternRequest, resp: BacktestPatternResponse) -> None:
    try:
        from simualpha_quant.supabase_client import get_client  # lazy

        client = get_client()
        client.table("pattern_stats_cache").upsert(
            {
                "hash": hash_,
                "pattern_name": req.pattern_name,
                "request_payload": req.model_dump(mode="json"),
                "result": resp.model_dump(mode="json"),
                "computed_at": resp.computed_at.isoformat(),
                "ttl_days": DEFAULT_TTL_DAYS,
            },
            on_conflict="hash",
        ).execute()
    except Exception as exc:
        log.warning("pattern_stats_cache write failed", extra={"hash": hash_, "err": str(exc)})


def _record_signals(pattern_name: str, resp: BacktestPatternResponse, req: BacktestPatternRequest) -> None:
    """Append-only audit of detected signals into pattern_signals."""
    if not resp.sample_signals:
        return
    try:
        from simualpha_quant.supabase_client import get_client  # lazy

        client = get_client()
        rows = [
            {
                "pattern_name": pattern_name,
                "ticker": s.ticker,
                "signal_date": s.signal_date.isoformat(),
                "params": req.params or {},
                "forward_returns": {str(k): v for k, v in s.forward_returns.items()},
            }
            for s in resp.sample_signals
        ]
        client.table("pattern_signals").upsert(
            rows, on_conflict="pattern_name,ticker,signal_date"
        ).execute()
    except Exception as exc:
        log.warning("pattern_signals write failed", extra={"err": str(exc)})


# ─────────────────────────── pattern adaptation ─────────────────────────


def _pattern_from_request(req: BacktestPatternRequest) -> PatternDef:
    """Return a PatternDef for either a named pattern or a custom DSL."""
    if req.pattern_name:
        if req.pattern_name not in PATTERNS:
            raise KeyError(
                f"unknown pattern {req.pattern_name!r}. Known: {sorted(PATTERNS)}"
            )
        return by_name(req.pattern_name)
    assert req.custom_expression is not None  # XOR-enforced by Pydantic

    expr = req.custom_expression
    custom_expression.validate(expr)

    def detect(prices, params=None):  # noqa: ARG001 — params unused for DSL
        return custom_expression.evaluate_dates(expr, prices)

    return PatternDef(
        name="custom",
        description="Custom DSL expression (see docs/custom-expression-dsl.md).",
        default_params={},
        detect=detect,
    )


# ─────────────────────────── public tool ────────────────────────────────


def backtest_pattern(req: BacktestPatternRequest) -> BacktestPatternResponse:
    h = spec_hash(req)
    log.info(
        "tool backtest_pattern",
        extra={
            "hash": h,
            "pattern": req.pattern_name,
            "custom": req.custom_expression is not None,
        },
    )

    cached = _cache_read(h)
    if cached is not None:
        return cached.model_copy(update={"cached": True, "hash": h})

    tickers = universes.resolve(req.universe_spec)
    pattern = _pattern_from_request(req)

    engine = run_backtest(
        pattern=pattern,
        tickers=tickers,
        start=req.date_range.start,
        end=req.date_range.end,
        horizons_months=req.horizons,
        params=req.params,
        include_per_year=req.include_per_year,
        sample_size=req.sample_size,
    )

    resp = BacktestPatternResponse(
        pattern_name=req.pattern_name,
        universe_resolved=len(tickers),
        signal_count=len(engine.signals),
        stats=engine.stats,
        per_year_breakdown=engine.per_year_breakdown,
        sample_signals=engine.sample_signals,
        cached=False,
        hash=h,
        computed_at=datetime.now(tz=timezone.utc),
    )

    _cache_write(h, req, resp)
    _record_signals(req.pattern_name or "custom", resp, req)

    return resp
