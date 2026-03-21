from fastapi import APIRouter

from app.schemas.context import CrossAssetResponse
from app.services.context import context_service

router = APIRouter()


@router.get("/cross-asset", response_model=CrossAssetResponse)
async def get_cross_asset_context() -> CrossAssetResponse:
    return context_service.get_cross_asset()
