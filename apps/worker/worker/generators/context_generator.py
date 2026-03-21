"""Cross-asset context generation.

Produces CrossAssetEntry objects with seeded price perturbation.
Replace with real market data feed when available.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone

from worker.core.logging import get_logger
from worker.data.vocab import INSTRUMENT_NOTES, INSTRUMENTS, TREND_STATES, VOLATILITY_STATES
from worker.schemas.context import CrossAssetEntry

log = get_logger("gen.context")


def generate_cross_asset(
    rng: random.Random,
    ts: datetime | None = None,
) -> tuple[list[CrossAssetEntry], str]:
    """Generate cross-asset context entries and as_of timestamp."""
    ts = ts or datetime.now(timezone.utc)
    as_of = ts.strftime("%Y-%m-%dT%H:%M:%SZ")

    entries: list[CrossAssetEntry] = []
    for spec in INSTRUMENTS:
        instrument = spec["instrument"]
        base = spec["base_price"]
        typical = spec["typical_change"]

        change_pct = round(rng.gauss(0, typical), 2)
        last_price = round(base * (1 + change_pct / 100), 2)

        vol_state = rng.choice(VOLATILITY_STATES)
        trend = rng.choice(TREND_STATES)

        notes_options = INSTRUMENT_NOTES.get(instrument, [f"{instrument} holding near recent levels"])
        notes = rng.choice(notes_options)

        entries.append(
            CrossAssetEntry(
                instrument=instrument,
                last_price=last_price,
                change_pct=change_pct,
                volatility_state=vol_state,
                trend_state=trend,
                notes=notes,
            )
        )

    log.info("Generated cross-asset context for %d instruments", len(entries))
    return entries, as_of
