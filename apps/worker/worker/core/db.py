"""Database session management for the worker service.

Shares the same schema as apps/api — both connect to the same Postgres instance.
"""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from worker.core.config import get_settings

_engine = None
_SessionLocal = None


def _init() -> None:
    global _engine, _SessionLocal
    settings = get_settings()
    _engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=3,
        max_overflow=5,
    )
    _SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)


def get_session() -> Session:
    """Get a new database session."""
    if _SessionLocal is None:
        _init()
    return _SessionLocal()  # type: ignore[misc]
