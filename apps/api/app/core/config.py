import secrets

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "SimuAlpha API"
    version: str = "0.1.0"
    debug: bool = False

    api_v1_prefix: str = "/api/v1"

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # Database
    database_url: str = "postgresql://simualpha:simualpha@localhost:5432/simualpha"

    # Worker integration
    worker_url: str = "http://localhost:8001"

    # Redis for job queue
    redis_url: str = "redis://localhost:6379/0"

    # Auth / JWT
    jwt_secret: str = secrets.token_urlsafe(32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    model_config = {"env_prefix": "SIMUALPHA_"}


settings = Settings()
