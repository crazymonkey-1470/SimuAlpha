"""Database engine and session management."""

import ipaddress
import socket
from urllib.parse import urlparse

import psycopg2
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def _resolve_ipv4(host: str) -> str | None:
    """Resolve hostname to an IPv4 address, skipping IPv6."""
    try:
        results = socket.getaddrinfo(host, None, socket.AF_INET)
        if results:
            return results[0][4][0]
    except socket.gaierror:
        pass
    return None


def _ipv4_creator() -> psycopg2.extensions.connection:
    """Custom connection creator that forces IPv4 for Supabase hosts."""
    parsed = urlparse(settings.database_url)
    host = parsed.hostname or "localhost"
    ipv4 = _resolve_ipv4(host)
    connect_args: dict = {}
    if ipv4:
        connect_args["hostaddr"] = ipv4
    # Build the DSN from the original URL
    return psycopg2.connect(
        host=host,
        port=parsed.port or 5432,
        user=parsed.username,
        password=parsed.password,
        dbname=(parsed.path or "/simualpha").lstrip("/"),
        **connect_args,
    )


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    echo=settings.debug,
    creator=_ipv4_creator,
)

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
