"""Saved view CRUD endpoints — user-scoped."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.models import SavedView, User, Workspace
from app.db.session import get_db

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────


class SavedViewOut(BaseModel):
    id: str
    name: str
    view_type: str
    config: dict | None
    is_default: bool
    workspace_id: str
    created_at: str
    updated_at: str


class SavedViewListResponse(BaseModel):
    views: list[SavedViewOut]
    total: int


class CreateViewRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    view_type: str = Field(default="dashboard", pattern="^(dashboard|regime|actors|scenarios|signals|replay)$")
    config: dict | None = None
    is_default: bool = False


class UpdateViewRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    config: dict | None = None
    is_default: bool | None = None


# ── Helpers ───────────────────────────────────────────────────────────────


def _to_out(v: SavedView) -> SavedViewOut:
    return SavedViewOut(
        id=str(v.id),
        name=v.name,
        view_type=v.view_type,
        config=v.config,
        is_default=v.is_default,
        workspace_id=str(v.workspace_id),
        created_at=v.created_at.isoformat(),
        updated_at=v.updated_at.isoformat(),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────


@router.get("", response_model=SavedViewListResponse)
async def list_views(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    views = db.query(SavedView).filter(SavedView.user_id == user.id).order_by(SavedView.created_at.desc()).all()
    return SavedViewListResponse(views=[_to_out(v) for v in views], total=len(views))


@router.post("", response_model=SavedViewOut, status_code=201)
async def create_view(body: CreateViewRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.owner_id == user.id).first()
    if not ws:
        raise HTTPException(status_code=500, detail="No workspace found")

    if body.is_default:
        db.query(SavedView).filter(SavedView.user_id == user.id, SavedView.view_type == body.view_type, SavedView.is_default == True).update({"is_default": False})

    view = SavedView(
        name=body.name,
        view_type=body.view_type,
        config=body.config,
        is_default=body.is_default,
        workspace_id=ws.id,
        user_id=user.id,
    )
    db.add(view)
    db.commit()
    db.refresh(view)
    return _to_out(view)


@router.get("/{view_id}", response_model=SavedViewOut)
async def get_view(view_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    v = db.get(SavedView, uuid.UUID(view_id))
    if not v or v.user_id != user.id:
        raise HTTPException(status_code=404, detail="View not found")
    return _to_out(v)


@router.patch("/{view_id}", response_model=SavedViewOut)
async def update_view(view_id: str, body: UpdateViewRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    v = db.get(SavedView, uuid.UUID(view_id))
    if not v or v.user_id != user.id:
        raise HTTPException(status_code=404, detail="View not found")
    if body.name is not None:
        v.name = body.name
    if body.config is not None:
        v.config = body.config
    if body.is_default is not None:
        if body.is_default:
            db.query(SavedView).filter(SavedView.user_id == user.id, SavedView.view_type == v.view_type, SavedView.is_default == True, SavedView.id != v.id).update({"is_default": False})
        v.is_default = body.is_default
    db.commit()
    db.refresh(v)
    return _to_out(v)


@router.delete("/{view_id}", status_code=204)
async def delete_view(view_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    v = db.get(SavedView, uuid.UUID(view_id))
    if not v or v.user_id != user.id:
        raise HTTPException(status_code=404, detail="View not found")
    db.delete(v)
    db.commit()
