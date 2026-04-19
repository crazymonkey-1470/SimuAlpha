"""qlib adapter round-trip test — synthetic fetcher, real binary I/O."""

from __future__ import annotations

import tempfile
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from simualpha_quant.research.qlib_adapter import (
    CALENDAR_ANCHOR_DATE,
    convert_supabase_to_qlib,
    ensure_universe_current,
    load_prices,
)


def _fake_fetch(ticker: str, start: date, end: date) -> pd.DataFrame:
    idx = pd.date_range(start, end, freq="B")
    n = len(idx)
    return pd.DataFrame(
        {
            "date":  idx,
            "open":  np.linspace(100, 130, n),
            "high":  np.linspace(101, 131, n),
            "low":   np.linspace(99, 129, n),
            "close": np.linspace(100, 130, n),
            "adj_close": np.linspace(100, 130, n),
            "volume": [1_000_000] * n,
        }
    )


def test_first_export_writes_binaries_and_meta():
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp)
        res = convert_supabase_to_qlib(
            out, ["HIMS", "NKE"], date(2024, 1, 1), date(2024, 3, 31), fetcher=_fake_fetch
        )
        assert res["tickers_written"] == 2
        assert (out / "features" / "hims" / "close.day.bin").exists()
        assert (out / "calendars" / "day.txt").exists()
        assert (out / "instruments" / "all.txt").exists()
        assert (out / "_meta.json").exists()


def test_idempotent_reexport_writes_zero_rows():
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp)
        convert_supabase_to_qlib(
            out, ["HIMS"], date(2024, 1, 1), date(2024, 3, 31), fetcher=_fake_fetch
        )
        res = convert_supabase_to_qlib(
            out, ["HIMS"], date(2024, 1, 1), date(2024, 3, 31), fetcher=_fake_fetch
        )
        assert res["rows_written"] == 0


def test_ensure_universe_current_skips_current_tickers():
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp)
        # Seed with HIMS through 2024-03-31.
        convert_supabase_to_qlib(
            out, ["HIMS"], date(2024, 1, 1), date(2024, 3, 31), fetcher=_fake_fetch
        )
        res = ensure_universe_current(
            out, ["HIMS", "NKE"], date(2024, 3, 31), fetcher=_fake_fetch
        )
        assert res["tickers_written"] == 1  # only NKE


def test_load_prices_roundtrips_cleanly():
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp)
        convert_supabase_to_qlib(
            out, ["HIMS"], date(2024, 1, 1), date(2024, 3, 31), fetcher=_fake_fetch
        )
        df = load_prices(out, "HIMS", date(2024, 1, 1), date(2024, 3, 31))
        assert not df.empty
        assert list(df.columns) == ["open", "high", "low", "close", "volume"]
        assert abs(df["close"].iloc[0] - 100.0) < 1e-5
        assert abs(df["close"].iloc[-1] - 130.0) < 1e-5


def test_calendar_never_shrinks_when_range_changes():
    """Regression: adding a ticker with 10y history must not invalidate
    the first ticker's start_offset."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp)
        convert_supabase_to_qlib(
            out, ["HIMS"], date(2024, 1, 1), date(2024, 3, 31), fetcher=_fake_fetch
        )
        # Add TSLA with 10y of history (ensure_universe default).
        ensure_universe_current(
            out, ["HIMS", "TSLA"], date(2024, 3, 31), fetcher=_fake_fetch
        )
        # HIMS reads must still produce its 2024-Q1 data.
        df = load_prices(out, "HIMS", date(2024, 1, 1), date(2024, 3, 31))
        assert len(df) > 0
        assert abs(df["close"].iloc[0] - 100.0) < 1e-5


def test_calendar_starts_at_anchor():
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp)
        convert_supabase_to_qlib(
            out, ["HIMS"], date(2024, 1, 1), date(2024, 3, 31), fetcher=_fake_fetch
        )
        cal = (out / "calendars" / "day.txt").read_text().splitlines()
        # First entry is the first business day on or after the anchor.
        first = date.fromisoformat(cal[0])
        anchor = CALENDAR_ANCHOR_DATE
        assert (first - anchor).days <= 3  # anchor (Sat 2000-01-01) → Mon 01-03
        assert first.weekday() < 5  # weekday
