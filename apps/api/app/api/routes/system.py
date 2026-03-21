from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.system import SystemStatus
from app.services.system import system_service

router = APIRouter()


@router.get("/status", response_model=SystemStatus)
async def system_status(db: Session = Depends(get_db)) -> SystemStatus:
    return system_service.get_status(db=db)
