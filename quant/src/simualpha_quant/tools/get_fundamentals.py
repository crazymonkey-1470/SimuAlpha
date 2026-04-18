"""Tool: cache-first quarterly fundamentals lookup.

Reads from Supabase `fundamentals_quarterly` first; on miss or stale
cache (latest period_end older than one quarter), backfills from
OpenBB, upserts, and re-reads. Filters to the requested metrics.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from simualpha_quant.data.openbb_ingest import (
    batch_upsert,
    fetch_fundamentals_one,
)
from simualpha_quant.logging_config import get_logger
from simualpha_quant.schemas.fundamentals import (
    TLI_METRICS,
    FundamentalRecord,
    Fundamentals,
    FundamentalsRequest,
)

log = get_logger(__name__)

# A single quarter, rounded up. If our newest period_end is older than this
# we refresh from OpenBB.
STALE_AFTER_DAYS = 100


def _read_cache(ticker: str, metrics: list[str]) -> list[dict]:
    from simualpha_quant.supabase_client import get_client

    client = get_client()
    query = (
        client.table("fundamentals_quarterly")
        .select("period_end,metric_name,metric_value,source,ingested_at")
        .eq("ticker", ticker)
        .in_("metric_name", metrics)
        .order("period_end", desc=True)
        .order("metric_name")
    )
    res = query.execute()
    return res.data or []


def _records_from_rows(rows: list[dict]) -> list[FundamentalRecord]:
    out: list[FundamentalRecord] = []
    for r in rows:
        pe = r["period_end"]
        pe_date = pe if isinstance(pe, date) else date.fromisoformat(str(pe)[:10])

        ia = r.get("ingested_at")
        ingested_at: datetime | None = None
        if ia is not None:
            if isinstance(ia, datetime):
                ingested_at = ia
            else:
                try:
                    ingested_at = datetime.fromisoformat(str(ia).replace("Z", "+00:00"))
                except ValueError:
                    ingested_at = None

        value = r.get("metric_value")
        try:
            value_f = float(value) if value is not None else None
        except (TypeError, ValueError):
            value_f = None

        out.append(
            FundamentalRecord(
                period_end=pe_date,
                metric_name=str(r["metric_name"]),
                metric_value=value_f,
                source=r.get("source"),
                ingested_at=ingested_at,
            )
        )
    return out


def _latest_period_end(records: list[FundamentalRecord]) -> date | None:
    if not records:
        return None
    return max(r.period_end for r in records)


def _is_stale(records: list[FundamentalRecord]) -> bool:
    latest = _latest_period_end(records)
    if latest is None:
        return True
    age = (datetime.now(tz=timezone.utc).date() - latest).days
    return age > STALE_AFTER_DAYS


def get_fundamentals(req: FundamentalsRequest) -> Fundamentals:
    ticker = req.ticker
    metrics = list(req.metrics) if req.metrics else list(TLI_METRICS)

    log.info("tool get_fundamentals", extra={"ticker": ticker, "metrics": metrics})

    cached_rows = _read_cache(ticker, metrics)
    records = _records_from_rows(cached_rows)

    if records and not _is_stale(records):
        return Fundamentals(
            ticker=ticker,
            records=records,
            source="cache",
            latest_period_end=_latest_period_end(records),
        )

    log.info(
        "cache miss/stale — backfilling fundamentals from openbb",
        extra={"ticker": ticker, "cached_records": len(records)},
    )
    fetched = fetch_fundamentals_one(ticker)
    if fetched:
        batch_upsert(
            "fundamentals_quarterly",
            [r.as_dict() for r in fetched],
            on_conflict="ticker,period_end,metric_name",
        )

    fresh_rows = _read_cache(ticker, metrics)
    fresh_records = _records_from_rows(fresh_rows)
    source = "cache+backfill" if cached_rows else "openbb"
    return Fundamentals(
        ticker=ticker,
        records=fresh_records,
        source=source,
        latest_period_end=_latest_period_end(fresh_records),
    )
