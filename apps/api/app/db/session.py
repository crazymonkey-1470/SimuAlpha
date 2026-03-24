"""Database engine and session management."""

import logging
import socket
from urllib.parse import urlparse

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)

_SQLITE_FALLBACK_URL = "sqlite:///./simualpha_dev.db"


def _can_reach_host(url: str, timeout: float = 3.0) -> bool:
    """Check if the database host is reachable over the network."""
    parsed = urlparse(url)
    host = parsed.hostname
    port = parsed.port or 5432
    if not host or host in ("localhost", "127.0.0.1", "::1"):
        return True
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.close()
        return True
    except (OSError, socket.timeout):
        return False


def _build_engine():
    """Create the SQLAlchemy engine, falling back to SQLite if PostgreSQL is unreachable."""
    url = settings.database_url
    if url.startswith("postgresql"):
        if not _can_reach_host(url):
            logger.warning(
                "PostgreSQL host is unreachable — falling back to local SQLite database. "
                "Set SIMUALPHA_DATABASE_URL to a reachable PostgreSQL instance for production use."
            )
            return create_engine(
                _SQLITE_FALLBACK_URL,
                connect_args={"check_same_thread": False},
                echo=settings.debug,
            )
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        echo=settings.debug,
    )


engine = _build_engine()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> "Session":
    """Yield a database session for FastAPI dependency injection."""
    db = SessionLocal()
    try:
        yield db  # type: ignore[misc]
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
