"""Watchlist CRUD and intelligence endpoints — user-scoped."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.models import User, Watchlist, WatchlistItem, Workspace
from app.db.session import get_db
from app.schemas.symbols import WatchlistIntelligenceResponse, WatchlistSymbolIntel

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
        raise HTTPException(status_code=404, detail="No workspace found for user")
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


@router.get("/{watchlist_id}/intelligence", response_model=WatchlistIntelligenceResponse)
async def get_watchlist_intelligence(
    watchlist_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregate intelligence for all symbols in a watchlist."""
    from app.api.routes.symbols import _build_symbol_overview

    wl = db.get(Watchlist, uuid.UUID(watchlist_id))
    if not wl or wl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    symbol_intels: list[WatchlistSymbolIntel] = []
    regime_dist: dict[str, int] = {}
    signal_dist: dict[str, int] = {}
    fragility_scores: list[tuple[str, str]] = []
    conviction_scores: list[tuple[str, float]] = []
    total_warns = 0

    for item in wl.items:
        overview = _build_symbol_overview(db, item.symbol)
        regime_name = overview.regime.regime if overview.regime else "unknown"
        signal_bias = overview.signal.bias if overview.signal else "unknown"

        regime_dist[regime_name] = regime_dist.get(regime_name, 0) + 1
        signal_dist[signal_bias] = signal_dist.get(signal_bias, 0) + 1
        fragility_scores.append((item.symbol, overview.fragility))
        if overview.signal:
            conviction_scores.append((item.symbol, overview.signal.confidence))
        total_warns += overview.warning_count

        # Base scenario
        base_sc = overview.scenarios[0] if overview.scenarios else None

        symbol_intels.append(WatchlistSymbolIntel(
            symbol=item.symbol,
            regime=regime_name if overview.regime else None,
            regime_confidence=overview.regime.confidence if overview.regime else None,
            signal_bias=signal_bias if overview.signal else None,
            signal_confidence=overview.signal.confidence if overview.signal else None,
            fragility=overview.fragility,
            dominant_actor=overview.dominant_actor,
            base_scenario=base_sc.name if base_sc else None,
            base_scenario_probability=base_sc.probability if base_sc else None,
            warning_count=overview.warning_count,
            risk_flags=overview.regime.risk_flags if overview.regime else [],
            last_simulation_at=overview.last_simulation_at,
        ))

    # Sort by fragility (high first)
    frag_order = {"high": 0, "elevated": 1, "moderate": 2, "low": 3, "unknown": 4}
    highest_frag = [s for s, f in sorted(fragility_scores, key=lambda x: frag_order.get(x[1], 5)) if f in ("high", "elevated")]
    strongest = [s for s, _ in sorted(conviction_scores, key=lambda x: x[1], reverse=True)[:3]]

    return WatchlistIntelligenceResponse(
        watchlist_id=str(wl.id),
        watchlist_name=wl.name,
        symbols=symbol_intels,
        regime_distribution=regime_dist,
        signal_distribution=signal_dist,
        highest_fragility=highest_frag,
        strongest_conviction=strongest,
        total_warnings=total_warns,
    )
