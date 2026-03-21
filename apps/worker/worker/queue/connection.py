"""Redis connection and RQ queue setup for SimuAlpha."""

from __future__ import annotations

import redis
from rq import Queue

from worker.core.config import get_settings
from worker.core.logging import get_logger

log = get_logger("queue.connection")

_redis_conn: redis.Redis | None = None

# Queue names
QUEUE_DEFAULT = "simualpha"
QUEUE_SIMULATION = "simualpha:simulation"
QUEUE_REPLAY = "simualpha:replay"
QUEUE_CALIBRATION = "simualpha:calibration"
QUEUE_MAINTENANCE = "simualpha:maintenance"


def get_redis() -> redis.Redis:
    """Get or create the Redis connection."""
    global _redis_conn
    if _redis_conn is None:
        settings = get_settings()
        url = settings.redis_url or "redis://localhost:6379/0"
        _redis_conn = redis.Redis.from_url(url, decode_responses=False)
        log.info("Redis connected: %s", url)
    return _redis_conn


def get_queue(name: str = QUEUE_DEFAULT) -> Queue:
    """Get an RQ queue by name."""
    return Queue(name, connection=get_redis())


def get_all_queues() -> list[Queue]:
    """Get all SimuAlpha queues."""
    conn = get_redis()
    return [Queue(name, connection=conn) for name in [
        QUEUE_SIMULATION,
        QUEUE_REPLAY,
        QUEUE_CALIBRATION,
        QUEUE_MAINTENANCE,
    ]]


def ping_redis() -> bool:
    """Check if Redis is reachable."""
    try:
        return get_redis().ping()
    except Exception:
        return False
