"""Trade-record + per-horizon outcome computation.

Kept decoupled from the execution engine so the aggregation pipeline
can be unit-tested in isolation. The pure-Python equity backtester in
``execution/equity_backtester.py`` populates ``TradeRecord`` rows;
this module consumes them.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Sequence

import numpy as np

from simualpha_quant.schemas.simulate import (
    EquityOHLC,
    HorizonOutcome,
    SimulationSummary,
)


# ─────────────────────────── fill-level records ──────────────────────
#
# Per-tranche and per-exit-leg fills are logged on TradeRecord so
# OpenClaw (or a human debugger) can trace exactly which tranches
# filled, at what price, via which fill mechanic, and when. This
# replaces the less-structured ``tranche_entries`` field of the
# freqtrade-era TradeRecord.


FillType = Literal[
    "signal_close",    # filled at signal bar's close (tranche 1 default)
    "intraday_touch",  # later bar's range covered the trigger price
    "gap_fill",        # bar opened past the trigger, filled at bar open
]


FillSide = Literal["entry", "exit"]


ExitReason = Literal[
    "take_profit",     # one of the take_profit legs hit
    "stop_loss",       # stop-loss triggered
    "time_stop",       # time_stop_days exceeded
    "end_of_data",     # ran off the end of the date range still open
]


@dataclass
class FillRecord:
    """One tranche entry OR one exit leg, recorded at fill time.

    Dollar math kept explicit (price + shares + notional) so the
    aggregation layer doesn't need to redo sizing arithmetic when
    computing pct_return.
    """
    side: FillSide
    date: date
    price: float
    shares: float
    notional: float           # shares * price; gross, pre-fee
    fee: float                # absolute dollars deducted from cash
    slippage_applied_bps: float
    fill_type: FillType
    # Cross-ref back to the spec — for entries this is the tranche
    # index (0-based); for exits it's the take_profit leg index, or
    # None for stop_loss / time_stop / end_of_data exits.
    leg_index: int | None = None
    exit_reason: ExitReason | None = None


@dataclass
class TradeContext:
    """Per-trade snapshot the engine captures at signal time.

    Threaded into chart annotations so each sample chart shows the
    full per-trade reasoning: Wave 1 anchors, resolved TP / stop
    prices, and any confluence zone. Optional — None means 'not
    available' and the chart falls back to tranche-only annotations.
    """
    wave_1_start: tuple[date, float] | None = None       # (date, price)
    wave_1_top: tuple[date, float] | None = None
    wave_2_low: tuple[date, float] | None = None
    stop_loss_price: float | None = None
    take_profit_prices: list[tuple[float, str]] = field(default_factory=list)
    # list of (dollar price, label) pairs — label describes the leg
    # (e.g. "Wave 3 target 1.618").
    confluence_zone: tuple[float, float] | None = None   # (low, high) dollar


@dataclass
class TradeRecord:
    ticker: str
    entry_date: date
    exit_date: date | None
    entry_price: float        # volume-weighted avg entry across filled tranches
    exit_price: float | None  # volume-weighted avg exit across filled legs
    pct_return: float         # net of fees + slippage; negative = loss

    # Capital accounting (populated by the backtester; zero-defaults
    # keep existing fixtures / tests that construct bare TradeRecords
    # compatible).
    planned_capital: float = 0.0   # sizing decision at trade open
    filled_capital: float = 0.0    # sum of FillRecord.notional for entries

    # Granular fill log — the backtester writes one FillRecord per
    # tranche or exit leg. The legacy ``tranche_entries`` list is
    # derived from this for backward compatibility with existing
    # chart-annotation code.
    fills: list[FillRecord] = field(default_factory=list)

    # Legacy chart-annotation shape: list of (date, price,
    # pct_of_planned_position) for every FILLED entry tranche. Still
    # read by execution.chart_annotations.
    tranche_entries: list[tuple[date, float, float]] = field(default_factory=list)

    context: TradeContext | None = None

    @property
    def is_win(self) -> bool:
        return self.pct_return > 0.0

    @property
    def fill_ratio(self) -> float:
        """Fraction of planned capital that actually filled.

        0.0 → no tranche beyond #1 ever filled (rare edge case).
        1.0 → every tranche filled.
        In between → some deeper tranches never triggered before the
        position exited. OpenClaw inspects this to flag "the ladder
        didn't work" trades.
        """
        if self.planned_capital <= 0:
            return 0.0
        return min(self.filled_capital / self.planned_capital, 1.0)


# ─────────────────────────── summary stats ──────────────────────────


def summary_from_trades(trades: Sequence[TradeRecord], equity_close: Sequence[float]) -> SimulationSummary:
    if not trades:
        return SimulationSummary(
            total_trades=0, win_rate=0.0,
            avg_win_pct=0.0, avg_loss_pct=0.0,
            profit_factor=0.0, sharpe=0.0, sortino=0.0,
            max_drawdown_pct=0.0, calmar=0.0,
        )

    wins = [t.pct_return for t in trades if t.pct_return > 0]
    losses = [t.pct_return for t in trades if t.pct_return <= 0]
    total = len(trades)
    win_rate = len(wins) / total if total else 0.0
    avg_win = float(statistics.fmean(wins)) if wins else 0.0
    avg_loss = float(statistics.fmean(losses)) if losses else 0.0
    sum_wins = float(sum(wins))
    sum_losses = abs(float(sum(losses))) or 1e-9
    profit_factor = sum_wins / sum_losses if sum_losses else 0.0

    sharpe, sortino, max_dd_pct, calmar = _equity_metrics(equity_close)

    return SimulationSummary(
        total_trades=total,
        win_rate=win_rate,
        avg_win_pct=avg_win,
        avg_loss_pct=avg_loss,
        profit_factor=profit_factor,
        sharpe=sharpe,
        sortino=sortino,
        max_drawdown_pct=max_dd_pct,
        calmar=calmar,
    )


def _equity_metrics(equity_close: Sequence[float]) -> tuple[float, float, float, float]:
    if len(equity_close) < 2:
        return 0.0, 0.0, 0.0, 0.0
    arr = np.asarray(equity_close, dtype=float)
    rets = np.diff(arr) / arr[:-1]
    # Daily-return Sharpe / Sortino, annualized to 252.
    mean, std = float(np.mean(rets)), float(np.std(rets, ddof=1)) or 1e-9
    sharpe = (mean / std) * (252 ** 0.5)
    neg = rets[rets < 0]
    dstd = float(np.std(neg, ddof=1)) if len(neg) > 1 else std
    sortino = (mean / (dstd or 1e-9)) * (252 ** 0.5)

    # Max drawdown.
    running_max = np.maximum.accumulate(arr)
    dd = (arr - running_max) / running_max
    max_dd_pct = float(np.min(dd))

    # Calmar: annualized return / |max_dd|.
    years = max(len(arr) / 252.0, 1e-9)
    ann_ret = (arr[-1] / arr[0]) ** (1.0 / years) - 1.0
    calmar = ann_ret / abs(max_dd_pct) if max_dd_pct < 0 else 0.0
    return sharpe, sortino, max_dd_pct, calmar


# ─────────────────────────── per-horizon outcomes ────────────────────


def horizon_outcomes(trades: Sequence[TradeRecord], horizons_months: Sequence[int]) -> list[HorizonOutcome]:
    """Fraction of trades that closed positive within ``h`` months of entry.

    Trades still open at the horizon are excluded from that horizon's
    denominator (not counted as losses).
    """
    out: list[HorizonOutcome] = []
    for h in sorted(set(horizons_months)):
        reached = 0
        denom = 0
        cutoff_days = int(h * 30.4375)
        for t in trades:
            if t.exit_date is None:
                continue
            elapsed = (t.exit_date - t.entry_date).days
            if elapsed > cutoff_days:
                continue  # not closed within horizon
            denom += 1
            if t.pct_return > 0:
                reached += 1
        rate = (reached / denom) if denom else 0.0
        out.append(HorizonOutcome(horizon_months=h, reached_target_pct=rate))
    return out


# ─────────────────────────── equity curve bucketing ─────────────────


def downsample_equity_ohlc(
    dates: Sequence[date],
    equity: Sequence[float],
    *,
    max_points: int = 500,
) -> tuple[list[EquityOHLC], list[float], list[date]]:
    """Uniform-bucket downsample into ``EquityOHLC`` rows + a simple
    close-only series.

    Bucket close = last value in bucket (per Stage 4 decision).
    Bucket high / low = running max / min within the bucket.
    Bucket open = first value in bucket.
    """
    n = len(equity)
    if n == 0:
        return [], [], []
    if len(dates) != n:
        raise ValueError("dates and equity length mismatch")

    if n <= max_points:
        ohlc = [
            EquityOHLC(date=dates[i], open=float(equity[i]), high=float(equity[i]),
                       low=float(equity[i]), close=float(equity[i]))
            for i in range(n)
        ]
        return ohlc, [float(v) for v in equity], list(dates)

    step = n / max_points
    buckets: list[list[int]] = [[] for _ in range(max_points)]
    for i in range(n):
        b = min(int(i / step), max_points - 1)
        buckets[b].append(i)

    ohlc_out: list[EquityOHLC] = []
    close_out: list[float] = []
    date_out: list[date] = []
    for bucket in buckets:
        if not bucket:
            continue
        first, last = bucket[0], bucket[-1]
        vals = [float(equity[i]) for i in bucket]
        ohlc_out.append(
            EquityOHLC(
                date=dates[last],
                open=float(equity[first]),
                high=max(vals),
                low=min(vals),
                close=float(equity[last]),
            )
        )
        close_out.append(float(equity[last]))
        date_out.append(dates[last])
    return ohlc_out, close_out, date_out


# ─────────────────────────── sample selection ───────────────────────


def select_sample_trades(trades: Sequence[TradeRecord], n: int) -> list[TradeRecord]:
    """Pick up to ``n`` representative trades (deterministic).

    Strategy: first trade per ticker, then fill with the most recent
    remaining trades. Matches the backtest_pattern sampler in spirit.
    """
    if n <= 0 or not trades:
        return []
    seen: set[str] = set()
    chosen: list[TradeRecord] = []
    for t in trades:
        if t.ticker not in seen:
            chosen.append(t)
            seen.add(t.ticker)
        if len(chosen) >= n:
            break
    if len(chosen) < n:
        remaining = sorted(
            [t for t in trades if t not in chosen],
            key=lambda t: t.exit_date or date.min,
            reverse=True,
        )
        for t in remaining:
            chosen.append(t)
            if len(chosen) >= n:
                break
    chosen.sort(key=lambda t: (t.ticker, t.entry_date))
    return chosen
