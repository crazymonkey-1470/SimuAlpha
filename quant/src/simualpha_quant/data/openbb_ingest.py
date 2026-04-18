"""OpenBB-based ingestion into Supabase.

Two entry points:
- fetch_prices(tickers, start, end): upserts daily OHLCV into prices_daily.
- fetch_fundamentals(tickers): upserts the TLI-scoring metrics into
  fundamentals_quarterly.

Both use tenacity for exponential backoff (3 attempts) on transient failures
and batch Supabase writes in chunks of 1000 rows.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime
from typing import Iterable, Sequence

from dotenv import load_dotenv
from tenacity import (
    before_sleep_log,
    retry,
    stop_after_attempt,
    wait_exponential,
)

from simualpha_quant.logging_config import get_logger
from simualpha_quant.supabase_client import get_client

load_dotenv()

log = get_logger(__name__)

SOURCE = "openbb"
CHUNK_SIZE = 1000

# TLI-scoring metrics, mapped to the OpenBB fundamental field names we expect
# to find on income-statement / cash-flow / balance-sheet responses.
FUNDAMENTAL_METRICS: tuple[str, ...] = (
    "revenue",
    "ebitda",
    "free_cash_flow",
    "shares_outstanding",
    "total_debt",
    "cash",
    "gross_margin",
    "operating_margin",
    "net_income",
)


# ───────────────────────── retry decorator ─────────────────────────

_retry = retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    before_sleep=before_sleep_log(log, 30),  # WARNING
)


def _openbb_client():
    """Lazy import so tests that don't need OpenBB don't pay the import cost."""
    from openbb import obb

    pat = os.environ.get("OPENBB_PAT")
    if pat:
        try:
            obb.account.login(pat=pat)
        except Exception as exc:  # non-fatal; anonymous works for most price endpoints
            log.warning("openbb login failed, continuing anonymously", extra={"err": str(exc)})
    return obb


# ───────────────────────── helpers ─────────────────────────


def _to_iso_date(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value[:10]
    if isinstance(value, (datetime, date)):
        return value.isoformat()[:10]
    try:
        return str(value)[:10]
    except Exception:
        return None


def _chunked(rows: Sequence[dict], size: int = CHUNK_SIZE) -> Iterable[list[dict]]:
    for i in range(0, len(rows), size):
        yield list(rows[i : i + size])


@_retry
def _upsert(table: str, rows: list[dict], on_conflict: str) -> None:
    client = get_client()
    client.table(table).upsert(rows, on_conflict=on_conflict).execute()


def _batch_upsert(table: str, rows: Sequence[dict], on_conflict: str) -> int:
    if not rows:
        return 0
    written = 0
    for chunk in _chunked(rows):
        _upsert(table, chunk, on_conflict=on_conflict)
        written += len(chunk)
        log.info(
            "supabase upsert",
            extra={"table": table, "rows": len(chunk), "running_total": written},
        )
    return written


# ───────────────────────── prices ─────────────────────────


@dataclass(frozen=True)
class PriceRow:
    ticker: str
    date: str
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    adj_close: float | None
    volume: int | None

    def as_dict(self) -> dict:
        return {
            "ticker": self.ticker,
            "date": self.date,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "adj_close": self.adj_close,
            "volume": self.volume,
            "source": SOURCE,
        }


@_retry
def _fetch_prices_one(ticker: str, start: str, end: str) -> list[PriceRow]:
    obb = _openbb_client()
    log.info("openbb price fetch", extra={"ticker": ticker, "start": start, "end": end})
    resp = obb.equity.price.historical(
        symbol=ticker, start_date=start, end_date=end, provider="yfinance"
    )
    df = resp.to_df().reset_index()

    rows: list[PriceRow] = []
    for _, r in df.iterrows():
        rows.append(
            PriceRow(
                ticker=ticker,
                date=_to_iso_date(r.get("date")) or "",
                open=_num(r.get("open")),
                high=_num(r.get("high")),
                low=_num(r.get("low")),
                close=_num(r.get("close")),
                adj_close=_num(r.get("adj_close") if "adj_close" in r else r.get("close")),
                volume=_int(r.get("volume")),
            )
        )
    return [row for row in rows if row.date]


def _num(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
        if f != f:  # NaN
            return None
        return f
    except (TypeError, ValueError):
        return None


def _int(v) -> int | None:
    f = _num(v)
    if f is None:
        return None
    return int(f)


def fetch_prices(tickers: Sequence[str], start: str, end: str) -> int:
    """Fetch daily OHLCV for each ticker and upsert into prices_daily.

    Returns the total number of rows written.
    """
    total = 0
    for ticker in tickers:
        ticker = ticker.upper().strip()
        try:
            rows = _fetch_prices_one(ticker, start, end)
        except Exception as exc:
            log.exception("price fetch failed", extra={"ticker": ticker, "err": str(exc)})
            continue
        total += _batch_upsert(
            "prices_daily",
            [r.as_dict() for r in rows],
            on_conflict="ticker,date",
        )
    log.info("fetch_prices done", extra={"tickers": list(tickers), "rows": total})
    return total


# ───────────────────────── fundamentals ─────────────────────────


@dataclass(frozen=True)
class FundamentalRow:
    ticker: str
    period_end: str
    metric_name: str
    metric_value: float | None

    def as_dict(self) -> dict:
        return {
            "ticker": self.ticker,
            "period_end": self.period_end,
            "metric_name": self.metric_name,
            "metric_value": self.metric_value,
            "source": SOURCE,
        }


# Map our canonical metric names → possible OpenBB field names on the
# quarterly income statement, cash-flow, and balance-sheet frames.
_METRIC_FIELD_MAP: dict[str, tuple[str, ...]] = {
    "revenue": ("revenue", "total_revenue"),
    "ebitda": ("ebitda",),
    "free_cash_flow": ("free_cash_flow",),
    "shares_outstanding": (
        "weighted_average_shares_outstanding_diluted",
        "weighted_average_shares_outstanding",
        "shares_outstanding",
    ),
    "total_debt": ("total_debt", "long_term_debt"),
    "cash": ("cash_and_cash_equivalents", "cash"),
    "gross_margin": ("gross_margin", "gross_profit_margin"),
    "operating_margin": ("operating_margin", "operating_profit_margin"),
    "net_income": ("net_income",),
}


def _extract_metric(record: dict, candidates: tuple[str, ...]) -> float | None:
    for key in candidates:
        if key in record and record[key] is not None:
            return _num(record[key])
    return None


@_retry
def _fetch_statement(obb, call, symbol: str) -> list[dict]:
    """Call an OpenBB statement endpoint and return a list of row dicts."""
    resp = call(symbol=symbol, period="quarter", limit=20)
    df = resp.to_df().reset_index()
    return df.to_dict("records")


def _fetch_fundamentals_one(ticker: str) -> list[FundamentalRow]:
    obb = _openbb_client()
    log.info("openbb fundamentals fetch", extra={"ticker": ticker})

    by_period: dict[str, dict[str, float | None]] = {}

    def merge(records: list[dict]) -> None:
        for rec in records:
            period_end = _to_iso_date(rec.get("period_ending") or rec.get("date") or rec.get("period_end"))
            if not period_end:
                continue
            slot = by_period.setdefault(period_end, {})
            for metric, fields in _METRIC_FIELD_MAP.items():
                if metric in slot and slot[metric] is not None:
                    continue
                value = _extract_metric(rec, fields)
                if value is not None:
                    slot[metric] = value

    for call in (
        obb.equity.fundamental.income,
        obb.equity.fundamental.cash,
        obb.equity.fundamental.balance,
        obb.equity.fundamental.ratios,
    ):
        try:
            merge(_fetch_statement(obb, call, ticker))
        except Exception as exc:
            log.warning(
                "openbb statement call failed",
                extra={"ticker": ticker, "call": getattr(call, "__name__", str(call)), "err": str(exc)},
            )

    rows: list[FundamentalRow] = []
    for period_end, metrics in by_period.items():
        for metric_name in FUNDAMENTAL_METRICS:
            if metric_name not in metrics:
                continue
            rows.append(
                FundamentalRow(
                    ticker=ticker,
                    period_end=period_end,
                    metric_name=metric_name,
                    metric_value=metrics[metric_name],
                )
            )
    return rows


def fetch_fundamentals(tickers: Sequence[str]) -> int:
    """Fetch TLI-scoring quarterly metrics for each ticker and upsert.

    Returns the total number of rows written.
    """
    total = 0
    for ticker in tickers:
        ticker = ticker.upper().strip()
        try:
            rows = _fetch_fundamentals_one(ticker)
        except Exception as exc:
            log.exception("fundamentals fetch failed", extra={"ticker": ticker, "err": str(exc)})
            continue
        total += _batch_upsert(
            "fundamentals_quarterly",
            [r.as_dict() for r in rows],
            on_conflict="ticker,period_end,metric_name",
        )
    log.info("fetch_fundamentals done", extra={"tickers": list(tickers), "rows": total})
    return total
