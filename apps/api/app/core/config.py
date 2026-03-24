import secrets
import warnings

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "SimuAlpha API"
    version: str = "1.0.0"
    debug: bool = False

    api_v1_prefix: str = "/api/v1"

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://simualpha.pages.dev",
        "https://simualpha.com",
        "https://www.simualpha.com",
    ]

    # Database (Supabase PostgreSQL in production)
    database_url: str = "postgresql://simualpha:simualpha@localhost:5432/simualpha"

    # Financial data provider API key (e.g. Financial Modeling Prep)
    financial_data_api_key: str = ""

    # Report cache TTL in seconds (default 6 hours)
    report_cache_ttl: int = 21600

    # Auth / JWT
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    model_config = {"env_prefix": "SIMUALPHA_", "env_file": ".env", "extra": "ignore"}

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

_jwt_secret = settings.get_jwt_secret()
settings.jwt_secret = _jwt_secret
