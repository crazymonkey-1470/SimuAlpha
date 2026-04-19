"""Aggregation tests — summary stats, horizon outcomes, equity downsampling."""

from __future__ import annotations

from datetime import date, timedelta

from simualpha_quant.execution.trade_log import (
    TradeRecord,
    downsample_equity_ohlc,
    horizon_outcomes,
    select_sample_trades,
    summary_from_trades,
)


def _trade(ticker: str, entry: date, exit_d: date, pct: float) -> TradeRecord:
    return TradeRecord(
        ticker=ticker,
        entry_date=entry,
        exit_date=exit_d,
        entry_price=100.0,
        exit_price=100.0 * (1 + pct),
        pct_return=pct,
    )


def test_summary_on_mixed_trades():
    trades = [
        _trade("A", date(2020, 1, 1), date(2020, 7, 1), +0.20),
        _trade("B", date(2020, 2, 1), date(2020, 6, 1), -0.10),
        _trade("C", date(2020, 3, 1), date(2021, 3, 1), +0.50),
        _trade("D", date(2020, 4, 1), date(2020, 5, 1), -0.05),
    ]
    equity = [100_000, 101_000, 103_500, 102_800, 104_000, 103_900, 108_200]
    s = summary_from_trades(trades, equity)
    assert s.total_trades == 4
    assert s.win_rate == 0.5
    # Profit factor: wins=0.7, losses=0.15 → ~4.67
    assert 4.5 < s.profit_factor < 5.0
    assert s.max_drawdown_pct <= 0.0
    # Sharpe / Sortino are finite.
    assert s.sharpe == s.sharpe  # not NaN
    assert s.sortino == s.sortino


def test_empty_trades_yield_zero_summary():
    s = summary_from_trades([], [])
    assert s.total_trades == 0
    assert s.win_rate == 0.0


def test_horizon_outcomes_respects_cutoffs():
    trades = [
        _trade("A", date(2020, 1, 1), date(2020, 4, 1), +0.05),    # 91d → in 3/6/12/24
        _trade("B", date(2020, 1, 1), date(2020, 7, 10), +0.10),   # 191d → in 12/24 only
        _trade("C", date(2020, 1, 1), date(2021, 12, 15), -0.05),  # ~714d → in 24 only (loss)
    ]
    out = horizon_outcomes(trades, [3, 6, 12, 24])
    by_h = {o.horizon_months: o for o in out}
    # 3mo cutoff ≈ 91d: only A counts → 1/1 = 1.0.
    assert by_h[3].reached_target_pct == 1.0
    # 6mo cutoff ≈ 182d: A counts; B at 191d EXCLUDED; → 1/1 = 1.0.
    assert by_h[6].reached_target_pct == 1.0
    # 12mo cutoff ≈ 365d: A + B count; C excluded → 2/2 = 1.0.
    assert by_h[12].reached_target_pct == 1.0
    # 24mo cutoff ≈ 730d: all three count; C loss → 2/3 ≈ 0.667.
    assert 0.6 < by_h[24].reached_target_pct <= 0.7


def test_downsample_under_max_points_returns_identity():
    dates = [date(2020, 1, 1) + timedelta(days=i) for i in range(10)]
    equity = [100.0 + i for i in range(10)]
    ohlc, close, out_dates = downsample_equity_ohlc(dates, equity, max_points=500)
    assert len(ohlc) == 10
    assert len(close) == 10
    assert close[-1] == 109.0
    assert out_dates == dates


def test_downsample_over_max_points_buckets():
    n = 2000
    dates = [date(2020, 1, 1) + timedelta(days=i) for i in range(n)]
    equity = list(range(n))
    ohlc, close, out_dates = downsample_equity_ohlc(dates, equity, max_points=500)
    assert len(ohlc) <= 500
    # Bucket close is LAST value in the bucket, not mean.
    assert ohlc[-1].close == float(n - 1)
    assert ohlc[0].open == 0.0
    # High / low sanity.
    for bar in ohlc[:10]:
        assert bar.low <= bar.open <= bar.high
        assert bar.low <= bar.close <= bar.high


def test_select_sample_trades_one_per_ticker_then_recent():
    t = [
        _trade("A", date(2020, 1, 1), date(2020, 2, 1), +0.1),
        _trade("A", date(2020, 3, 1), date(2020, 5, 1), -0.05),
        _trade("B", date(2020, 1, 15), date(2020, 2, 15), +0.2),
        _trade("C", date(2020, 6, 1), date(2020, 9, 1), +0.3),
    ]
    sample = select_sample_trades(t, n=3)
    tickers = {s.ticker for s in sample}
    assert tickers == {"A", "B", "C"}
