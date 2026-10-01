"""The one place solver settings come from. Values are read from the environment."""

from functools import lru_cache
from typing import Literal

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
    # How the worker isolates a job: "local" (process group, development) or "container".
    solver_runner: Literal["local", "container"] = "local"
    # Image for job containers, and an optional OCI runtime such as "runsc" (gVisor).
    solver_runner_image: str = "siliconbox-solver:dev"
    solver_container_runtime: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # Filled from the environment; fails fast if missing.
