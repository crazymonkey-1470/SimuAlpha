"""Capture per-trade TradeContext at signal time.

Runs the same price-rule resolver the IStrategy uses, but inline and
eager — so each trade's sample-chart carries the resolved Wave 1
anchors + TP + stop prices + confluence-zone band that the simulator
would have used at that bar.

Pure-Python; no freqtrade dependency. Called from ``simulate.py``
after the engine hands back the trade list — the context is rebuilt
from the entry bar's ResolveContext. Separating this from the hot-path
keeps freqtrade's IStrategy callbacks cheap.
"""

from __future__ import annotations

from datetime import date
from typing import Callable

import pandas as pd

from simualpha_quant.execution.price_rules import (
    ResolveContext,
    UnresolvablePriceRule,
    resolve,
)
from simualpha_quant.execution.trade_log import TradeContext, TradeRecord
from simualpha_quant.research.waves import (
    Pivot,
    detect_pivots,
    find_developing_wave_2,
    sensitivity_for_timeframe,
)
from simualpha_quant.schemas.strategy import ExitLeg, StrategySpec
from simualpha_quant.tli_constants import (
    CONFLUENCE_ZONE_TOLERANCE,
    FIB_500,
    FIB_618,
)


def _prices_for_signal_bar(prices: pd.DataFrame, signal_date: date) -> int | None:
    """Return the integer index of the bar at or just before signal_date."""
    if prices.empty:
        return None
    ts = pd.Timestamp(signal_date)
    mask = prices.index <= ts
    if not bool(mask.any()):
        return None
    return int(prices.index.get_indexer([prices.index[mask][-1]])[0])


def _confluence_band(w1_start_price: float, w1_top_price: float) -> tuple[float, float]:
    """Price band between the 0.5 and 0.618 retracements of Wave 1."""
    height = w1_top_price - w1_start_price
    top = w1_top_price - FIB_500 * height
    bot = w1_top_price - FIB_618 * height
    lo, hi = sorted([top, bot])
    return (lo, hi)


def build_trade_context(
    spec: StrategySpec,
    trade: TradeRecord,
    prices: pd.DataFrame,
) -> TradeContext:
    """Build a TradeContext for a single trade.

    Args:
        spec: the StrategySpec used to generate this trade.
        trade: the TradeRecord produced by the simulator.
        prices: the daily OHLCV DataFrame for this ticker
            (DatetimeIndex). Already aligned to the full backtest
            window — the signal bar is located inside it.

    Missing data (unresolvable rules, no Wave 1 yet, etc.) does not
    raise — the corresponding TradeContext field stays None and the
    chart builder gracefully omits that annotation.
    """
    idx = _prices_for_signal_bar(prices, trade.entry_date)
    if idx is None:
        return TradeContext()

    sensitivity = sensitivity_for_timeframe("intermediate")
    pivots: list[Pivot] = detect_pivots(prices["close"], sensitivity=sensitivity)

    ctx = ResolveContext(
        prices=prices,
        current_index=idx,
        signal_index=idx,
        pivots=pivots,
    )

    # Wave anchors — use the most recent developing-W2 triple visible
    # at the signal bar. Same logic the runtime resolver uses.
    wave_1_start: tuple[date, float] | None = None
    wave_1_top: tuple[date, float] | None = None
    wave_2_low: tuple[date, float] | None = None
    dev = find_developing_wave_2([p for p in pivots if p.index <= idx])
    if dev:
        w1s, w1t, w2l = dev[-1]
        wave_1_start = (w1s.date, w1s.price)
        wave_1_top = (w1t.date, w1t.price)
        wave_2_low = (w2l.date, w2l.price)

    # Confluence-zone band — only when Wave 1 anchors known.
    confluence_zone: tuple[float, float] | None = None
    if wave_1_start is not None and wave_1_top is not None:
        confluence_zone = _confluence_band(wave_1_start[1], wave_1_top[1])

    # Stop-loss price from the spec.
    stop_loss_price: float | None
    try:
        stop_loss_price = float(resolve(spec.exit.stop_loss.price_rule, ctx))
    except UnresolvablePriceRule:
        stop_loss_price = None

    # Take-profit prices for each spec leg — in spec order.
    tp_prices: list[tuple[float, str]] = []
    for i, leg in enumerate(spec.exit.take_profit):
        try:
            price = float(resolve(leg.price_rule, ctx))
        except UnresolvablePriceRule:
            continue
        tp_prices.append((price, _leg_label(i, leg)))

    return TradeContext(
        wave_1_start=wave_1_start,
        wave_1_top=wave_1_top,
        wave_2_low=wave_2_low,
        stop_loss_price=stop_loss_price,
        take_profit_prices=tp_prices,
        confluence_zone=confluence_zone,
    )


def _leg_label(index: int, leg: ExitLeg) -> str:
    r = leg.price_rule
    pct = int(round(leg.pct_of_position * 100))
    if r.type == "at_fib":
        return f"TP{index + 1} · {pct}% · {r.level:.3f} fib"
    if r.type == "at_price":
        return f"TP{index + 1} · {pct}% · ${r.price:.2f}"
    if r.type == "at_ma":
        return f"TP{index + 1} · {pct}% · {r.period}{r.freq[0].upper()}MA"
    return f"TP{index + 1} · {pct}%"


# Convenience for simulate.py: enrich a whole list of trades given a
# per-ticker price loader.
def enrich_trades_with_context(
    spec: StrategySpec,
    trades: list[TradeRecord],
    price_loader: Callable[[str], pd.DataFrame],
) -> None:
    """Mutate each TradeRecord in place, attaching its TradeContext.

    ``price_loader`` is called once per unique ticker and the result
    reused across that ticker's trades.
    """
    by_ticker: dict[str, pd.DataFrame] = {}
    for t in trades:
        if t.ticker not in by_ticker:
            try:
                by_ticker[t.ticker] = price_loader(t.ticker)
            except Exception:
                by_ticker[t.ticker] = pd.DataFrame()
    for t in trades:
        prices = by_ticker.get(t.ticker)
        if prices is None or prices.empty:
            continue
        t.context = build_trade_context(spec, t, prices)
