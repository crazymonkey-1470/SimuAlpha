"""Tool: cache-first daily OHLCV lookup.

Reads from Supabase `prices_daily` first; on full miss or a meaningful
gap at either end, backfills from OpenBB, upserts, and re-reads.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from simualpha_quant.data.openbb_ingest import (
    batch_upsert,
    fetch_prices_one,
)
from simualpha_quant.logging_config import get_logger
from simualpha_quant.schemas.prices import (
    PriceBar,
    PriceHistory,
    PriceHistoryRequest,
)
from simualpha_quant.supabase_client import get_client

log = get_logger(__name__)

# Weekends and holidays mean we can't require exact-date coverage. If the
# cached window is within this many calendar days of the requested edge
# we treat it as complete.
EDGE_TOLERANCE_DAYS = 5


def _read_cache(ticker: str, start: date, end: date) -> list[dict]:
    client = get_client()
    res = (
        client.table("prices_daily")
        .select("date,open,high,low,close,adj_close,volume,ingested_at")
        .eq("ticker", ticker)
        .gte("date", start.isoformat())
        .lte("date", end.isoformat())
        .order("date")
        .execute()
    )
    return res.data or []


def _bars_from_rows(rows: list[dict]) -> list[PriceBar]:
    bars: list[PriceBar] = []
    for r in rows:
        raw_date = r["date"]
        d = raw_date if isinstance(raw_date, date) else date.fromisoformat(str(raw_date)[:10])
        bars.append(
            PriceBar(
                date=d,
                open=_f(r.get("open")),
                high=_f(r.get("high")),
                low=_f(r.get("low")),
                close=_f(r.get("close")),
                adj_close=_f(r.get("adj_close")),
                volume=_i(r.get("volume")),
            )
        )
    return bars


def _f(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _i(v) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _parse_ingested_at(rows: list[dict]) -> datetime | None:
    if not rows:
        return None
    latest = max((r.get("ingested_at") for r in rows if r.get("ingested_at")), default=None)
    if latest is None:
        return None
    if isinstance(latest, datetime):
        return latest
    try:
        return datetime.fromisoformat(str(latest).replace("Z", "+00:00"))
    except ValueError:
        return None


def _coverage_gap(cached: list[dict], start: date, end: date) -> tuple[date, date] | None:
    """Return (gap_start, gap_end) needing a fetch, or None if cache is complete enough."""
    if not cached:
        return (start, end)

    cached_dates = sorted(
        date.fromisoformat(str(r["date"])[:10]) if not isinstance(r["date"], date) else r["date"]
        for r in cached
    )
    cmin, cmax = cached_dates[0], cached_dates[-1]

    missing_head = (cmin - start).days > EDGE_TOLERANCE_DAYS
    missing_tail = (end - cmax).days > EDGE_TOLERANCE_DAYS

    if missing_head and missing_tail:
        return (start, end)
    if missing_head:
        return (start, cmin - timedelta(days=1))
    if missing_tail:
        return (cmax + timedelta(days=1), end)
    return None


def get_price_history(req: PriceHistoryRequest) -> PriceHistory:
    ticker = req.ticker
    log.info(
        "tool get_price_history",
        extra={"ticker": ticker, "start": req.start.isoformat(), "end": req.end.isoformat()},
    )

    cached = _read_cache(ticker, req.start, req.end)
    gap = _coverage_gap(cached, req.start, req.end)

    if gap is None:
        return PriceHistory(
            ticker=ticker,
            start=req.start,
            end=req.end,
            bars=_bars_from_rows(cached),
            source="cache",
            cached_ingested_at=_parse_ingested_at(cached),
        )

    gap_start, gap_end = gap
    log.info(
        "cache miss/gap — backfilling from openbb",
        extra={
            "ticker": ticker,
            "gap_start": gap_start.isoformat(),
            "gap_end": gap_end.isoformat(),
            "cached_rows": len(cached),
        },
    )
    fetched = fetch_prices_one(ticker, gap_start.isoformat(), gap_end.isoformat())
    if fetched:
        batch_upsert(
            "prices_daily",
            [r.as_dict() for r in fetched],
            on_conflict="ticker,date",
        )

    rows = _read_cache(ticker, req.start, req.end)
    source = "cache+backfill" if cached else "openbb"
    return PriceHistory(
        ticker=ticker,
        start=req.start,
        end=req.end,
        bars=_bars_from_rows(rows),
        source=source,
        cached_ingested_at=_parse_ingested_at(rows),
    )
