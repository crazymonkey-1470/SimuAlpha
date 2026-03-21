from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "SimuAlpha API"
    version: str = "0.1.0"
    debug: bool = False
    api_prefix: str = "/api"

    model_config = {"env_prefix": "SIMUALPHA_"}


settings = Settings()
