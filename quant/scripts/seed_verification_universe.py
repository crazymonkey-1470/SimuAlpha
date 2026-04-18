"""Seed prices_daily with OpenBB data for the verification universe.

Default reads tickers from scripts/universes/verification_50.txt
(committed; one ticker per line, '#' comments allowed). Override with
``SEED_UNIVERSE`` env var pointing at any text file in the same format.

Default window: 2010-01-01 → 2020-12-31 (Stage 4.5 verification window).
Override with env vars SEED_START / SEED_END (YYYY-MM-DD).

Required env (real environment, Py 3.12 + ``pip install -r
requirements.txt``):

    OPENBB_PAT            OpenBB Platform personal access token
    SUPABASE_URL          Supabase project URL
    SUPABASE_SERVICE_KEY  Supabase service-role key

Usage:

    python scripts/seed_verification_universe.py

Idempotent — the underlying ``fetch_prices`` upserts on
``(ticker, date)``, so re-running won't double-write. Incremental —
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

DEFAULT_UNIVERSE = ROOT / "scripts" / "universes" / "verification_50.txt"


def _parse_env_date(key: str, default: date) -> date:
    raw = os.environ.get(key)
    if not raw:
        return default
    try:
        return date.fromisoformat(raw)
    except ValueError:
        log.warning("bad %s env, using default", key, extra={"value": raw})
        return default


def load_tickers(path: Path) -> list[str]:
    """Read a one-per-line ticker file. '#' comments + blanks ignored."""
    if not path.exists():
        raise FileNotFoundError(f"universe file not found: {path}")
    out: list[str] = []
    for raw in path.read_text().splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        ticker = line.split()[0].upper()
        if ticker:
            out.append(ticker)
    if not out:
        raise ValueError(f"no tickers found in {path}")
    return out


def main() -> int:
    universe_path = Path(os.environ.get("SEED_UNIVERSE", str(DEFAULT_UNIVERSE)))
    start = _parse_env_date("SEED_START", date(2010, 1, 1))
    end = _parse_env_date("SEED_END", date(2020, 12, 31))

    tickers = load_tickers(universe_path)
    log.info(
        "seed start",
        extra={
            "ticker_count": len(tickers),
            "start": start.isoformat(),
            "end": end.isoformat(),
            "universe_file": str(universe_path),
        },
    )

    total = fetch_prices(tickers, start=start.isoformat(), end=end.isoformat())
    print(
        f"seed done: {total} rows across {len(tickers)} tickers "
        f"from {start} to {end} (universe: {universe_path.name})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
