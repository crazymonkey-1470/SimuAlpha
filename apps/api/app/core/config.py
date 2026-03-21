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

    # Worker integration (future)
    worker_url: str = "http://localhost:8001"

    model_config = {"env_prefix": "SIMUALPHA_"}


settings = Settings()
