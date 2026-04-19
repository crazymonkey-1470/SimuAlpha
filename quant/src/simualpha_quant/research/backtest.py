"""Backtest engine — given a pattern, compute forward-return stats.

For each (ticker, signal_date) the detector emits, we look up the
forward return at each requested horizon (months) using the qlib data
store. Stats aggregated across all signals.

Pure Python; no qlib expression DSL involvement. The qlib layer only
gives us OHLCV; everything else is pandas / numpy here.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Sequence

import numpy as np
import pandas as pd

from simualpha_quant.logging_config import get_logger
from simualpha_quant.research.patterns import PatternDef
from simualpha_quant.research.qlib_adapter import (
    ensure_universe_current,
    load_prices,
)
from simualpha_quant.schemas.backtest import (
    HorizonStats,
    SampleSignal,
    YearlyBreakdown,
    YearlyHorizonStats,
)

log = get_logger(__name__)


# ─────────────────────────── per-signal type ────────────────────────────


@dataclass(frozen=True)
class RawSignal:
    ticker: str
    signal_date: date
    signal_close: float
    forward_returns: dict[int, float | None]
    max_drawdown: dict[int, float | None]


# ─────────────────────────── forward-return computation ─────────────────


def _trading_days_for_months(months: int) -> int:
    # 21 trading days per month is the standard approximation.
    return int(round(months * 21))


def _forward_return_and_dd(
    close: pd.Series, signal_idx: int, horizon_days: int
) -> tuple[float | None, float | None]:
    end_idx = signal_idx + horizon_days
    if end_idx >= len(close):
        return None, None
    base = float(close.iloc[signal_idx])
    end = float(close.iloc[end_idx])
    if base <= 0:
        return None, None
    fwd = (end / base) - 1.0
    window = close.iloc[signal_idx : end_idx + 1].astype(float).to_numpy()
    running_max = np.maximum.accumulate(window)
    dd = (window - running_max) / running_max
    max_dd = float(np.min(dd))  # most-negative
    return fwd, max_dd


# ─────────────────────────── single-ticker run ──────────────────────────


def _evaluate_ticker(
    ticker: str,
    prices: pd.DataFrame,
    pattern: PatternDef,
    params: dict | None,
    horizons_months: Sequence[int],
) -> list[RawSignal]:
    if prices.empty or "close" not in prices.columns:
        return []
    signal_dates = pattern.detect(prices, params)
    if not signal_dates:
        return []

    close = prices["close"]
    horizons_days = {h: _trading_days_for_months(h) for h in horizons_months}

    out: list[RawSignal] = []
    for d in signal_dates:
        try:
            idx = int(close.index.get_indexer([pd.Timestamp(d)])[0])
        except Exception:
            continue
        if idx < 0:
            continue
        fwd: dict[int, float | None] = {}
        dds: dict[int, float | None] = {}
        for h in horizons_months:
            f, dd = _forward_return_and_dd(close, idx, horizons_days[h])
            fwd[h] = f
            dds[h] = dd
        out.append(
            RawSignal(
                ticker=ticker,
                signal_date=d,
                signal_close=float(close.iloc[idx]),
                forward_returns=fwd,
                max_drawdown=dds,
            )
        )
    return out


# ─────────────────────────── aggregation ────────────────────────────────


def _percentile(values: list[float], q: float) -> float:
    if not values:
        return float("nan")
    return float(np.percentile(np.asarray(values, dtype=float), q))


def _aggregate_horizon(signals: list[RawSignal], horizon: int) -> HorizonStats:
    rets = [s.forward_returns[horizon] for s in signals if s.forward_returns.get(horizon) is not None]
    dds = [s.max_drawdown[horizon] for s in signals if s.max_drawdown.get(horizon) is not None]
    n = len(rets)
    if n == 0:
        return HorizonStats(
            horizon_months=horizon,
            sample_size=0,
            hit_rate=0.0,
            median_return=0.0,
            p25_return=0.0,
            p75_return=0.0,
            avg_max_drawdown=0.0,
        )
    hits = sum(1 for r in rets if r > 0.0)
    return HorizonStats(
        horizon_months=horizon,
        sample_size=n,
        hit_rate=hits / n,
        median_return=float(statistics.median(rets)),
        p25_return=_percentile(rets, 25),
        p75_return=_percentile(rets, 75),
        avg_max_drawdown=float(statistics.fmean(dds)) if dds else 0.0,
    )


def _aggregate_per_year(signals: list[RawSignal], horizon: int) -> YearlyBreakdown:
    by_year: dict[int, list[float]] = {}
    for s in signals:
        v = s.forward_returns.get(horizon)
        if v is None:
            continue
        by_year.setdefault(s.signal_date.year, []).append(v)
    rows = []
    for y in sorted(by_year):
        rets = by_year[y]
        if not rets:
            continue
        hits = sum(1 for r in rets if r > 0)
        rows.append(
            YearlyHorizonStats(
                year=y,
                sample_size=len(rets),
                hit_rate=hits / len(rets),
                median_return=float(statistics.median(rets)),
            )
        )
    return YearlyBreakdown(horizon_months=horizon, by_year=rows)


# ─────────────────────────── public engine API ──────────────────────────


@dataclass(frozen=True)
class BacktestEngineResult:
    """Inputs the tool layer turns into a BacktestPatternResponse."""
    universe_resolved: int
    signals: list[RawSignal]
    stats: list[HorizonStats]
    per_year_breakdown: list[YearlyBreakdown] | None
    sample_signals: list[SampleSignal]


def _sample_signals(signals: list[RawSignal], n: int) -> list[SampleSignal]:
    if n <= 0 or not signals:
        return []
    # Deterministic stratified sample: take the first signal per ticker,
    # then fill with the most recent signals overall.
    seen: set[str] = set()
    chosen: list[RawSignal] = []
    for s in signals:
        if s.ticker not in seen:
            chosen.append(s)
            seen.add(s.ticker)
        if len(chosen) >= n:
            break
    if len(chosen) < n:
        recent = sorted(signals, key=lambda s: s.signal_date, reverse=True)
        for s in recent:
            if s in chosen:
                continue
            chosen.append(s)
            if len(chosen) >= n:
                break
    chosen.sort(key=lambda s: (s.ticker, s.signal_date))
    return [
        SampleSignal(
            ticker=s.ticker,
            signal_date=s.signal_date,
            forward_returns={h: (v if v is not None else 0.0) for h, v in s.forward_returns.items()},
        )
        for s in chosen
    ]


def run_backtest(
    pattern: PatternDef,
    tickers: Sequence[str],
    start: date,
    end: date,
    horizons_months: Sequence[int],
    *,
    params: dict | None = None,
    qlib_root: Path | str | None = None,
    include_per_year: bool = True,
    sample_size: int = 10,
    fetcher: Callable | None = None,
    price_loader: Callable[[str, date, date], pd.DataFrame] | None = None,
) -> BacktestEngineResult:
    """Run the pattern across tickers and aggregate forward-return stats.

    ``price_loader`` (test hook) takes precedence over the qlib store.
    Production callers leave it ``None`` so the qlib layer is used.
    """
    if not tickers:
        return BacktestEngineResult(0, [], [], None, [])

    if price_loader is None:
        ensure_universe_current(qlib_root, tickers, end, fetcher=fetcher)
        loader = lambda t, s, e: load_prices(qlib_root, t, s, e)  # noqa: E731
    else:
        loader = price_loader

    signals: list[RawSignal] = []
    for t in {t.upper() for t in tickers}:
        try:
            df = loader(t, start, end)
        except Exception as exc:
            log.warning("price load failed", extra={"ticker": t, "err": str(exc)})
            continue
        if df.empty:
            continue
        signals.extend(_evaluate_ticker(t, df, pattern, params, horizons_months))

    signals.sort(key=lambda s: (s.ticker, s.signal_date))

    stats = [_aggregate_horizon(signals, h) for h in sorted(set(horizons_months))]
    per_year = (
        [_aggregate_per_year(signals, h) for h in sorted(set(horizons_months))]
        if include_per_year
        else None
    )
    samples = _sample_signals(signals, sample_size)

    log.info(
        "backtest done",
        extra={
            "pattern": pattern.name,
            "tickers": len(tickers),
            "signals": len(signals),
            "horizons": list(horizons_months),
        },
    )
    return BacktestEngineResult(
        universe_resolved=len(tickers),
        signals=signals,
        stats=stats,
        per_year_breakdown=per_year,
        sample_signals=samples,
    )
