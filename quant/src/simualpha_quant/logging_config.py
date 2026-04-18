"""Structured JSON logging to stderr — never stdout.

CONVENTION (enforced):
    Stdout in this service is reserved for the MCP stdio transport's
    JSON-RPC framing. Any non-JSON-RPC byte on stdout corrupts the
    protocol and the client hangs forever. ALL logging therefore goes
    to stderr — this is non-negotiable.

Enforcement:
    `configure_logging()` rejects any pre-existing stdout-bound
    StreamHandler on the root logger and refuses to install one
    itself. `_assert_no_stdout_handlers()` runs after configuration to
    fail loudly if some other module added one.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        for key, value in record.__dict__.items():
            if key in _RESERVED:
                continue
            try:
                json.dumps(value)
            except TypeError:
                value = repr(value)
            payload[key] = value
        return json.dumps(payload, default=str)


_RESERVED = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "message", "taskName",
}

_configured = False


def _is_stdout_stream(stream) -> bool:
    """True iff stream is sys.stdout (or its underlying file)."""
    if stream is sys.stdout:
        return True
    try:
        return getattr(stream, "fileno", lambda: -1)() == 1
    except (OSError, ValueError):
        return False


def _assert_no_stdout_handlers() -> None:
    """Fail loud if any handler on the root logger writes to stdout.

    Stdout is reserved for the MCP stdio JSON-RPC transport. A rogue
    handler on stdout silently corrupts the wire protocol — the symptom
    is the MCP client hanging on initialize() with no error, which is
    extraordinarily painful to debug. We crash early instead.
    """
    for h in logging.getLogger().handlers:
        stream = getattr(h, "stream", None)
        if stream is not None and _is_stdout_stream(stream):
            raise RuntimeError(
                "stdout logging handler detected on the root logger. "
                "Stdout is reserved for the MCP stdio JSON-RPC transport. "
                "All logging must go to stderr — see README 'Conventions'."
            )


def configure_logging(level: str | None = None) -> None:
    global _configured
    if _configured:
        return
    resolved = (level or os.environ.get("LOG_LEVEL") or "INFO").upper()

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(JsonFormatter())
    if _is_stdout_stream(handler.stream):
        # Defensive — should never happen since we passed sys.stderr,
        # but guard against test harnesses that monkey-patch sys.stderr.
        raise RuntimeError("refused to install a stdout-bound log handler")

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(resolved)

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    _assert_no_stdout_handlers()
    _configured = True


def get_logger(name: str) -> logging.Logger:
    configure_logging()
    return logging.getLogger(name)
