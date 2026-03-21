from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.exceptions import SimuAlphaError, simualpha_error_handler


@asynccontextmanager
async def lifespan(application: FastAPI):
    # Startup: ensure DB tables exist (for dev convenience; production uses Alembic)
    from app.db.base import Base
    from app.db.models import *  # noqa: F401,F403 — register all models
    from app.db.session import engine

    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: nothing needed


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description="Quantitative market intelligence and simulation API",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.add_exception_handler(SimuAlphaError, simualpha_error_handler)  # type: ignore[arg-type]

    application.include_router(api_router, prefix=settings.api_v1_prefix)

    return application


app = create_app()
