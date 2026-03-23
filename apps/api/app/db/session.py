"""Database engine and session management."""

import logging
import socket
from urllib.parse import urlparse, urlunparse

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)


def _force_ipv4_url(url: str) -> str:
    """Replace hostname with its IPv4 address to avoid IPv6 unreachable errors.

    Keeps the original hostname in connect_args via sslsni if needed, but
    forces the actual TCP connection to use IPv4.
    """
    parsed = urlparse(url)
    host = parsed.hostname
    if not host or host in ("localhost", "127.0.0.1"):
        return url
    try:
        results = socket.getaddrinfo(host, None, socket.AF_INET)
        if results:
            ipv4 = results[0][4][0]
            # Replace hostname with IPv4 in the URL
            netloc = parsed.netloc.replace(host, ipv4)
            forced = urlunparse(parsed._replace(netloc=netloc))
            logger.info("Resolved %s -> %s (IPv4)", host, ipv4)
            return forced
    except socket.gaierror:
        logger.warning("Could not resolve %s to IPv4, using original URL", host)
    return url


_db_url = _force_ipv4_url(settings.database_url)

engine = create_engine(
    _db_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    echo=settings.debug,
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
