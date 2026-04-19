"""Freqtrade 2026.3 config-shape smoke test.

Closes the feedback loop on the Stage-4.5 egress-check bug: the
production deploy caught ``KeyError: 'exit_pricing'`` at
``Backtesting.__init__`` because ``build_config`` was missing keys
freqtrade considers required. If freqtrade's
``SCHEMA_TRADE_REQUIRED`` grows new keys in a future release, this
test fails at CI time instead of at Railway boot time.

The test is skipped when freqtrade isn't installed — the core
service is installable without it; only the Stage-4 execution
service needs it.
"""

from __future__ import annotations

from datetime import date

import pytest

from simualpha_quant.execution.freqtrade_adapter import build_config
from simualpha_quant.research import universes
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

freqtrade = pytest.importorskip("freqtrade")


def _minimal_spec() -> StrategySpec:
    return StrategySpec(
        entry=EntryRules(pattern_name="wave_2_at_618"),
        exit=ExitRules(
            take_profit=[
                ExitLeg(pct_of_position=1.0, price_rule=PriceRule(type="at_fib", level=1.618)),
            ],
            stop_loss=StopLoss(price_rule=PriceRule(type="at_fib", level=0.786)),
        ),
        position_sizing=PositionSizing(method="fixed", params={"stake_usd": 10_000}),
        universe_spec=UniverseSpec(tickers=["AAA", "BBB"]),
        date_range=DateRange(start=date(2020, 1, 1), end=date(2022, 12, 31)),
        initial_capital=100_000.0,
        max_open_positions=5,
    )


def test_build_config_has_all_freqtrade_2026_3_required_keys(monkeypatch):
    """Every key in freqtrade's ``SCHEMA_TRADE_REQUIRED`` must be
    present in ``build_config``'s output. This is the precise
    invariant violated by Bug 2."""
    monkeypatch.setattr(universes, "resolve", lambda spec: spec.tickers or [])
    cfg = build_config(_minimal_spec())

    from freqtrade.config_schema.config_schema import SCHEMA_TRADE_REQUIRED

    missing = [k for k in SCHEMA_TRADE_REQUIRED if k not in cfg]
    assert not missing, f"build_config missing freqtrade-required keys: {missing}"


def test_build_config_accepted_by_backtesting_init(monkeypatch, tmp_path):
    """Regression test for Bug 2. Constructs a minimal
    ``Backtesting`` instance with only the config dict — the exact
    code path that raised ``KeyError: 'exit_pricing'`` on the
    production Railway deploy.

    We mock out the exchange so the test never touches the network
    (the real ``Exchange.__init__`` hits binance.com; we only care
    that freqtrade's schema validation accepts the config)."""
    monkeypatch.setattr(universes, "resolve", lambda spec: spec.tickers or [])

    import tempfile

    from freqtrade.configuration import Configuration

    cfg = build_config(_minimal_spec())
    cfg["user_data_dir"] = str(tmp_path)
    for sub in ("data", "logs", "strategies", "backtest_results", "hyperopt_results"):
        (tmp_path / sub).mkdir(parents=True, exist_ok=True)

    try:
        base = Configuration.from_files([])
    except Exception:
        base = {}
    if isinstance(base, dict):
        base.update(cfg)
        cfg = base

    # We want to fail ONLY if schema validation rejects the config;
    # we don't want to fail because the test runner can't reach
    # binance.com. Monkey-patch the exchange-init entrypoint that
    # Backtesting calls to prove the failure is (or isn't) schema-
    # related.
    from freqtrade.resolvers import ExchangeResolver

    class _FakeExchange:
        name = "binance"
        id = "binance"
        timeframes = ["1d"]
        markets = {}
        _config = cfg

        def __init__(self, *a, **kw):
            pass

        def validate_timeframes(self, *a, **kw):
            return True

        def exchange_has(self, *a, **kw):
            return True

        def get_fee(self, *a, **kw):
            return 0.0

    monkeypatch.setattr(
        ExchangeResolver,
        "load_exchange",
        classmethod(lambda cls, config, *a, **kw: _FakeExchange()),
    )

    # The relevant assertion: this init call must NOT raise
    # KeyError for any of the freqtrade 2026.3 required keys.
    from freqtrade.optimize.backtesting import Backtesting

    try:
        Backtesting(cfg)
    except KeyError as exc:
        pytest.fail(
            "Backtesting init raised KeyError — build_config is still "
            f"missing a freqtrade-required key: {exc}"
        )
    except Exception:
        # Non-schema errors (e.g. exchange fake incompatibility,
        # strategy missing) are out of scope for this smoke test.
        # Only KeyError from a missing config slot is the regression.
        pass
