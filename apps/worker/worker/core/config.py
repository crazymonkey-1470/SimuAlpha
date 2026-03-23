"""Environment-based settings for the SimuAlpha worker."""

from __future__ import annotations

import os
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    environment: str = Field(default="development")
    log_level: str = Field(default="INFO")
    output_mode: str = Field(default="log", description="log | json")
    output_dir: Path = Field(default=Path("./output"))
    model_version: str = Field(default="sa-sim-0.4.2")
    redis_url: str = Field(default="redis://localhost:6379/0")
    api_base_url: str | None = Field(default=None)
    seed: int | None = Field(default=None, description="Fixed seed for deterministic generation")
    database_url: str = Field(
        default="postgresql://simualpha:simualpha@localhost:5432/simualpha",
        description="PostgreSQL connection URL for result persistence",
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "env_prefix": "SIMUALPHA_", "extra": "ignore"}


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
