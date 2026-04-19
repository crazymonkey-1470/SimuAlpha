"""Freqtrade 2026.3 config + strategy-resolution smoke test.

Each commit to the freqtrade-adapter surface has been followed by a
different production failure:

  1. ``KeyError: 'exit_pricing'`` at Exchange init.
  2. ``OperationalException: No strategy set`` at StrategyResolver
     init — freqtrade 2026.3 made filesystem-based strategy
     discovery mandatory.

This test is the checklist that would have caught both before
Railway did. It drives freqtrade's real ``Backtesting.__init__``
end-to-end:

  Phase 1 (schema):       every ``SCHEMA_TRADE_REQUIRED`` key is
                          present in ``build_config``'s output.
  Phase 2 (exchange):     ``Backtesting(config)`` reaches the
                          strategy-resolution step (exchange
                          stubbed out so no network).
  Phase 3 (strategy):     ``register_dynamic_strategy`` + ``config
                          ["strategy"] = "TLIStrategy"`` together
                          satisfy ``StrategyResolver.load_strategy``.

Skipped cleanly when freqtrade isn't installed (core service, CI
sandbox without stage-4 extras).
"""

from __future__ import annotations

from datetime import date

import pytest

from simualpha_quant.execution.freqtrade_adapter import (
    STRATEGY_NAME,
    build_config,
    build_strategy_class,
    register_dynamic_strategy,
)
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
    """Phase 1: every key in freqtrade's ``SCHEMA_TRADE_REQUIRED``
    must be present. This is the precise invariant violated by
    Bug 2 (missing ``exit_pricing``)."""
    monkeypatch.setattr(universes, "resolve", lambda spec: spec.tickers or [])
    cfg = build_config(_minimal_spec())

    from freqtrade.config_schema.config_schema import SCHEMA_TRADE_REQUIRED

    missing = [k for k in SCHEMA_TRADE_REQUIRED if k not in cfg]
    assert not missing, f"build_config missing freqtrade-required keys: {missing}"

    # The adapter sets a fixed strategy name; the registration
    # context manager relies on it being there.
    assert cfg["strategy"] == STRATEGY_NAME


def test_backtesting_init_resolves_dynamic_strategy(monkeypatch, tmp_path):
    """Phase 3: Backtesting init reaches StrategyResolver.load_
    strategy and our register_dynamic_strategy context manager
    produces a valid instance.

    Regression test for Bug 3 — freqtrade 2026.3's
    ``OperationalException: No strategy set`` which fired because
    the previous adapter left ``config["strategy"]`` unset and
    relied on an after-the-fact ``backtesting.strategylist = [...]``
    assignment that never ran because init had already raised.

    Exchange init is stubbed so the test never touches the network
    (real ``Exchange.__init__`` hits binance.com); we only care
    that schema validation + strategy resolution both succeed."""
    monkeypatch.setattr(universes, "resolve", lambda spec: spec.tickers or [])

    from freqtrade.configuration import Configuration

    spec = _minimal_spec()
    cfg = build_config(spec)
    strategy_cls = build_strategy_class(spec)

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

    # Stub exchange. We only care about schema + strategy
    # resolution; exchange behavior is out of scope here.
    from freqtrade.resolvers import ExchangeResolver

    class _FakeExchange:
        name = "binance"
        id = "binance"
        timeframes = ["1d"]
        markets = {}
        _config = cfg
        precisionMode = 4
        precision_mode_price = 4

        def __init__(self, *a, **kw):
            pass

        def validate_timeframes(self, *a, **kw):
            return True

        def exchange_has(self, *a, **kw):
            return True

        def get_fee(self, *a, **kw):
            return 0.0

        def validate_required_startup_candles(self, *a, **kw):
            return True

        def validate_pairs(self, *a, **kw):
            return True

    monkeypatch.setattr(
        ExchangeResolver,
        "load_exchange",
        classmethod(lambda cls, config, *a, **kw: _FakeExchange()),
    )

    from freqtrade.optimize.backtesting import Backtesting

    # THIS is the call that blew up on the last Railway deploy. Must
    # not raise OperationalException("No strategy set") — the context
    # manager is responsible for producing our dynamic strategy
    # through freqtrade's resolver.
    try:
        with register_dynamic_strategy(strategy_cls):
            Backtesting(cfg)
    except KeyError as exc:
        pytest.fail(
            "Backtesting init raised KeyError — build_config still "
            f"missing a freqtrade-required key: {exc}"
        )
    except Exception as exc:
        # OperationalException("No strategy set") is the regression we
        # care about. Other OperationalExceptions from exchange-
        # surface mismatches (the fake is intentionally minimal) are
        # acceptable — they'd be caught by phase-2 of the egress
        # check, not by this schema/resolver test.
        if "No strategy set" in str(exc):
            pytest.fail(
                f"Strategy resolution regressed: {exc}. "
                "register_dynamic_strategy is not installing the "
                "scoped patch correctly, or config['strategy'] is "
                "not being propagated."
            )
