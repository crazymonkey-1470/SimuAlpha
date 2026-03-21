"""Watchlist CRUD endpoints — user-scoped."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.models import User, Watchlist, WatchlistItem, Workspace
from app.db.session import get_db

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────


class WatchlistItemOut(BaseModel):
    id: str
    symbol: str
    position: int


class WatchlistOut(BaseModel):
    id: str
    name: str
    description: str | None
    workspace_id: str
    items: list[WatchlistItemOut]
    created_at: str
    updated_at: str


class WatchlistListResponse(BaseModel):
    watchlists: list[WatchlistOut]
    total: int


class CreateWatchlistRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None


class UpdateWatchlistRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None


class AddItemRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)


# ── Helpers ───────────────────────────────────────────────────────────────


def _to_out(wl: Watchlist) -> WatchlistOut:
    return WatchlistOut(
        id=str(wl.id),
        name=wl.name,
        description=wl.description,
        workspace_id=str(wl.workspace_id),
        items=[WatchlistItemOut(id=str(i.id), symbol=i.symbol, position=i.position) for i in wl.items],
        created_at=wl.created_at.isoformat(),
        updated_at=wl.updated_at.isoformat(),
    )


def _default_workspace(db: Session, user: User) -> Workspace:
    ws = db.query(Workspace).filter(Workspace.owner_id == user.id).first()
    if not ws:
        raise HTTPException(status_code=500, detail="No workspace found")
    return ws


# ── Endpoints ─────────────────────────────────────────────────────────────


@router.get("", response_model=WatchlistListResponse)
async def list_watchlists(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wls = db.query(Watchlist).filter(Watchlist.user_id == user.id).order_by(Watchlist.created_at.desc()).all()
    return WatchlistListResponse(watchlists=[_to_out(wl) for wl in wls], total=len(wls))


@router.post("", response_model=WatchlistOut, status_code=201)
async def create_watchlist(body: CreateWatchlistRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = _default_workspace(db, user)
    wl = Watchlist(name=body.name, description=body.description, workspace_id=ws.id, user_id=user.id)
    db.add(wl)
    db.commit()
    db.refresh(wl)
    return _to_out(wl)


@router.get("/{watchlist_id}", response_model=WatchlistOut)
async def get_watchlist(watchlist_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = db.get(Watchlist, uuid.UUID(watchlist_id))
    if not wl or wl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return _to_out(wl)


@router.patch("/{watchlist_id}", response_model=WatchlistOut)
async def update_watchlist(watchlist_id: str, body: UpdateWatchlistRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = db.get(Watchlist, uuid.UUID(watchlist_id))
    if not wl or wl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    if body.name is not None:
        wl.name = body.name
    if body.description is not None:
        wl.description = body.description
    db.commit()
    db.refresh(wl)
    return _to_out(wl)


@router.delete("/{watchlist_id}", status_code=204)
async def delete_watchlist(watchlist_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = db.get(Watchlist, uuid.UUID(watchlist_id))
    if not wl or wl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    db.delete(wl)
    db.commit()


@router.post("/{watchlist_id}/items", response_model=WatchlistItemOut, status_code=201)
async def add_item(watchlist_id: str, body: AddItemRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = db.get(Watchlist, uuid.UUID(watchlist_id))
    if not wl or wl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    existing = db.query(WatchlistItem).filter(WatchlistItem.watchlist_id == wl.id, WatchlistItem.symbol == body.symbol.upper()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Symbol already in watchlist")
    max_pos = max((i.position for i in wl.items), default=-1)
    item = WatchlistItem(watchlist_id=wl.id, symbol=body.symbol.upper(), position=max_pos + 1)
    db.add(item)
    db.commit()
    db.refresh(item)
    return WatchlistItemOut(id=str(item.id), symbol=item.symbol, position=item.position)


@router.delete("/{watchlist_id}/items/{item_id}", status_code=204)
async def remove_item(watchlist_id: str, item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = db.get(Watchlist, uuid.UUID(watchlist_id))
    if not wl or wl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    item = db.get(WatchlistItem, uuid.UUID(item_id))
    if not item or item.watchlist_id != wl.id:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
