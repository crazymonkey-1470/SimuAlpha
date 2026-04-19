"""Supabase ↔ qlib data layer.

Stage-3 design split: qlib is **storage only**. Pattern detection lives
in pure Python (``research.waves`` + ``research.patterns``); qlib's
expression DSL is too thin for stateful Elliott Wave logic. We use
qlib's binary format for cheap O(1) OHLCV loading by date range, and
its instruments / calendars files for universe management.

Key entry points:

- ``convert_supabase_to_qlib(out_dir, tickers, start, end)`` — pulls
  ``prices_daily`` rows for the requested tickers and date window from
  Supabase, writes qlib binary files. Idempotent; appends only what's
  new since the last export.

- ``ensure_universe_current(out_dir, tickers, end_date)`` — convenience
  wrapper invoked by the backtest tool: refreshes any ticker missing
  from the qlib store or behind ``end_date`` by 1+ trading days.

- ``load_prices(out_dir, ticker, start, end)`` — reads OHLCV back as a
  ``pandas.DataFrame`` indexed by date. Pattern detectors take this
  shape directly.

CONVENTION: ``qlib`` and ``supabase`` are imported lazily inside
functions, never at module load.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
import pandas as pd

from simualpha_quant.logging_config import get_logger

log = get_logger(__name__)

# qlib's binary day file format:
#  - 4-byte little-endian uint32 for the start-date offset (relative to
#    calendar index 0)
#  - then n * 4-byte little-endian float32 values
#
# Reference: https://qlib.readthedocs.io/en/latest/component/data.html
_HEADER_FMT = "<I"
_HEADER_SIZE = 4
_VALUE_FMT = "<f"
_VALUE_SIZE = 4

# Fields we materialize from prices_daily into qlib binaries.
_FIELDS: tuple[str, ...] = ("open", "high", "low", "close", "volume", "factor")


# ─────────────────────────── paths + meta ───────────────────────────


def default_qlib_root() -> Path:
    import os

    p = os.environ.get("QLIB_DATA_DIR")
    if p:
        return Path(p).expanduser()
    return Path.home() / ".simualpha_quant" / "qlib_data"


@dataclass(frozen=True)
class QlibPaths:
    root: Path

    @property
    def calendars_dir(self) -> Path: return self.root / "calendars"
    @property
    def instruments_dir(self) -> Path: return self.root / "instruments"
    @property
    def features_dir(self) -> Path: return self.root / "features"
    @property
    def calendar_file(self) -> Path: return self.calendars_dir / "day.txt"
    @property
    def all_instruments_file(self) -> Path: return self.instruments_dir / "all.txt"
    @property
    def meta_file(self) -> Path: return self.root / "_meta.json"

    def ticker_dir(self, ticker: str) -> Path:
        return self.features_dir / ticker.lower()

    def feature_file(self, ticker: str, field: str) -> Path:
        return self.ticker_dir(ticker) / f"{field}.day.bin"

    def ensure_dirs(self) -> None:
        for d in (self.calendars_dir, self.instruments_dir, self.features_dir):
            d.mkdir(parents=True, exist_ok=True)


def _read_meta(paths: QlibPaths) -> dict:
    if not paths.meta_file.exists():
        return {"tickers": {}, "calendar": {"start": None, "end": None}}
    return json.loads(paths.meta_file.read_text())


def _write_meta(paths: QlibPaths, meta: dict) -> None:
    paths.meta_file.write_text(json.dumps(meta, indent=2, default=str))


# ─────────────────────────── calendar / instruments ─────────────────────


# Calendar anchor — the global qlib calendar always starts here. Never
# shifts. Extending the calendar to cover a later end date appends
# without changing the offset of any previously-written binary.
CALENDAR_ANCHOR_DATE: date = date(2000, 1, 1)


def _build_business_day_calendar(start: date, end: date) -> list[date]:
    """A simple business-day calendar (Mon–Fri, no holiday filter).

    qlib expects all features to share a single calendar. Real trading
    days are sparser than this but using business days avoids a holiday
    feed dependency; missing dates simply have repeated prior-close
    values via forward-fill at load time. For backtest accuracy we
    align to the pandas-resampled bdate_range.
    """
    return [d.date() for d in pd.bdate_range(start, end)]


def _resolve_calendar(existing: list[date], requested_end: date) -> list[date]:
    """Calendar extension policy: anchor at CALENDAR_ANCHOR_DATE; never
    shrink; extend the END to whichever is later (existing tail or
    requested end).
    """
    end = requested_end
    if existing:
        end = max(end, existing[-1])
    return _build_business_day_calendar(CALENDAR_ANCHOR_DATE, end)


def _write_calendar(paths: QlibPaths, calendar: Sequence[date]) -> None:
    paths.calendars_dir.mkdir(parents=True, exist_ok=True)
    paths.calendar_file.write_text("\n".join(d.isoformat() for d in calendar) + "\n")


def _write_instruments(paths: QlibPaths, tickers: Iterable[str]) -> None:
    paths.instruments_dir.mkdir(parents=True, exist_ok=True)
    # qlib expects: <symbol>\t<start_date>\t<end_date>
    cal = _read_calendar(paths)
    if not cal:
        return
    s, e = cal[0].isoformat(), cal[-1].isoformat()
    lines = [f"{t.lower()}\t{s}\t{e}" for t in sorted(set(tickers))]
    paths.all_instruments_file.write_text("\n".join(lines) + "\n")


def _read_calendar(paths: QlibPaths) -> list[date]:
    if not paths.calendar_file.exists():
        return []
    return [date.fromisoformat(line.strip()) for line in paths.calendar_file.read_text().splitlines() if line.strip()]


# ─────────────────────────── binary I/O ─────────────────────────────────


def _write_binary(path: Path, start_offset: int, values: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if values.dtype != np.float32:
        values = values.astype(np.float32)
    with path.open("wb") as f:
        f.write(struct.pack(_HEADER_FMT, start_offset))
        f.write(values.tobytes(order="C"))


def _read_binary(path: Path) -> tuple[int, np.ndarray]:
    """Return (start_offset, values)."""
    if not path.exists():
        return 0, np.empty(0, dtype=np.float32)
    raw = path.read_bytes()
    if len(raw) < _HEADER_SIZE:
        return 0, np.empty(0, dtype=np.float32)
    start = struct.unpack(_HEADER_FMT, raw[:_HEADER_SIZE])[0]
    arr = np.frombuffer(raw[_HEADER_SIZE:], dtype=np.float32)
    return start, arr


# ─────────────────────────── Supabase fetch ─────────────────────────────


def _fetch_prices_from_supabase(ticker: str, start: date, end: date) -> pd.DataFrame:
    from simualpha_quant.supabase_client import get_client  # lazy import

    client = get_client()
    res = (
        client.table("prices_daily")
        .select("date,open,high,low,close,adj_close,volume")
        .eq("ticker", ticker.upper())
        .gte("date", start.isoformat())
        .lte("date", end.isoformat())
        .order("date")
        .execute()
    )
    rows = res.data or []
    if not rows:
        return pd.DataFrame(
            columns=["date", "open", "high", "low", "close", "adj_close", "volume"]
        )
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").reset_index(drop=True)


# ─────────────────────────── core export ────────────────────────────────


def convert_supabase_to_qlib(
    out_dir: Path | str | None,
    tickers: Sequence[str],
    start: date,
    end: date,
    *,
    fetcher=None,
) -> dict:
    """Materialize prices_daily into qlib binary format. Idempotent.

    Args:
        out_dir: qlib data root. Default = ``default_qlib_root()``.
        tickers: tickers to (re)export.
        start, end: inclusive date range.
        fetcher: optional callable ``(ticker, start, end) -> DataFrame``
                 with columns ``date,open,high,low,close,adj_close,volume``.
                 Defaults to the live Supabase fetcher; passed in by tests.

    Returns:
        ``{tickers_written, rows_written, calendar_size}``.
    """
    paths = QlibPaths(root=Path(out_dir) if out_dir else default_qlib_root())
    paths.ensure_dirs()
    fetch = fetcher or _fetch_prices_from_supabase

    # Calendar starts at CALENDAR_ANCHOR_DATE and only ever extends. This
    # keeps every existing binary's start_offset valid across runs.
    existing_calendar = _read_calendar(paths)
    calendar = _resolve_calendar(existing_calendar, end)
    if not calendar:
        return {"tickers_written": 0, "rows_written": 0, "calendar_size": 0}
    _write_calendar(paths, calendar)
    cal_index = {d: i for i, d in enumerate(calendar)}

    meta = _read_meta(paths)
    rows_total = 0
    tickers_written = 0

    for ticker in sorted({t.upper() for t in tickers}):
        ticker_meta = meta["tickers"].get(ticker, {})
        last_exported = ticker_meta.get("end")
        # Incremental: pick the later of (last_exported+1, requested start).
        fetch_from = start
        if last_exported:
            try:
                next_day = date.fromisoformat(str(last_exported)[:10]) + timedelta(days=1)
                if next_day > start:
                    fetch_from = next_day
            except ValueError:
                pass
        if fetch_from > end:
            continue

        df = fetch(ticker, fetch_from, end)
        if df.empty:
            log.info("qlib export skip", extra={"ticker": ticker, "rows": 0})
            continue

        # Align to calendar (forward-fill missing days).
        df = df.set_index(pd.to_datetime(df["date"]).dt.date).drop(columns=["date"])
        df = df.reindex(calendar).ffill()
        # Compute the qlib "factor" column (adj_close / close).
        if "adj_close" in df.columns:
            with np.errstate(divide="ignore", invalid="ignore"):
                df["factor"] = (df["adj_close"] / df["close"]).fillna(1.0)
        else:
            df["factor"] = 1.0
        df["volume"] = df.get("volume", pd.Series(0, index=df.index)).fillna(0)

        # Find the first non-NaN row → start_offset for the binary header.
        first_valid = df["close"].first_valid_index()
        if first_valid is None:
            continue
        start_offset = cal_index[first_valid]
        slice_ = df.loc[first_valid:end]

        for field in _FIELDS:
            arr = slice_[field].astype(float).fillna(0.0).to_numpy(dtype=np.float32)
            _write_binary(paths.feature_file(ticker, field), start_offset, arr)

        rows_total += len(slice_)
        tickers_written += 1
        meta["tickers"][ticker] = {
            "start": (ticker_meta.get("start") or first_valid.isoformat()),
            "end": end.isoformat(),
            "rows": int(len(slice_)),
        }
        log.info(
            "qlib export wrote",
            extra={"ticker": ticker, "rows": int(len(slice_)), "start_offset": start_offset},
        )

    meta["calendar"] = {"start": calendar[0].isoformat(), "end": calendar[-1].isoformat()}
    _write_meta(paths, meta)
    _write_instruments(paths, list(meta["tickers"].keys()))

    return {
        "tickers_written": tickers_written,
        "rows_written": rows_total,
        "calendar_size": len(calendar),
    }


# ─────────────────────────── ensure + load ──────────────────────────────


def ensure_universe_current(
    out_dir: Path | str | None,
    tickers: Sequence[str],
    end_date: date,
    *,
    history_years: int = 10,
    fetcher=None,
) -> dict:
    """Make sure each ticker is exported through ``end_date``.

    History defaults to 10 years before ``end_date`` so backtests with
    multi-year windows have enough warm-up for the 200-week MA. Tickers
    already current are skipped.
    """
    paths = QlibPaths(root=Path(out_dir) if out_dir else default_qlib_root())
    meta = _read_meta(paths)

    needs_export: list[str] = []
    for t in {t.upper() for t in tickers}:
        m = meta["tickers"].get(t)
        if not m:
            needs_export.append(t)
            continue
        cur_end = date.fromisoformat(str(m.get("end"))[:10]) if m.get("end") else None
        if cur_end is None or cur_end < end_date:
            needs_export.append(t)

    if not needs_export:
        return {"tickers_written": 0, "rows_written": 0, "skipped": len(tickers)}

    start = end_date - timedelta(days=history_years * 365 + 30)
    return convert_supabase_to_qlib(out_dir, needs_export, start, end_date, fetcher=fetcher)


def load_prices(
    out_dir: Path | str | None,
    ticker: str,
    start: date,
    end: date,
) -> pd.DataFrame:
    """Read OHLCV from the qlib store as a pandas DataFrame.

    Returns columns ``open, high, low, close, volume`` indexed by date.
    Empty DataFrame if the ticker / range is missing.
    """
    paths = QlibPaths(root=Path(out_dir) if out_dir else default_qlib_root())
    calendar = _read_calendar(paths)
    if not calendar:
        return pd.DataFrame()

    cal_idx = pd.DatetimeIndex(pd.to_datetime(calendar))
    series_data: dict[str, np.ndarray] = {}
    base_offset: int | None = None
    n_max = 0
    for field in ("open", "high", "low", "close", "volume"):
        offset, arr = _read_binary(paths.feature_file(ticker, field))
        if base_offset is None:
            base_offset = offset
        series_data[field] = arr
        n_max = max(n_max, len(arr))

    if base_offset is None or n_max == 0:
        return pd.DataFrame()

    aligned: dict[str, np.ndarray] = {}
    for field, arr in series_data.items():
        if len(arr) < n_max:
            pad = np.full(n_max - len(arr), np.nan, dtype=np.float32)
            arr = np.concatenate([arr, pad])
        aligned[field] = arr

    end_offset = base_offset + n_max
    if end_offset > len(cal_idx):
        end_offset = len(cal_idx)
    cal_slice = cal_idx[base_offset:end_offset]
    df = pd.DataFrame(
        {f: aligned[f][: len(cal_slice)] for f in aligned}, index=cal_slice
    )
    df.index.name = "date"

    mask = (df.index >= pd.Timestamp(start)) & (df.index <= pd.Timestamp(end))
    return df.loc[mask]


# ─────────────────────────── stub passthrough ───────────────────────────


# Backwards-compat stub from the Stage-2 placeholder. Will be removed
# once the Stage 3 backtest tool is fully integrated.
def export_qlib_dataset(*args, **kwargs):  # noqa: D401
    """Deprecated alias — call convert_supabase_to_qlib() instead."""
    return convert_supabase_to_qlib(*args, **kwargs)


def run_backtest(*args, **kwargs):  # noqa: D401
    """Deprecated stub — superseded by tools.backtest_pattern.backtest_pattern()."""
    raise NotImplementedError(
        "Use simualpha_quant.tools.backtest_pattern.backtest_pattern() instead."
    )
