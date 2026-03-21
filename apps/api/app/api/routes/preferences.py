"""User preferences and replay bookmark endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.models import ReplayBookmark, User, UserPreference, Workspace
from app.db.session import get_db

router = APIRouter()


def _parse_uuid(val: str) -> uuid.UUID:
    try:
        return uuid.UUID(val)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")


# ── Preference Schemas ────────────────────────────────────────────────────


class PreferenceOut(BaseModel):
    default_symbol: str
    default_time_horizon: str
    preferred_signal_view: str
    landing_page: str
    default_view_id: str | None


class UpdatePreferenceRequest(BaseModel):
    default_symbol: str | None = Field(default=None, max_length=16)
    default_time_horizon: str | None = Field(default=None, max_length=64)
    preferred_signal_view: str | None = Field(default=None, max_length=32)
    landing_page: str | None = Field(default=None, max_length=32)
    default_view_id: str | None = None


# ── Bookmark Schemas ──────────────────────────────────────────────────────


class BookmarkOut(BaseModel):
    id: str
    symbol: str
    replay_date: str
    label: str
    note: str | None
    created_at: str


class BookmarkListResponse(BaseModel):
    bookmarks: list[BookmarkOut]
    total: int


class CreateBookmarkRequest(BaseModel):
    symbol: str = Field(default="SPY", max_length=16)
    replay_date: str = Field(max_length=10)
    label: str = Field(min_length=1, max_length=128)
    note: str | None = None


# ── Preference Endpoints ──────────────────────────────────────────────────


@router.get("/preferences", response_model=PreferenceOut)
async def get_preferences(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    if not prefs:
        prefs = UserPreference(user_id=user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return PreferenceOut(
        default_symbol=prefs.default_symbol,
        default_time_horizon=prefs.default_time_horizon,
        preferred_signal_view=prefs.preferred_signal_view,
        landing_page=prefs.landing_page,
        default_view_id=str(prefs.default_view_id) if prefs.default_view_id else None,
    )


@router.patch("/preferences", response_model=PreferenceOut)
async def update_preferences(body: UpdatePreferenceRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    if not prefs:
        prefs = UserPreference(user_id=user.id)
        db.add(prefs)
        db.flush()

    if body.default_symbol is not None:
        prefs.default_symbol = body.default_symbol
    if body.default_time_horizon is not None:
        prefs.default_time_horizon = body.default_time_horizon
    if body.preferred_signal_view is not None:
        prefs.preferred_signal_view = body.preferred_signal_view
    if body.landing_page is not None:
        prefs.landing_page = body.landing_page
    if body.default_view_id is not None:
        prefs.default_view_id = _parse_uuid(body.default_view_id) if body.default_view_id else None

    db.commit()
    db.refresh(prefs)
    return PreferenceOut(
        default_symbol=prefs.default_symbol,
        default_time_horizon=prefs.default_time_horizon,
        preferred_signal_view=prefs.preferred_signal_view,
        landing_page=prefs.landing_page,
        default_view_id=str(prefs.default_view_id) if prefs.default_view_id else None,
    )


# ── Bookmark Endpoints ────────────────────────────────────────────────────


@router.get("/bookmarks", response_model=BookmarkListResponse)
async def list_bookmarks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bms = db.query(ReplayBookmark).filter(ReplayBookmark.user_id == user.id).order_by(ReplayBookmark.created_at.desc()).all()
    return BookmarkListResponse(
        bookmarks=[BookmarkOut(id=str(b.id), symbol=b.symbol, replay_date=b.replay_date, label=b.label, note=b.note, created_at=b.created_at.isoformat()) for b in bms],
        total=len(bms),
    )


@router.post("/bookmarks", response_model=BookmarkOut, status_code=201)
async def create_bookmark(body: CreateBookmarkRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.owner_id == user.id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="No workspace found for user")
    bm = ReplayBookmark(user_id=user.id, workspace_id=ws.id, symbol=body.symbol.upper(), replay_date=body.replay_date, label=body.label, note=body.note)
    db.add(bm)
    db.commit()
    db.refresh(bm)
    return BookmarkOut(id=str(bm.id), symbol=bm.symbol, replay_date=bm.replay_date, label=bm.label, note=bm.note, created_at=bm.created_at.isoformat())


@router.delete("/bookmarks/{bookmark_id}", status_code=204)
async def delete_bookmark(bookmark_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bm = db.get(ReplayBookmark, _parse_uuid(bookmark_id))
    if not bm or bm.user_id != user.id:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    db.delete(bm)
    db.commit()
