"""Backtest engine sanity tests — synthetic universe + known outcomes."""

from __future__ import annotations

from datetime import date

import pandas as pd

from simualpha_quant.research.backtest import run_backtest
from simualpha_quant.research.patterns import by_name


def test_engine_with_clean_universe(clean_five_wave_impulse: pd.DataFrame):
    def loader(ticker: str, start, end):  # noqa: ARG001
        return clean_five_wave_impulse

    p = by_name("wave_2_at_618")
    res = run_backtest(
        pattern=p,
        tickers=["TKR1", "TKR2", "TKR3"],
        start=date(2020, 1, 1),
        end=date(2022, 1, 1),
        horizons_months=[3, 6, 12],
        price_loader=loader,
        include_per_year=True,
        sample_size=5,
    )
    assert res.universe_resolved == 3
    assert len(res.signals) >= 3          # one per ticker
    # All planted impulses climb post-W2, so forward returns are positive.
    for h in res.stats:
        assert h.sample_size >= 3
        assert h.hit_rate == 1.0
        assert h.median_return > 0.0
    assert res.per_year_breakdown is not None
    assert len(res.sample_signals) >= 3


def test_engine_handles_empty_universe():
    res = run_backtest(
        pattern=by_name("wave_2_at_618"),
        tickers=[],
        start=date(2020, 1, 1),
        end=date(2022, 1, 1),
        horizons_months=[3, 6],
        price_loader=lambda t, s, e: pd.DataFrame(),
    )
    assert res.universe_resolved == 0
    assert res.signals == []
    assert all(h.sample_size == 0 for h in res.stats)
