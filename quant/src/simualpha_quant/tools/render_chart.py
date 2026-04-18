"""Tool: render_tli_chart — content-addressed, cache-first.

Hashes the request spec, checks Supabase Storage for an existing PNG at
charts/{ticker}/{timeframe}/{hash}.png, and either returns the cached
URL or renders + uploads a fresh one.

OpenClaw composes annotations; we render them faithfully.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from simualpha_quant.charts import storage, tli_renderer
from simualpha_quant.logging_config import get_logger
from simualpha_quant.schemas.charts import RenderChartRequest, RenderChartResponse

log = get_logger(__name__)

SCHEMA_VERSION = 1


def spec_hash(req: RenderChartRequest) -> str:
    payload = {
        "schema_version": SCHEMA_VERSION,
        "ticker": req.ticker,
        "timeframe": req.timeframe,
        "date_range": {
            "start": req.date_range.start.isoformat(),
            "end": req.date_range.end.isoformat(),
        },
        "annotations": req.annotations.model_dump(mode="json"),
        "config": req.config.model_dump(mode="json"),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def _index_row(req: RenderChartRequest, h: str, url: str) -> dict:
    return {
        "hash": h,
        "ticker": req.ticker,
        "timeframe": req.timeframe,
        "url": url,
        "width": req.config.width,
        "height": req.config.height,
        "request_spec": {
            "schema_version": SCHEMA_VERSION,
            "date_range": {
                "start": req.date_range.start.isoformat(),
                "end": req.date_range.end.isoformat(),
            },
            "annotations": req.annotations.model_dump(mode="json"),
            "config": req.config.model_dump(mode="json"),
        },
    }


def _record_index(req: RenderChartRequest, h: str, url: str) -> None:
    """Best-effort upsert into tli_charts_index. Failures don't break renders."""
    try:
        from simualpha_quant.supabase_client import get_client

        get_client().table("tli_charts_index").upsert(
            _index_row(req, h, url), on_conflict="hash"
        ).execute()
    except Exception as exc:
        log.warning("tli_charts_index upsert failed", extra={"hash": h, "err": str(exc)})


def render_tli_chart(req: RenderChartRequest) -> RenderChartResponse:
    h = spec_hash(req)
    log.info(
        "tool render_tli_chart",
        extra={"ticker": req.ticker, "timeframe": req.timeframe, "hash": h},
    )

    cached = storage.chart_exists(req.ticker, req.timeframe, h)
    if cached is not None:
        return RenderChartResponse(
            url=cached.url,
            cached=True,
            hash=h,
            width=req.config.width,
            height=req.config.height,
            generated_at=datetime.now(tz=timezone.utc),
        )

    png_bytes = tli_renderer.render(req)
    stored = storage.upload_chart(req.ticker, req.timeframe, h, png_bytes)
    _record_index(req, h, stored.url)

    return RenderChartResponse(
        url=stored.url,
        cached=False,
        hash=h,
        width=req.config.width,
        height=req.config.height,
        generated_at=datetime.now(tz=timezone.utc),
    )
