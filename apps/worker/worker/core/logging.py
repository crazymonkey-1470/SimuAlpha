"""Structured logging setup for the SimuAlpha worker."""

from __future__ import annotations

import logging
import sys

from worker.core.config import get_settings

_configured = False


def setup_logging() -> logging.Logger:
    """Configure and return the root worker logger."""
    global _configured

    settings = get_settings()
    logger = logging.getLogger("simualpha.worker")

    if _configured:
        return logger

    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    fmt = logging.Formatter(
        fmt="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(fmt)
    logger.addHandler(handler)

    _configured = True
    return logger


def get_logger(name: str) -> logging.Logger:
    """Get a child logger under the worker namespace."""
    parent = logging.getLogger("simualpha.worker")
    if not parent.handlers:
        setup_logging()
    return parent.getChild(name)
