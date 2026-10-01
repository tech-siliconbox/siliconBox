"""The one place solver settings come from. Values are read from the environment."""

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    solver_service_token: SecretStr = Field(min_length=32)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # Filled from the environment; fails fast if missing.
