"""Signal summary generation.

Produces SignalSummary with deterministic seeded variation.
Replace with real signal model output when available.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone

from worker.core.logging import get_logger
from worker.data.seed_state import SIGNAL_BASELINE
from worker.data.vocab import POSTURE_PHRASES, SIGNAL_BIASES, SIGNAL_WARNINGS
from worker.schemas.signal import SignalHistoryEntry, SignalSummary

log = get_logger("gen.signal")


def generate_signal(rng: random.Random, ts: datetime | None = None) -> SignalSummary:
    """Generate a current signal summary."""
    ts = ts or datetime.now(timezone.utc)

    bias = rng.choice(SIGNAL_BIASES)
    confidence = _perturb(rng, SIGNAL_BASELINE["confidence"], 0.10, 0.30, 0.90)
    time_horizon = rng.choice(["1-2 weeks", "2-4 weeks", "1 week", "3-5 days"])
    posture = rng.choice(POSTURE_PHRASES)

    warning_count = rng.choices([1, 2, 3], weights=[20, 50, 30])[0]
    warnings = rng.sample(SIGNAL_WARNINGS, k=min(warning_count, len(SIGNAL_WARNINGS)))

    prev_confidence = confidence + rng.uniform(0.03, 0.15)
    change_vs_prior = (
        f"Bias {'unchanged from' if rng.random() < 0.5 else 'shifted vs'} "
        f"prior period. Confidence moved from {prev_confidence:.2f} to {confidence:.2f}. "
        f"{'Driven by deteriorating momentum breadth and rising macro uncertainty.' if confidence < prev_confidence else 'Supported by improving actor alignment and vol compression.'}"
    )

    summary = SignalSummary(
        bias=bias,
        confidence=round(confidence, 2),
        time_horizon=time_horizon,
        suggested_posture=posture,
        warnings=warnings,
        change_vs_prior=change_vs_prior,
        updated_at=ts,
    )

    log.info("Generated signal: bias=%s conf=%.2f", bias, confidence)
    return summary


def generate_signal_history(
    rng: random.Random,
    dates: list[str],
) -> list[SignalHistoryEntry]:
    """Generate historical signal entries."""
    entries: list[SignalHistoryEntry] = []
    prev_conf = SIGNAL_BASELINE["confidence"]

    for date_str in reversed(dates):
        bias = rng.choice(SIGNAL_BIASES)
        prev_conf = _perturb(rng, prev_conf, 0.08, 0.30, 0.85)
        posture = rng.choice(POSTURE_PHRASES)

        summary_phrases = [
            f"Signal {bias}; actor alignment {'supportive' if 'bullish' in bias else 'mixed'}",
            f"Confidence at {prev_conf:.0%}; {rng.choice(['momentum', 'macro', 'vol'])} dynamics dominate",
            f"Posture reflects {bias} bias with {'fading' if prev_conf < 0.55 else 'stable'} conviction",
        ]

        entries.append(
            SignalHistoryEntry(
                date=date_str,
                bias=bias,
                confidence=round(prev_conf, 2),
                suggested_posture=posture,
                summary=rng.choice(summary_phrases),
            )
        )

    entries.reverse()
    return entries


def _perturb(
    rng: random.Random, base: float, scale: float, lo: float, hi: float
) -> float:
    return max(lo, min(hi, base + rng.gauss(0, scale)))
