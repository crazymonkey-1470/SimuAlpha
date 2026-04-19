"""Simulation engine — glue around freqtrade's ``Backtesting`` class.

Responsibilities:

1. Resolve the universe, ensure the qlib store is current through
   ``spec.date_range.end``.
2. Build a freqtrade config dict, an in-process data provider, and a
   dynamically-built ``IStrategy`` subclass (all in
   ``freqtrade_adapter``).
3. Invoke freqtrade's ``Backtesting`` engine.
4. Normalize freqtrade's output into ``TradeRecord`` rows +
   equity-curve series.
5. Compute ``SimulationSummary`` + ``HorizonOutcome`` +
   downsampled OHLC equity buckets.
6. Render charts for up to ``chart_samples`` trades (sync / async path
   driven by a caller-supplied callback).

The freqtrade-specific pieces are behind a narrow helper so tests can
substitute a pure-Python simulator when ``freqtrade`` isn't installed.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Iterable, Sequence

import pandas as pd

from simualpha_quant.execution.freqtrade_adapter import (
    EquityOHLCStore,
    build_config,
    build_strategy_class,
    make_data_provider,
    register_dynamic_strategy,
)
from simualpha_quant.execution.trade_context import enrich_trades_with_context
from simualpha_quant.execution.trade_log import (
    TradeRecord,
    downsample_equity_ohlc,
    horizon_outcomes,
    select_sample_trades,
    summary_from_trades,
)
from simualpha_quant.logging_config import get_logger
from simualpha_quant.research import universes
from simualpha_quant.research.qlib_adapter import ensure_universe_current
from simualpha_quant.schemas.simulate import (
    EquityOHLC,
    HorizonOutcome,
    SimulationSummary,
)
from simualpha_quant.schemas.strategy import StrategySpec

log = get_logger(__name__)


# ─────────────────────────── errors ─────────────────────────────────


class SimulationError(RuntimeError):
    """Raised when the simulation could not run to completion.

    Distinct from "simulation ran, produced zero trades" — that
    returns a normal ``SimulationEngineResult`` with an empty trade
    list. A ``SimulationError`` means freqtrade (or an upstream step)
    failed to initialize or raised mid-run.

    Carries machine-readable ``error_type`` so the tool layer can
    surface it in the HTTP response.
    """

    def __init__(self, error_type: str, detail: str) -> None:
        super().__init__(f"{error_type}: {detail}")
        self.error_type = error_type
        self.detail = detail


# ─────────────────────────── result type ────────────────────────────


@dataclass
class SimulationEngineResult:
    trades: list[TradeRecord]
    summary: SimulationSummary
    per_horizon_outcomes: list[HorizonOutcome]
    equity_curve_ohlc: list[EquityOHLC]
    equity_curve_close: list[float]
    equity_curve_dates: list[date]
    sample_trades: list[TradeRecord] = field(default_factory=list)


# ─────────────────────────── entry point ────────────────────────────


def run_simulation(
    spec: StrategySpec,
    *,
    qlib_root: Path | str | None = None,
    fetcher: Callable | None = None,
    price_loader: Callable[[str, date, date], pd.DataFrame] | None = None,
    chart_samples: int = 5,
    synthetic_simulator: Callable[[StrategySpec, EquityOHLCStore], tuple[list[TradeRecord], list[tuple[date, float]]]] | None = None,
) -> SimulationEngineResult:
    """Run the simulator and return normalized results.

    Args:
        spec: fully-validated StrategySpec.
        qlib_root: qlib data directory.
        fetcher: optional price fetcher for ensure_universe_current.
        price_loader: test hook — bypasses the qlib store.
        chart_samples: number of sample trades to surface.
        synthetic_simulator: test hook. When provided, replaces the
            freqtrade backtest entirely with a pure-Python callable
            returning (trades, equity_curve_points). Lets unit tests
            verify the aggregation / reporting pipeline without
            installing freqtrade.
    """
    tickers = universes.resolve(spec.universe_spec)
    store = EquityOHLCStore(qlib_root=qlib_root, custom_loader=price_loader)

    if synthetic_simulator is not None:
        trades, equity_points = synthetic_simulator(spec, store)
    else:
        trades, equity_points = _run_freqtrade(spec, store, fetcher)

    # Stage 4.5 — attach per-trade TradeContext so sample charts get
    # the full reasoning (Wave anchors, TP prices, stop, zone).
    if trades:
        try:
            enrich_trades_with_context(
                spec,
                trades,
                price_loader=lambda ticker: store.load(
                    ticker, spec.date_range.start, spec.date_range.end
                ),
            )
        except Exception as exc:
            log.warning("trade-context enrichment failed", extra={"err": str(exc)})

    equity_dates = [p[0] for p in equity_points]
    equity_closes = [p[1] for p in equity_points]

    ohlc, closes, dates = downsample_equity_ohlc(equity_dates, equity_closes)
    summary = summary_from_trades(trades, closes)
    horizons = horizon_outcomes(trades, spec.horizons)
    samples = select_sample_trades(trades, chart_samples)

    log.info(
        "simulation done",
        extra={
            "tickers": len(tickers),
            "trades": len(trades),
            "horizons": list(spec.horizons),
            "chart_samples": chart_samples,
        },
    )

    return SimulationEngineResult(
        trades=trades,
        summary=summary,
        per_horizon_outcomes=horizons,
        equity_curve_ohlc=ohlc,
        equity_curve_close=closes,
        equity_curve_dates=dates,
        sample_trades=samples,
    )


# ─────────────────────────── freqtrade driver ───────────────────────


def _run_freqtrade(
    spec: StrategySpec,
    store: EquityOHLCStore,
    fetcher: Callable | None,
) -> tuple[list[TradeRecord], list[tuple[date, float]]]:
    """Invoke freqtrade's Backtesting. Lazy imports freqtrade.

    Stage 4 note: this is the version-sensitive surface. If freqtrade
    is upgraded past 2024.11, verify the import paths and the trade-
    output DataFrame schema we parse below.
    """
    # Make sure the qlib store has everything we need.
    tickers = universes.resolve(spec.universe_spec)
    if store.custom_loader is None:
        ensure_universe_current(store.qlib_root, tickers, spec.date_range.end, fetcher=fetcher)

    # Lazy imports.
    import tempfile

    from freqtrade.configuration import Configuration
    from freqtrade.optimize.backtesting import Backtesting

    config = build_config(spec)
    state: dict = {}
    StrategyCls = build_strategy_class(spec, runtime_state=state)
    provider = make_data_provider(
        config,
        store,
        spec.date_range.start,
        spec.date_range.end,
    )

    # Freqtrade 2026.x Configuration.from_files requires a user_data
    # directory to exist (it rejects missing paths rather than creating
    # them). We hand it an ephemeral tempdir so no on-disk side effects
    # leak into the repo. Deleted via context manager when we're done.
    with tempfile.TemporaryDirectory(prefix="simualpha_ft_") as user_data:
        import os as _os
        for sub in ("data", "logs", "strategies", "backtest_results", "hyperopt_results"):
            _os.makedirs(_os.path.join(user_data, sub), exist_ok=True)
        config.setdefault("user_data_dir", user_data)

        try:
            ft_config = Configuration.from_files([])
        except Exception as exc:
            log.warning("freqtrade Configuration.from_files failed", extra={"err": str(exc)})
            ft_config = {}
        if isinstance(ft_config, dict):
            ft_config.update(config)
            ft_config.setdefault("user_data_dir", user_data)

        # freqtrade 2026.3's Backtesting.__init__ resolves the
        # strategy from config["strategy"] via filesystem discovery.
        # register_dynamic_strategy installs a scoped monkey-patch on
        # StrategyResolver._load_strategy that returns our closure-
        # based StrategyCls by name. The patch is reverted on exit
        # whether init succeeds or raises.
        try:
            with register_dynamic_strategy(StrategyCls):
                backtesting = Backtesting(ft_config)
        except Exception as exc:
            log.exception("freqtrade Backtesting init failed", extra={"err": str(exc)})
            raise SimulationError(
                "freqtrade_init_failure",
                f"{type(exc).__name__}: {exc}",
            ) from exc
        backtesting.dataprovider = provider  # type: ignore[attr-defined]
        try:
            backtesting.start()
        except Exception as exc:
            log.exception("freqtrade backtesting raised", extra={"err": str(exc)})
            raise SimulationError(
                "freqtrade_runtime_failure",
                f"{type(exc).__name__}: {exc}",
            ) from exc

        results_payload = getattr(backtesting, "results", {}) or {}
        first_strategy = next(iter(results_payload.values()), {}) if results_payload else {}
        trades_df = first_strategy.get("results") if first_strategy else None
        if trades_df is None:
            trades_df = pd.DataFrame()
        equity_df = first_strategy.get("equity_curve") if first_strategy else None
        if equity_df is None:
            equity_df = pd.DataFrame()

        trades = _trades_from_freqtrade(trades_df)
        equity_points = _equity_from_freqtrade(equity_df, spec.initial_capital)
        return trades, equity_points


def _trades_from_freqtrade(df: pd.DataFrame) -> list[TradeRecord]:
    if df is None or df.empty:
        return []
    out: list[TradeRecord] = []
    for _, row in df.iterrows():
        open_date = row.get("open_date")
        close_date = row.get("close_date")
        if pd.isna(open_date):
            continue
        out.append(
            TradeRecord(
                ticker=str(row.get("pair", "")).split("/", 1)[0].upper(),
                entry_date=pd.Timestamp(open_date).date(),
                exit_date=pd.Timestamp(close_date).date() if pd.notna(close_date) else None,
                entry_price=float(row.get("open_rate", 0.0)),
                exit_price=float(row.get("close_rate")) if pd.notna(row.get("close_rate")) else None,
                pct_return=float(row.get("profit_ratio", 0.0)),
            )
        )
    return out


def _equity_from_freqtrade(df: pd.DataFrame, initial_capital: float) -> list[tuple[date, float]]:
    if df is None or df.empty:
        return []
    points: list[tuple[date, float]] = []
    for _, row in df.iterrows():
        d = row.get("date") or row.get("time")
        if pd.isna(d):
            continue
        equity = float(row.get("equity", row.get("balance", initial_capital)))
        points.append((pd.Timestamp(d).date(), equity))
    return points
