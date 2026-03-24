from fastapi import APIRouter

from app.api.routes import auth, health, methodology, report

api_router = APIRouter()

# Health
api_router.include_router(health.router, tags=["health"])

# Auth
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Distress analysis
api_router.include_router(report.router, tags=["reports"])

# Methodology
api_router.include_router(methodology.router, tags=["methodology"])
