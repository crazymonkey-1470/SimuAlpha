from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.exceptions import SimuAlphaError, simualpha_error_handler


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description="Quantitative market intelligence and simulation API",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
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
