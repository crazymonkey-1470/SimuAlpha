"""Baseline seed state for deterministic simulation generation.

This module provides the initial "anchor" state that generators perturb
to produce varied but plausible outputs. When real market data feeds and
calibration pipelines are connected, the anchor state will be computed
rather than hard-coded.
"""

from __future__ import annotations

# Base actor states keyed by archetype — generators perturb these values.
ACTOR_BASELINES: dict[str, dict] = {
    "trend_follower": {
        "bias": "bullish",
        "conviction": 0.62,
        "contribution": 0.20,
        "confidence": 0.70,
    },
    "mean_reverter": {
        "bias": "neutral",
        "conviction": 0.45,
        "contribution": -0.05,
        "confidence": 0.75,
    },
    "options_dealer": {
        "bias": "neutral",
        "conviction": 0.80,
        "contribution": -0.12,
        "confidence": 0.82,
    },
    "passive_allocator": {
        "bias": "bullish",
        "conviction": 0.90,
        "contribution": 0.30,
        "confidence": 0.88,
    },
    "macro_reactive": {
        "bias": "bearish",
        "conviction": 0.55,
        "contribution": -0.15,
        "confidence": 0.60,
    },
    "panic_seller": {
        "bias": "neutral",
        "conviction": 0.15,
        "contribution": -0.02,
        "confidence": 0.85,
    },
    "dip_buyer": {
        "bias": "bullish",
        "conviction": 0.50,
        "contribution": 0.08,
        "confidence": 0.65,
    },
}

# Regime baseline
REGIME_BASELINE: dict = {
    "regime": "fragile uptrend",
    "confidence": 0.72,
    "net_pressure": 0.18,
}

# Scenario baseline probabilities
SCENARIO_BASELINE_PROBS: dict[str, float] = {
    "base": 0.50,
    "vol-expansion": 0.25,
    "breakout": 0.15,
    "macro-shock": 0.10,
}

# Signal baseline
SIGNAL_BASELINE: dict = {
    "bias": "mildly bullish",
    "confidence": 0.62,
}
