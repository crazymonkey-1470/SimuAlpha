"""Seed prices_daily with OpenBB data for a 50-ticker universe.

Usage (real environment — Py 3.12, requirements.txt installed,
SUPABASE_URL + SUPABASE_SERVICE_KEY + OPENBB_PAT set in .env):

    python scripts/seed_universe_sample.py

Default window: 2010-01-01 → 2020-12-31 (Stage 4.5 verification window).
Override with env vars SEED_START / SEED_END (YYYY-MM-DD).

The 50-ticker set is a pragmatic spread: mega-caps, mid-caps, one
recent IPO, one small-cap, a couple of cyclicals. Not an index
replica. If you want the real S&P 500 universe, adjust SEED_TICKERS.

Idempotent — the underlying fetch_prices() upserts on
(ticker, date), so re-running won't double-write. Incremental —
future runs after the window extends only pull the missing tail per
ticker (handled by the Stage-1 ingestion layer).
"""

from __future__ import annotations

import os
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from simualpha_quant.data.openbb_ingest import fetch_prices  # noqa: E402
from simualpha_quant.logging_config import get_logger  # noqa: E402

log = get_logger(__name__)


# 50 tickers — diversified across sectors, market caps, listing ages.
SEED_TICKERS: tuple[str, ...] = (
    # Mega-cap tech
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "ORCL",
    # Financials
    "JPM", "BAC", "V", "MA", "GS", "MS",
    # Consumer
    "NKE", "LULU", "SBUX", "MCD", "KO", "PEP", "WMT", "COST", "HD", "DIS",
    # Healthcare
    "UNH", "JNJ", "PFE", "LLY", "MRK", "TMO", "ABBV",
    # Industrial / cyclical
    "CAT", "DE", "BA", "LMT", "HON",
    # Energy / materials
    "XOM", "CVX", "NEM",
    # Semis + enterprise
    "AMD", "AVGO", "CRM", "ADBE",
    # Retail-y recent IPOs / high-beta names (verify these go back to 2010)
    "ROKU", "SQ", "SHOP", "NET", "SNOW",
    # Small/mid-cap for pattern variety
    "ETSY", "NFLX",
)


def _parse_env_date(key: str, default: date) -> date:
    raw = os.environ.get(key)
    if not raw:
        return default
    try:
        return date.fromisoformat(raw)
    except ValueError:
        log.warning("bad %s env, using default", key, extra={"value": raw})
        return default


def main() -> int:
    start = _parse_env_date("SEED_START", date(2010, 1, 1))
    end = _parse_env_date("SEED_END", date(2020, 12, 31))

    log.info(
        "seed start",
        extra={
            "ticker_count": len(SEED_TICKERS),
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
    )

    total = fetch_prices(list(SEED_TICKERS), start=start.isoformat(), end=end.isoformat())
    print(f"seed done: {total} rows across {len(SEED_TICKERS)} tickers "
          f"from {start} to {end}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
