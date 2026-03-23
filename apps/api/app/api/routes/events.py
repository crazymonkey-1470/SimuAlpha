"""Server-Sent Events endpoint for real-time simulation progress."""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter
from starlette.requests import Request
from starlette.responses import StreamingResponse

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory event bus: channel -> list of asyncio.Queue
_subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)


def publish_event(channel: str, event_type: str, data: dict) -> None:
    """Publish an event to all subscribers on a channel.

    Call this from simulation/job code to push progress updates.
    """
    payload = {
        "type": event_type,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    for queue in _subscribers.get(channel, []):
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            pass  # Drop if subscriber is slow


async def _event_generator(request: Request, channel: str):
    """SSE generator that yields events from the channel."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers[channel].append(queue)
    try:
        # Send initial connection event
        yield f"event: connected\ndata: {json.dumps({'channel': channel})}\n\n"

        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield f"event: {event['type']}\ndata: {json.dumps(event['data'])}\n\n"
            except asyncio.TimeoutError:
                # Send keepalive
                yield f": keepalive\n\n"
    finally:
        _subscribers[channel].remove(queue)
        if not _subscribers[channel]:
            del _subscribers[channel]


@router.get("/stream/{channel}")
async def event_stream(request: Request, channel: str):
    """Subscribe to real-time events on a channel.

    Channels:
    - `simulation`: Simulation run progress (regime computed, actors computed, etc.)
    - `jobs`: Job lifecycle events (queued, started, completed, failed)
    - `system`: System-level events (data refresh, calibration)
    - `simulation:{run_id}`: Events for a specific simulation run

    Returns a text/event-stream with events:
    - `connected`: Initial connection confirmation
    - `progress`: Step-by-step simulation progress
    - `completed`: Job/simulation completed
    - `failed`: Job/simulation failed
    - `status_update`: System status changed
    """
    return StreamingResponse(
        _event_generator(request, channel),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
