import secrets
import warnings

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "SimuAlpha API"
    version: str = "0.1.0"
    debug: bool = False

    api_v1_prefix: str = "/api/v1"

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://simualpha.pages.dev",
    ]

    # Database
    database_url: str = "postgresql://simualpha:simualpha@localhost:5432/simualpha"

    # Worker integration
    worker_url: str = "http://localhost:8001"

    # Redis for job queue
    redis_url: str = "redis://localhost:6379/0"

    # Auth / JWT — MUST be set via SIMUALPHA_JWT_SECRET in production
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    model_config = {"env_prefix": "SIMUALPHA_", "env_file": ".env"}

    def get_jwt_secret(self) -> str:
        if self.jwt_secret:
            return self.jwt_secret
        warnings.warn(
            "SIMUALPHA_JWT_SECRET is not set — using ephemeral secret. "
            "Tokens will be invalidated on restart. Set it in production.",
            stacklevel=2,
        )
        return secrets.token_urlsafe(32)


settings = Settings()

# Resolve the JWT secret once at startup
_jwt_secret = settings.get_jwt_secret()
# Patch it back so all code uses the resolved value
settings.jwt_secret = _jwt_secret
