"""Singleton Supabase client using the service-role key.

The supabase package is imported INSIDE `get_client()`, never at
module load. See README "Conventions" for the lazy-import rule.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any

from dotenv import load_dotenv

if TYPE_CHECKING:  # pragma: no cover
    from supabase import Client

load_dotenv()

_client: Any = None


def get_client() -> "Client":
    global _client
    if _client is not None:
        return _client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment"
        )

    # Lazy import — keeps the supabase / gotrue / cryptography chain
    # off the module-load critical path.
    from supabase import create_client

    _client = create_client(url, key)
    return _client
