import time
from typing import Any


class TTLCache:
    def __init__(self):
        self._store = {}

    def get(self, key: str) -> Any | None:
        if key not in self._store:
            return None
        value, expires_at = self._store[key]
        if time.time() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl_seconds: int):
        self._store[key] = (value, time.time() + ttl_seconds)

    def clear(self):
        self._store.clear()


universe_cache = TTLCache()
historical_cache = TTLCache()
fundamentals_cache = TTLCache()
