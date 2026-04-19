"""Universe resolver — named cohort → ticker list.

Stage-3 supports only the ``tracked_8500`` named cohort (read from the
Supabase ``universe`` table). The list is **snapshotted into memory on
startup** and refreshed every 15 minutes by a background asyncio task.
A forced refresh is exposed at ``POST /admin/reload-universe`` (auth
required).

Per-request enumerated tickers don't go through this module — the
backtest tool uses ``UniverseSpec.tickers`` directly.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Final

from simualpha_quant.logging_config import get_logger
from simualpha_quant.schemas.universe import NamedUniverse, UniverseSpec

log = get_logger(__name__)

REFRESH_INTERVAL_SECONDS: Final[int] = 15 * 60


@dataclass
class _Snapshot:
    tickers: tuple[str, ...] = ()
    refreshed_at: float = 0.0          # epoch seconds


_state: dict[str, _Snapshot] = {
    "tracked_8500": _Snapshot(),
}
_lock = asyncio.Lock()
_refresh_task: asyncio.Task | None = None


def _fetch_tracked_8500_sync() -> tuple[str, ...]:
    """Read the universe table. Lazy supabase import per Conventions Rule 2."""
    from simualpha_quant.supabase_client import get_client

    client = get_client()
    res = (
        client.table("universe")
        .select("ticker")
        .order("ticker")
        .execute()
    )
    rows = res.data or []
    out: list[str] = []
    for row in rows:
        t = (row.get("ticker") or "").strip().upper()
        if t:
            out.append(t)
    return tuple(out)


async def refresh(name: NamedUniverse = "tracked_8500") -> int:
    """Force-refresh a named universe snapshot. Returns the ticker count."""
    if name != "tracked_8500":
        raise ValueError(f"unknown named universe {name!r}")
    async with _lock:
        try:
            tickers = await asyncio.to_thread(_fetch_tracked_8500_sync)
        except Exception as exc:
            log.warning("universe refresh failed", extra={"name": name, "err": str(exc)})
            return len(_state[name].tickers)
        _state[name] = _Snapshot(tickers=tickers, refreshed_at=time.time())
        log.info("universe refreshed", extra={"name": name, "count": len(tickers)})
        return len(tickers)


def snapshot(name: NamedUniverse = "tracked_8500") -> _Snapshot:
    return _state[name]


def resolve(spec: UniverseSpec) -> list[str]:
    """Resolve a UniverseSpec to a concrete ticker list."""
    if spec.tickers is not None:
        return list(spec.tickers)
    if spec.universe == "tracked_8500":
        return list(_state["tracked_8500"].tickers)
    raise ValueError(f"cannot resolve UniverseSpec: {spec!r}")


# ─────────────────────────── background refresher ──────────────────────


async def _refresher_loop() -> None:
    while True:
        try:
            await refresh("tracked_8500")
        except Exception as exc:
            log.warning("universe refresher loop error", extra={"err": str(exc)})
        await asyncio.sleep(REFRESH_INTERVAL_SECONDS)


def start_refresher() -> asyncio.Task:
    """Launch the background refresher. Idempotent: returns existing task."""
    global _refresh_task
    if _refresh_task is not None and not _refresh_task.done():
        return _refresh_task
    _refresh_task = asyncio.create_task(_refresher_loop(), name="universe-refresher")
    return _refresh_task


def stop_refresher() -> None:
    global _refresh_task
    if _refresh_task is not None:
        _refresh_task.cancel()
        _refresh_task = None
