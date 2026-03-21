"""FastAPI auth dependencies — current user resolution."""

from __future__ import annotations

import uuid

import jwt
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.exceptions import UnauthorizedError
from app.core.security import decode_token
from app.db.session import get_db


def _extract_token(request: Request) -> str | None:
    """Extract bearer token from Authorization header."""
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        return auth[7:]
    return None


def get_current_user_id(request: Request) -> uuid.UUID:
    """Require a valid access token and return the user UUID."""
    token = _extract_token(request)
    if not token:
        raise UnauthorizedError("Missing authorization header")
    try:
        payload = decode_token(token)
    except (jwt.PyJWTError, ValueError, KeyError):
        raise UnauthorizedError("Invalid or expired token")
    if payload.get("type") != "access":
        raise UnauthorizedError("Invalid token type")
    try:
        return uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        raise UnauthorizedError("Malformed token payload")


def get_optional_user_id(request: Request) -> uuid.UUID | None:
    """Optionally resolve a user from the token. Returns None if unauthenticated."""
    token = _extract_token(request)
    if not token:
        return None
    try:
        payload = decode_token(token)
    except (jwt.PyJWTError, ValueError, KeyError):
        return None
    if payload.get("type") != "access":
        return None
    try:
        return uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        return None


def get_current_user(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Resolve the full User object. Requires auth."""
    from app.db.models import User

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive")
    return user
