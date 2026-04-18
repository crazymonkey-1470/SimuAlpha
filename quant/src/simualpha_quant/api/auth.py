"""Bearer-token auth against Supabase `api_keys` table.

Mirrors backend/middleware/auth.js:
- SHA-256 hash of the bearer token
- Supabase lookup keyed on `key_hash`, must be `is_active`, not expired
- Scope check ('quant:tools' or caller-specified scope)
- Per-minute in-memory rate limit

Additionally supports a break-glass `QUANT_SERVICE_BOOTSTRAP_TOKEN` env
var: if set and the inbound bearer token matches it verbatim, the request
is authorized as a synthetic 'bootstrap' key. A WARNING is logged every
time the bootstrap token is used so unintended reliance is visible.
"""

from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass
from typing import Callable

from fastapi import Request

from simualpha_quant.logging_config import get_logger

log = get_logger(__name__)

REQUIRED_SCOPE = "quant:tools"
BOOTSTRAP_ENV = "QUANT_SERVICE_BOOTSTRAP_TOKEN"
BOOTSTRAP_KEY_ID = "bootstrap"
BOOTSTRAP_KEY_NAME = "QUANT_SERVICE_BOOTSTRAP_TOKEN"
DEFAULT_RATE_LIMIT_PER_MINUTE = 60


@dataclass(frozen=True)
class AuthedKey:
    id: str
    name: str
    scopes: tuple[str, ...]
    rate_limit_per_minute: int
    is_bootstrap: bool = False


class AuthError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


# Per-process, per-key minute counters. Railway runs a single uvicorn
# worker per service by convention; fine for this scale.
_rate_state: dict[tuple[str, int], int] = {}


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _extract_bearer(request: Request) -> str:
    header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not header or not header.lower().startswith("bearer "):
        raise AuthError(401, "Missing or invalid Authorization header")
    return header.split(" ", 1)[1].strip()


def _check_bootstrap(token: str) -> AuthedKey | None:
    boot = os.environ.get(BOOTSTRAP_ENV)
    if not boot or token != boot:
        return None
    log.warning(
        "bootstrap token used — provision a scoped Supabase api_keys row",
        extra={"env": BOOTSTRAP_ENV},
    )
    return AuthedKey(
        id=BOOTSTRAP_KEY_ID,
        name=BOOTSTRAP_KEY_NAME,
        scopes=(REQUIRED_SCOPE,),
        rate_limit_per_minute=DEFAULT_RATE_LIMIT_PER_MINUTE,
        is_bootstrap=True,
    )


def _lookup_supabase(token: str) -> AuthedKey:
    from simualpha_quant.supabase_client import get_client

    client = get_client()
    res = (
        client.table("api_keys")
        .select("id,name,scopes,rate_limit_per_minute,is_active,expires_at")
        .eq("key_hash", _hash_token(token))
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise AuthError(401, "Invalid API key")
    row = rows[0]
    expires_at = row.get("expires_at")
    if expires_at and _is_expired(str(expires_at)):
        raise AuthError(401, "API key expired")
    scopes = tuple(row.get("scopes") or ())
    if REQUIRED_SCOPE not in scopes:
        raise AuthError(403, f"Requires scope: {REQUIRED_SCOPE}")
    return AuthedKey(
        id=str(row["id"]),
        name=str(row.get("name") or "unknown"),
        scopes=scopes,
        rate_limit_per_minute=int(row.get("rate_limit_per_minute") or DEFAULT_RATE_LIMIT_PER_MINUTE),
    )


def _is_expired(iso: str) -> bool:
    from datetime import datetime

    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return False
    return dt.timestamp() < time.time()


def _rate_limit(key: AuthedKey) -> None:
    window = int(time.time() // 60)
    cache_key = (key.id, window)
    count = _rate_state.get(cache_key, 0) + 1
    _rate_state[cache_key] = count
    if len(_rate_state) > 2000:  # cheap cleanup
        for k in list(_rate_state):
            if k[1] < window - 2:
                _rate_state.pop(k, None)
    if count > key.rate_limit_per_minute:
        retry_after = 60 - int(time.time()) % 60
        raise AuthError(429, f"Rate limit exceeded; retry after {retry_after}s")


def _touch_last_used(key_id: str, is_bootstrap: bool) -> None:
    if is_bootstrap:
        return
    try:
        from datetime import datetime, timezone

        from simualpha_quant.supabase_client import get_client

        client = get_client()
        client.table("api_keys").update(
            {"last_used_at": datetime.now(tz=timezone.utc).isoformat()}
        ).eq("id", key_id).execute()
    except Exception as exc:  # non-fatal
        log.warning("failed to update last_used_at", extra={"err": str(exc)})


async def require_auth(request: Request) -> AuthedKey:
    token = _extract_bearer(request)
    key = _check_bootstrap(token) or _lookup_supabase(token)
    _rate_limit(key)
    _touch_last_used(key.id, key.is_bootstrap)
    request.state.auth = key
    return key


def reset_rate_state() -> None:
    """Test hook — clear the process-local rate counter."""
    _rate_state.clear()


# Convenience type for FastAPI Depends(..).
AuthDependency = Callable[[Request], AuthedKey]
