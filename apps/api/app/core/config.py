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

    model_config = {"env_prefix": "SIMUALPHA_"}


settings = Settings()
