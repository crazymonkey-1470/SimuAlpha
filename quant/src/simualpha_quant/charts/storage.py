"""Supabase Storage adapter for the tli-charts bucket.

Path layout: charts/{ticker}/{timeframe}/{hash}.png
Bucket policy: public-read; writes service-role only via RLS on
storage.objects.

The bucket itself must be created out-of-band (one-time operator step
documented in the README). At runtime we never auto-create — if the
bucket is missing we raise a clear error so the failure is visible.
"""

from __future__ import annotations

from dataclasses import dataclass

from simualpha_quant.logging_config import get_logger

log = get_logger(__name__)

BUCKET = "tli-charts"
CONTENT_TYPE = "image/png"


def object_path(ticker: str, timeframe: str, hash_: str) -> str:
    return f"charts/{ticker.upper()}/{timeframe}/{hash_}.png"


@dataclass(frozen=True)
class StoredChart:
    url: str
    path: str


def _bucket():
    # Lazy import: keeps `from simualpha_quant.charts import storage`
    # cheap (no supabase / cryptography import on module load), so test
    # stubs that monkeypatch the public functions don't require the
    # full supabase stack to be importable.
    from simualpha_quant.supabase_client import get_client

    return get_client().storage.from_(BUCKET)


def chart_exists(ticker: str, timeframe: str, hash_: str) -> StoredChart | None:
    """Return the public URL for a cached chart, or None if not found."""
    path = object_path(ticker, timeframe, hash_)
    folder = "/".join(path.split("/")[:-1])
    filename = path.split("/")[-1]
    try:
        listing = _bucket().list(folder)
    except Exception as exc:
        log.warning("storage list failed", extra={"path": folder, "err": str(exc)})
        return None
    for entry in listing or []:
        if entry.get("name") == filename:
            return StoredChart(url=public_url(path), path=path)
    return None


def upload_chart(ticker: str, timeframe: str, hash_: str, png_bytes: bytes) -> StoredChart:
    """Upload a PNG, returning the public URL. Idempotent (upserts)."""
    path = object_path(ticker, timeframe, hash_)
    try:
        _bucket().upload(
            path=path,
            file=png_bytes,
            file_options={"content-type": CONTENT_TYPE, "upsert": "true"},
        )
    except Exception as exc:
        # supabase-py wraps duplicate uploads in an error when upsert is not honored;
        # treat "already exists" as success.
        msg = str(exc)
        if "Duplicate" not in msg and "already exists" not in msg:
            log.exception("storage upload failed", extra={"path": path})
            raise
    log.info("chart uploaded", extra={"path": path, "bytes": len(png_bytes)})
    return StoredChart(url=public_url(path), path=path)


def public_url(path: str) -> str:
    res = _bucket().get_public_url(path)
    # supabase-py returns either a string or {"data": {"publicUrl": ...}} depending on version.
    if isinstance(res, str):
        return res
    if isinstance(res, dict):
        data = res.get("data") or {}
        url = data.get("publicUrl") or res.get("publicUrl")
        if url:
            return url
    raise RuntimeError(f"unexpected get_public_url response: {res!r}")
