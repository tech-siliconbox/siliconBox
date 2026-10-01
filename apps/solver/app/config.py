"""The one place solver settings come from. Values are read from the environment."""

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Local development reads apps/solver/.env.local; hosts set real environment variables.
    model_config = SettingsConfigDict(env_file=".env.local", extra="ignore")

    # Shared with the web app (SOLVER_SIGNING_KEY there too); signs short-lived call tokens.
    solver_signing_key: SecretStr = Field(min_length=32)
    # Job queue and job records. The API and the worker need it; job processes never see it.
    redis_url: SecretStr
    # Jobs waiting beyond this are refused with 503 so the web app can say "busy, try later".
    max_queue_length: int = Field(default=500, ge=1)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # Filled from the environment; fails fast if missing.
