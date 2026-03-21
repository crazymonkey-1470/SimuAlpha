from fastapi import APIRouter

from app.api.routes import (
    actors,
    context,
    health,
    regime,
    replay,
    scenarios,
    signals,
    simulation,
    system,
)

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(system.router, prefix="/system", tags=["system"])
api_router.include_router(regime.router, prefix="/regime", tags=["regime"])
api_router.include_router(actors.router, prefix="/actors", tags=["actors"])
api_router.include_router(scenarios.router, prefix="/scenarios", tags=["scenarios"])
api_router.include_router(signals.router, prefix="/signals", tags=["signals"])
api_router.include_router(context.router, prefix="/context", tags=["context"])
api_router.include_router(replay.router, prefix="/replay", tags=["replay"])
api_router.include_router(simulation.router, prefix="/simulation", tags=["simulation"])
