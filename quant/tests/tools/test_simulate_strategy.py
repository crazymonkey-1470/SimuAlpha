"""simulate_strategy tool — sync + async + chart paths."""

from __future__ import annotations

import importlib
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from simualpha_quant.execution.trade_log import TradeRecord
from simualpha_quant.schemas import (
    DateRange,
    EntryRules,
    ExitLeg,
    ExitRules,
    PositionSizing,
    PriceRule,
    SimulateStrategyRequest,
    StopLoss,
    StrategySpec,
    UniverseSpec,
)

sim_mod = importlib.import_module("simualpha_quant.tools.simulate_strategy")


def _spec() -> StrategySpec:
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


def _stub_engine(trades: list[TradeRecord]):
    from simualpha_quant.schemas import HorizonOutcome, EquityOHLC
    from simualpha_quant.execution.simulate import SimulationEngineResult
    from simualpha_quant.execution.trade_log import summary_from_trades

    equity_dates = [date(2020, 1, 1), date(2020, 6, 1), date(2020, 12, 1)]
    equity_close = [100_000.0, 110_000.0, 120_000.0]
    ohlc = [
        EquityOHLC(date=d, open=v, high=v, low=v, close=v)
        for d, v in zip(equity_dates, equity_close)
    ]
    return SimulationEngineResult(
        trades=trades,
        summary=summary_from_trades(trades, equity_close),
        per_horizon_outcomes=[HorizonOutcome(horizon_months=3, reached_target_pct=1.0)],
        equity_curve_ohlc=ohlc,
        equity_curve_close=equity_close,
        equity_curve_dates=equity_dates,
        sample_trades=trades,
    )


@pytest.fixture(autouse=True)
def _patch(monkeypatch):
    # Supabase cache / audit stubbed out.
    monkeypatch.setattr(sim_mod, "_cache_read", lambda h, ttl_days=30: None)
    monkeypatch.setattr(sim_mod, "_cache_write", lambda *a, **kw: None)
    monkeypatch.setattr(sim_mod, "_submit_charts_job", lambda *a, **kw: "fake-job-id")

    def _all_trades():
        return [
            TradeRecord(ticker="AAA", entry_date=date(2020, 2, 1), exit_date=date(2020, 5, 1),
                        entry_price=100.0, exit_price=120.0, pct_return=0.2),
            TradeRecord(ticker="BBB", entry_date=date(2020, 3, 1), exit_date=date(2020, 7, 1),
                        entry_price=50.0, exit_price=60.0, pct_return=0.2),
            TradeRecord(ticker="CCC", entry_date=date(2020, 4, 1), exit_date=date(2020, 8, 1),
                        entry_price=75.0, exit_price=90.0, pct_return=0.2),
            TradeRecord(ticker="DDD", entry_date=date(2020, 5, 1), exit_date=date(2020, 9, 1),
                        entry_price=30.0, exit_price=36.0, pct_return=0.2),
            TradeRecord(ticker="EEE", entry_date=date(2020, 6, 1), exit_date=date(2020, 10, 1),
                        entry_price=200.0, exit_price=240.0, pct_return=0.2),
            TradeRecord(ticker="FFF", entry_date=date(2020, 7, 1), exit_date=date(2020, 11, 1),
                        entry_price=25.0, exit_price=30.0, pct_return=0.2),
            TradeRecord(ticker="GGG", entry_date=date(2020, 8, 1), exit_date=date(2020, 12, 1),
                        entry_price=400.0, exit_price=480.0, pct_return=0.2),
        ]

    # Engine stub mirrors the real run_simulation: sample_trades is
    # sliced to chart_samples by the engine, not the tool.
    def fake_run(spec, *, chart_samples=5, **kwargs):  # noqa: ARG001
        from simualpha_quant.execution.trade_log import select_sample_trades
        trades = _all_trades()
        result = _stub_engine(trades)
        result.sample_trades = select_sample_trades(trades, chart_samples)
        return result

    monkeypatch.setattr(sim_mod, "run_simulation", fake_run)


def _renderer(req):  # stand-in for render_tli_chart
    return SimpleNamespace(url=f"file:///tmp/charts/{req.ticker}.png")


def test_sync_chart_path_renders_inline():
    req = SimulateStrategyRequest(strategy=_spec(), chart_samples=3)
    resp = sim_mod.simulate_strategy(req, renderer=_renderer)
    assert len(resp.trade_log_sample) == 3
    assert all(t.chart_status == "rendered" for t in resp.trade_log_sample)
    assert all(t.chart_url and t.chart_url.startswith("file:///") for t in resp.trade_log_sample)
    assert resp.charts_job_id is None


def test_async_chart_path_returns_pending_and_job_id():
    req = SimulateStrategyRequest(strategy=_spec(), chart_samples=7)
    resp = sim_mod.simulate_strategy(req, renderer=_renderer)
    assert len(resp.trade_log_sample) == 7
    assert all(t.chart_status == "pending" for t in resp.trade_log_sample)
    assert all(t.chart_url is None for t in resp.trade_log_sample)
    assert resp.charts_job_id == "fake-job-id"


def test_chart_samples_zero_means_no_chart_entries():
    req = SimulateStrategyRequest(strategy=_spec(), chart_samples=0)
    resp = sim_mod.simulate_strategy(req, renderer=_renderer)
    assert resp.trade_log_sample == []
    assert resp.charts_job_id is None


def test_response_carries_equity_ohlc_and_close():
    req = SimulateStrategyRequest(strategy=_spec(), chart_samples=1)
    resp = sim_mod.simulate_strategy(req, renderer=_renderer)
    assert len(resp.equity_curve_ohlc) == len(resp.equity_curve)
    assert len(resp.equity_curve) == len(resp.equity_curve_dates)


def test_engine_error_becomes_status_error_response(monkeypatch):
    """Bug-1 regression: when the engine raises SimulationError, the
    tool returns ``status='error'`` + ``error_type`` populated. It
    must NOT look like a successful zero-trade simulation, and it
    must NOT be written to the cache (callers should retry, not
    read a stale error)."""
    from simualpha_quant.execution.simulate import SimulationError

    def raising(spec, *, chart_samples=5, **kwargs):  # noqa: ARG001
        raise SimulationError("freqtrade_init_failure", "KeyError: 'exit_pricing'")

    monkeypatch.setattr(sim_mod, "run_simulation", raising)
    writes: list = []
    monkeypatch.setattr(sim_mod, "_cache_write", lambda *a, **kw: writes.append(a))

    req = SimulateStrategyRequest(strategy=_spec(), chart_samples=0)
    resp = sim_mod.simulate_strategy(req, renderer=_renderer)

    assert resp.status == "error"
    assert resp.error_type == "freqtrade_init_failure"
    assert resp.error_detail is not None
    assert "exit_pricing" in resp.error_detail
    assert resp.summary_stats.total_trades == 0
    assert resp.trade_log_sample == []
    assert resp.hash
    assert writes == []  # errored responses must never be cached


def test_spec_hash_deterministic_and_case_normalized():
    a = sim_mod.spec_hash(SimulateStrategyRequest(strategy=_spec(), chart_samples=3))
    spec2 = _spec().model_copy(update={
        "universe_spec": UniverseSpec(tickers=["aaa", "bbb"]),  # lowercase
    })
    b = sim_mod.spec_hash(SimulateStrategyRequest(strategy=spec2, chart_samples=3))
    assert a == b
    # Different chart_samples → different hash.
    c = sim_mod.spec_hash(SimulateStrategyRequest(strategy=_spec(), chart_samples=7))
    assert a != c
