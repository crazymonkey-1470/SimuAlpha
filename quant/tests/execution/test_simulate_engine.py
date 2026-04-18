"""Simulation engine — using the synthetic_simulator test hook so we
don't require freqtrade to be installed in the CI sandbox."""

from __future__ import annotations

from datetime import date, timedelta

from simualpha_quant.execution.simulate import run_simulation
from simualpha_quant.execution.trade_log import TradeRecord
from simualpha_quant.schemas import (
    DateRange,
    EntryRules,
    ExitLeg,
    ExitRules,
    PositionSizing,
    PriceRule,
    StopLoss,
    StrategySpec,
    UniverseSpec,
)


def _minimal_spec() -> StrategySpec:
    return StrategySpec(
        entry=EntryRules(pattern_name="wave_2_at_618"),
        exit=ExitRules(
            take_profit=[
                ExitLeg(pct_of_position=0.5, price_rule=PriceRule(type="at_fib", level=1.618)),
            ],
            stop_loss=StopLoss(price_rule=PriceRule(type="at_fib", level=0.786)),
        ),
        position_sizing=PositionSizing(method="fixed", params={"stake_usd": 10_000}),
        universe_spec=UniverseSpec(tickers=["AAA", "BBB"]),
        date_range=DateRange(start=date(2020, 1, 1), end=date(2022, 12, 31)),
    )


def _fake_simulator(spec, store):  # noqa: ARG001
    trades = [
        TradeRecord(
            ticker="AAA",
            entry_date=date(2020, 2, 1),
            exit_date=date(2020, 8, 1),
            entry_price=100.0,
            exit_price=120.0,
            pct_return=0.20,
        ),
        TradeRecord(
            ticker="AAA",
            entry_date=date(2021, 1, 1),
            exit_date=date(2021, 3, 1),
            entry_price=150.0,
            exit_price=142.5,
            pct_return=-0.05,
        ),
        TradeRecord(
            ticker="BBB",
            entry_date=date(2020, 6, 1),
            exit_date=date(2020, 12, 1),
            entry_price=50.0,
            exit_price=75.0,
            pct_return=0.50,
        ),
    ]
    # Monotonically-increasing equity curve with a small dip.
    equity = []
    base = 100_000
    d = date(2020, 1, 1)
    while d <= date(2022, 12, 31):
        days_in = (d - date(2020, 1, 1)).days
        equity.append((d, base + days_in * 50.0 - (2000 if 90 <= days_in <= 120 else 0)))
        d += timedelta(days=7)
    return trades, equity


def test_run_simulation_with_synthetic_hook():
    spec = _minimal_spec()
    result = run_simulation(spec, chart_samples=3, synthetic_simulator=_fake_simulator)
    assert len(result.trades) == 3
    assert result.summary.total_trades == 3
    assert 0.6 < result.summary.win_rate <= 0.7
    assert result.per_horizon_outcomes
    assert len(result.sample_trades) <= 3
    # Equity curve OHLC contains open/high/low/close per bucket.
    for ohlc in result.equity_curve_ohlc:
        assert ohlc.low <= ohlc.open <= ohlc.high
        assert ohlc.low <= ohlc.close <= ohlc.high
    assert len(result.equity_curve_close) == len(result.equity_curve_ohlc)
    assert len(result.equity_curve_dates) == len(result.equity_curve_close)
