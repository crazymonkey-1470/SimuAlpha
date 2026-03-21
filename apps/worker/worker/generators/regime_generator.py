"""Regime snapshot generation.

Produces a RegimeSnapshot with deterministic seeded variation.
Replace the perturbation logic with real model inference when
the calibration pipeline is connected.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone

from worker.core.logging import get_logger
from worker.data.seed_state import REGIME_BASELINE
from worker.data.vocab import (
    DRIVER_DESCRIPTIONS,
    DRIVER_FACTORS,
    POSTURE_PHRASES,
    REGIME_LABELS,
    RISK_FLAG_FRAGMENTS,
    SUMMARY_TEMPLATES,
)
from worker.schemas.regime import RegimeDriver, RegimeHistoryEntry, RegimeSnapshot

log = get_logger("gen.regime")


def generate_regime(rng: random.Random, ts: datetime | None = None) -> RegimeSnapshot:
    """Generate a complete regime snapshot."""
    ts = ts or datetime.now(timezone.utc)

    regime = rng.choice(REGIME_LABELS[:5])  # favour common regimes
    confidence = _perturb(rng, REGIME_BASELINE["confidence"], 0.12, 0.35, 0.95)
    net_pressure = _perturb(rng, REGIME_BASELINE["net_pressure"], 0.15, -0.60, 0.60)
    posture = rng.choice(POSTURE_PHRASES)

    drivers = _generate_drivers(rng)
    risk_flags = _generate_risk_flags(rng)
    summary = _generate_summary(rng, regime, drivers)

    snapshot = RegimeSnapshot(
        regime=regime,
        confidence=round(confidence, 2),
        net_pressure=round(net_pressure, 2),
        posture=posture,
        risk_flags=risk_flags,
        drivers=drivers,
        summary=summary,
        updated_at=ts,
    )

    log.info("Generated regime snapshot: %s (conf=%.2f)", regime, confidence)
    return snapshot


def generate_regime_history(
    rng: random.Random,
    dates: list[str],
) -> list[RegimeHistoryEntry]:
    """Generate a sequence of historical regime entries."""
    entries: list[RegimeHistoryEntry] = []
    prev_regime = rng.choice(REGIME_LABELS[:5])
    prev_confidence = REGIME_BASELINE["confidence"]
    prev_pressure = REGIME_BASELINE["net_pressure"]

    for date_str in reversed(dates):
        # Regime transitions happen ~30% of the time
        if rng.random() < 0.30:
            prev_regime = rng.choice(REGIME_LABELS[:7])
        prev_confidence = _perturb(rng, prev_confidence, 0.08, 0.35, 0.95)
        prev_pressure = _perturb(rng, prev_pressure, 0.10, -0.50, 0.50)

        entries.append(
            RegimeHistoryEntry(
                date=date_str,
                regime=prev_regime,
                confidence=round(prev_confidence, 2),
                net_pressure=round(prev_pressure, 2),
                summary=_short_summary(rng, prev_regime),
            )
        )

    entries.reverse()
    return entries


# ── Helpers ──────────────────────────────────────────────────────────────────


def _perturb(
    rng: random.Random, base: float, scale: float, lo: float, hi: float
) -> float:
    return max(lo, min(hi, base + rng.gauss(0, scale)))


def _generate_drivers(rng: random.Random) -> list[RegimeDriver]:
    factors = rng.sample(DRIVER_FACTORS, k=min(4, len(DRIVER_FACTORS)))
    drivers: list[RegimeDriver] = []
    for factor in factors:
        influence = round(rng.uniform(-0.40, 0.40), 2)
        descriptions = DRIVER_DESCRIPTIONS.get(factor)
        if descriptions:
            desc = rng.choice(descriptions)
        else:
            desc = f"{factor.capitalize()} influence at {'+' if influence >= 0 else ''}{influence:.0%} weight"
        drivers.append(RegimeDriver(factor=factor, influence=influence, description=desc))
    return drivers


def _generate_risk_flags(rng: random.Random) -> list[str]:
    count = rng.choices([1, 2, 3, 4], weights=[15, 45, 30, 10])[0]
    flags = rng.sample(RISK_FLAG_FRAGMENTS, k=min(count, len(RISK_FLAG_FRAGMENTS)))
    return [f.replace("{level}", str(rng.randint(5500, 5800))) for f in flags]


def _generate_summary(
    rng: random.Random, regime: str, drivers: list[RegimeDriver]
) -> str:
    template = rng.choice(SUMMARY_TEMPLATES)
    dominant = drivers[0].factor if drivers else "passive inflows"
    return (
        template
        .replace("{regime}", regime)
        .replace("{driver_context}", f"{dominant.capitalize()} is the primary driver at this juncture.")
        .replace("{risk_adj}", rng.choice(["elevated", "moderate", "contained but rising"]))
        .replace("{dealer_state}", rng.choice(["weakens under vol expansion", "remains supportive"]))
        .replace("{proximity}", rng.choice(["uncomfortably close to", "above", "near"]))
        .replace("{conviction_state}", rng.choice(["fading", "steady but unenthusiastic", "building"]))
        .replace("{positioning_state}", rng.choice(["crowded long", "balanced", "net short"]))
        .replace("{dominant_actor}", dominant)
        .replace("{characteristic}", rng.choice(["compressed vol and balanced flows", "shifting actor dominance", "momentum divergence"]))
        .replace("{fragility_state}", rng.choice(["elevated", "moderate", "low but rising"]))
        .replace("{outlook}", rng.choice(["continuation", "range-bound resolution", "cautious upside"]))
    )


def _short_summary(rng: random.Random, regime: str) -> str:
    phrases = [
        f"Regime stable at {regime}; primary drivers unchanged",
        f"{regime.capitalize()} persists as actor balance holds",
        f"Transition risk moderate; {regime} classification maintained",
        f"Actor flows consistent with {regime} designation",
    ]
    return rng.choice(phrases)
