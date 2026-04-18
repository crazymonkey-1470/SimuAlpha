"""Run backtest_pattern wave_2_at_618 against the verification universe.

Reads tickers from scripts/universes/verification_50.txt (override
with SEED_UNIVERSE), pulls OHLCV from Supabase prices_daily (no
network calls — assumes seed_verification_universe.py has populated
it), runs the Stage-3 detector + engine, prints structured stats.

Required env (real environment):
    SUPABASE_URL, SUPABASE_SERVICE_KEY

Usage:
    python scripts/run_verification_backtest.py
    # or with overrides:
    BACKTEST_START=2012-01-01 BACKTEST_END=2020-12-31 \\
      python scripts/run_verification_backtest.py
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from simualpha_quant.logging_config import get_logger  # noqa: E402
from simualpha_quant.research.backtest import run_backtest  # noqa: E402
from simualpha_quant.research.patterns import by_name  # noqa: E402

# Reuse the universe loader from the seed script.
from scripts.seed_verification_universe import (  # noqa: E402
    DEFAULT_UNIVERSE,
    load_tickers,
)

log = get_logger(__name__)


def _parse_env_date(key: str, default: date) -> date:
    raw = os.environ.get(key)
    if not raw:
        return default
    return date.fromisoformat(raw)


def main() -> int:
    universe_path = Path(os.environ.get("SEED_UNIVERSE", str(DEFAULT_UNIVERSE)))
    start = _parse_env_date("BACKTEST_START", date(2010, 1, 1))
    end = _parse_env_date("BACKTEST_END", date(2020, 12, 31))

    tickers = load_tickers(universe_path)
    pattern = by_name("wave_2_at_618")

    log.info(
        "backtest start",
        extra={
            "tickers": len(tickers),
            "start": start.isoformat(),
            "end": end.isoformat(),
            "universe_file": str(universe_path),
            "pattern": pattern.name,
        },
    )

    # No price_loader override — this hits Supabase via the qlib adapter,
    # which fans out to the prices_daily table.
    result = run_backtest(
        pattern=pattern,
        tickers=tickers,
        start=start,
        end=end,
        horizons_months=[3, 6, 12, 24],
        include_per_year=True,
        sample_size=10,
    )

    # Stat table (human-readable).
    print()
    print(f"=== backtest_pattern wave_2_at_618 ===")
    print(f"universe:     {len(tickers)} tickers ({universe_path.name})")
    print(f"window:       {start} .. {end}")
    print(f"signal_count: {len(result.signals)}")
    print()
    print("stats by horizon:")
    for h in result.stats:
        print(
            f"  {h.horizon_months:2d}m: n={h.sample_size:5d}  "
            f"hit_rate={h.hit_rate*100:5.1f}%  "
            f"median={h.median_return*100:+6.1f}%  "
            f"p25={h.p25_return*100:+6.1f}%  "
            f"p75={h.p75_return*100:+6.1f}%  "
            f"avg_dd={h.avg_max_drawdown*100:+6.1f}%"
        )

    print()
    print("first 10 sample signals:")
    for s in result.sample_signals[:10]:
        rets = " ".join(
            f"{h}m={(v or 0)*100:+5.1f}%" if v is not None else f"{h}m=  n/a"
            for h, v in sorted(s.forward_returns.items())
        )
        print(
            f"  {s.ticker:6s} {s.signal_date}  "
            f"close=${getattr(s, 'signal_close', 0.0):8.2f}  {rets}"
        )

    # Per-year breakdown.
    if result.per_year_breakdown:
        print()
        print("per-year breakdown (12-month horizon):")
        for yb in result.per_year_breakdown:
            if yb.horizon_months != 12:
                continue
            for row in yb.by_year:
                print(
                    f"  {row.year}  n={row.sample_size:3d}  "
                    f"hit_rate={row.hit_rate*100:5.1f}%  "
                    f"median={row.median_return*100:+6.1f}%"
                )

    # Machine-readable summary on the last line for easy log scraping.
    summary = {
        "tickers": len(tickers),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "signal_count": len(result.signals),
        "stats": [
            {
                "horizon_months": s.horizon_months,
                "n": s.sample_size,
                "hit_rate": s.hit_rate,
                "median_return": s.median_return,
                "p25_return": s.p25_return,
                "p75_return": s.p75_return,
                "avg_max_drawdown": s.avg_max_drawdown,
            }
            for s in result.stats
        ],
    }
    print()
    print(f"BACKTEST_RESULT_JSON={json.dumps(summary)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
