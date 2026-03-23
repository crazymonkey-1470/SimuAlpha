from fastapi import APIRouter

from app.api.routes import (
    actors,
    auth,
    backtest,
    calibrations,
    context,
    events,
    health,
    jobs,
    preferences,
    regime,
    replay,
    replays,
    runs,
    scenarios,
    signals,
    simulation,
    symbols,
    system,
    views,
    watchlists,
)

api_router = APIRouter()

# Public / system routes
api_router.include_router(health.router, tags=["health"])
api_router.include_router(system.router, prefix="/system", tags=["system"])

# Auth
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Shared simulation data (public)
api_router.include_router(regime.router, prefix="/regime", tags=["regime"])
api_router.include_router(actors.router, prefix="/actors", tags=["actors"])
api_router.include_router(scenarios.router, prefix="/scenarios", tags=["scenarios"])
api_router.include_router(signals.router, prefix="/signals", tags=["signals"])
api_router.include_router(context.router, prefix="/context", tags=["context"])
api_router.include_router(replay.router, prefix="/replay", tags=["replay"])
api_router.include_router(simulation.router, prefix="/simulation", tags=["simulation"])
api_router.include_router(backtest.router, prefix="/backtest", tags=["backtest"])

# Symbol drilldown & comparison (public)
api_router.include_router(symbols.router, prefix="/symbols", tags=["symbols"])

# Persisted-data endpoints
api_router.include_router(runs.router, prefix="/runs", tags=["runs"])
api_router.include_router(replays.router, prefix="/replays", tags=["replays"])
api_router.include_router(calibrations.router, prefix="/calibrations", tags=["calibrations"])

# Job queue endpoints
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])

# Real-time events (SSE)
api_router.include_router(events.router, prefix="/events", tags=["events"])

# User-specific data (authenticated)
api_router.include_router(watchlists.router, prefix="/watchlists", tags=["watchlists"])
api_router.include_router(views.router, prefix="/views", tags=["views"])
api_router.include_router(preferences.router, prefix="/me", tags=["user"])
