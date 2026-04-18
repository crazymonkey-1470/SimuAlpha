"""StrategySpec DSL — Pydantic validation."""

from __future__ import annotations

from datetime import date

import pytest

from simualpha_quant.schemas import (
    DateRange,
    EntryRules,
    ExitLeg,
    ExitRules,
    PositionSizing,
    PriceRule,
    StopLoss,
    StrategySpec,
    Tranche,
    UniverseSpec,
)


def _valid_spec(**overrides):
    base = dict(
        entry=EntryRules(pattern_name="wave_2_at_618"),
        exit=ExitRules(
            take_profit=[
                ExitLeg(pct_of_position=0.5, price_rule=PriceRule(type="at_fib", level=1.618)),
                ExitLeg(pct_of_position=0.5, price_rule=PriceRule(type="at_fib", level=2.618)),
            ],
            stop_loss=StopLoss(price_rule=PriceRule(type="at_fib", level=0.786)),
            time_stop_days=365,
        ),
        position_sizing=PositionSizing(method="fixed", params={"stake_usd": 10_000}),
        universe_spec=UniverseSpec(tickers=["HIMS", "NKE"]),
        date_range=DateRange(start=date(2020, 1, 1), end=date(2024, 12, 31)),
    )
    base.update(overrides)
    return StrategySpec(**base)


def test_default_tranche_ladder_sums_to_one():
    spec = _valid_spec()
    total = sum(t.pct_of_position for t in spec.entry.tranches)
    assert total == pytest.approx(1.0)
    assert len(spec.entry.tranches) == 5


def test_duplicate_tranche_price_rule_rejected():
    with pytest.raises(ValueError) as exc:
        EntryRules(
            pattern_name="x",
            tranches=[
                Tranche(pct_of_position=0.5, price_rule=PriceRule(type="at_signal")),
                Tranche(pct_of_position=0.5, price_rule=PriceRule(type="at_signal")),
            ],
        )
    assert "duplicate" in str(exc.value).lower()


def test_duplicate_exit_price_rule_rejected():
    with pytest.raises(ValueError) as exc:
        ExitRules(
            take_profit=[
                ExitLeg(pct_of_position=0.5, price_rule=PriceRule(type="at_fib", level=1.618)),
                ExitLeg(pct_of_position=0.5, price_rule=PriceRule(type="at_fib", level=1.618)),
            ],
            stop_loss=StopLoss(price_rule=PriceRule(type="at_fib", level=0.786)),
        )
    assert "duplicate" in str(exc.value).lower()


def test_xor_entry_rejects_both():
    with pytest.raises(ValueError):
        EntryRules(pattern_name="x", custom_expression={"gt": {"a": "$close", "b": 1}})


def test_xor_entry_rejects_neither():
    with pytest.raises(ValueError):
        EntryRules()


def test_tranches_must_sum_to_one():
    with pytest.raises(ValueError) as exc:
        EntryRules(
            pattern_name="x",
            tranches=[Tranche(pct_of_position=0.5, price_rule=PriceRule(type="at_signal"))],
        )
    assert "sum to 1.0" in str(exc.value).lower() or "sum to 1" in str(exc.value).lower()


def test_exit_legs_may_sum_less_than_one():
    # Legs that don't cover 100%; stop/time eats the residual.
    rules = ExitRules(
        take_profit=[
            ExitLeg(pct_of_position=0.5, price_rule=PriceRule(type="at_fib", level=1.618)),
        ],
        stop_loss=StopLoss(price_rule=PriceRule(type="at_fib", level=0.786)),
    )
    assert sum(l.pct_of_position for l in rules.take_profit) == 0.5


def test_exit_legs_cannot_sum_above_one():
    with pytest.raises(ValueError):
        ExitRules(
            take_profit=[
                ExitLeg(pct_of_position=0.7, price_rule=PriceRule(type="at_fib", level=1.618)),
                ExitLeg(pct_of_position=0.4, price_rule=PriceRule(type="at_fib", level=2.618)),
            ],
            stop_loss=StopLoss(price_rule=PriceRule(type="at_fib", level=0.786)),
        )


def test_price_rule_at_fib_requires_level():
    with pytest.raises(ValueError):
        PriceRule(type="at_fib")


def test_price_rule_at_ma_requires_period_and_freq():
    with pytest.raises(ValueError):
        PriceRule(type="at_ma", period=50)
    with pytest.raises(ValueError):
        PriceRule(type="at_ma", freq="daily")


def test_position_sizing_method_params():
    with pytest.raises(ValueError):
        PositionSizing(method="fixed", params={})  # missing stake_usd
    with pytest.raises(ValueError):
        PositionSizing(method="kelly_fraction", params={"kelly_fraction": 1.5})
    assert PositionSizing(method="fixed", params={"stake_usd": 100}).params["stake_usd"] == 100


def test_canonical_json_is_deterministic():
    a = _valid_spec().canonical_json()
    b = _valid_spec().canonical_json()
    assert a == b
    # Same spec → same hash candidate.
    import hashlib
    assert hashlib.sha256(a.encode()).hexdigest() == hashlib.sha256(b.encode()).hexdigest()
