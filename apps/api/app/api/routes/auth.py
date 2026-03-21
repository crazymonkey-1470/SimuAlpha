"""Authentication endpoints — register, login, logout, refresh, me."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.exceptions import UnauthorizedError, ValidationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.models import RefreshToken, User, UserPreference, Workspace, WorkspaceMembership
from app.db.session import get_db

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfile


class UserProfile(BaseModel):
    id: str
    email: str
    full_name: str
    is_active: bool
    is_admin: bool
    created_at: datetime
    default_workspace_id: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Helpers ───────────────────────────────────────────────────────────────


def _hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _user_to_profile(user: User, workspace_id: uuid.UUID | None = None) -> UserProfile:
    return UserProfile(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at,
        default_workspace_id=str(workspace_id) if workspace_id else None,
    )


def _get_default_workspace_id(db: Session, user_id: uuid.UUID) -> uuid.UUID | None:
    ws = db.query(Workspace).filter(Workspace.owner_id == user_id).first()
    return ws.id if ws else None


# ── Endpoints ─────────────────────────────────────────────────────────────


@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)) -> AuthResponse:
    """Create a new user account with a default workspace."""
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise ValidationError("Email already registered")

    user = User(
        id=uuid.uuid4(),
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    db.flush()

    # Create default workspace
    workspace = Workspace(
        id=uuid.uuid4(),
        name=f"{body.full_name}'s Workspace",
        owner_id=user.id,
    )
    db.add(workspace)
    db.flush()

    # Create workspace membership
    membership = WorkspaceMembership(
        workspace_id=workspace.id,
        user_id=user.id,
        role="owner",
    )
    db.add(membership)

    # Create default preferences
    prefs = UserPreference(user_id=user.id)
    db.add(prefs)

    # Generate tokens
    access_token = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id)

    # Store refresh token hash
    rt = RefreshToken(
        user_id=user.id,
        token_hash=_hash_refresh_token(refresh_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
        user_agent=request.headers.get("user-agent"),
    )
    db.add(rt)

    db.commit()

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_user_to_profile(user, workspace.id),
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)) -> AuthResponse:
    """Authenticate with email and password."""
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise UnauthorizedError("Invalid email or password")
    if not user.is_active:
        raise UnauthorizedError("Account is disabled")

    user.last_login_at = datetime.now(timezone.utc)

    access_token = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id)

    rt = RefreshToken(
        user_id=user.id,
        token_hash=_hash_refresh_token(refresh_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
        user_agent=request.headers.get("user-agent"),
    )
    db.add(rt)
    db.commit()

    ws_id = _get_default_workspace_id(db, user.id)

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_user_to_profile(user, ws_id),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Exchange a refresh token for a new access token."""
    try:
        payload = decode_token(body.refresh_token)
    except (pyjwt.PyJWTError, ValueError, KeyError):
        raise UnauthorizedError("Invalid or expired refresh token")
    if payload.get("type") != "refresh":
        raise UnauthorizedError("Invalid token type")

    token_hash = _hash_refresh_token(body.refresh_token)
    stored = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash,
        RefreshToken.revoked_at.is_(None),
    ).first()
    if not stored:
        raise UnauthorizedError("Refresh token not found or revoked")

    user = db.get(User, stored.user_id)
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive")

    access_token = create_access_token(user.id, user.email)
    return TokenResponse(access_token=access_token)


@router.post("/logout")
async def logout(body: RefreshRequest, db: Session = Depends(get_db)) -> dict:
    """Revoke a refresh token."""
    token_hash = _hash_refresh_token(body.refresh_token)
    stored = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if stored:
        stored.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return {"message": "Logged out"}


@router.get("/me", response_model=UserProfile)
async def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserProfile:
    """Get the current authenticated user's profile."""
    ws_id = _get_default_workspace_id(db, user.id)
    return _user_to_profile(user, ws_id)
