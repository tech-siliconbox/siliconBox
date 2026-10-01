import os
import time
from collections.abc import Iterator
from pathlib import Path

import fakeredis
import jwt
import pytest
from fastapi.testclient import TestClient

from app.auth import AUDIENCE, ISSUER
from app.config import get_settings
from app.main import create_app, get_store
from app.models import JobSpec
from app.store import JobStore
from app.tools import SbyTool

SIGNING_KEY = "k" * 48
FIXTURES = Path(__file__).parent / "fixtures"

# CI sets SOLVER_REQUIRE_SBY so the real-solver tests can never be skipped there by accident.
if os.environ.get("SOLVER_REQUIRE_SBY") == "1" and SbyTool.locate() is None:
    raise RuntimeError("SOLVER_REQUIRE_SBY is set but SymbiYosys was not found on PATH")
needs_sby = pytest.mark.skipif(SbyTool.locate() is None, reason="SymbiYosys is not installed")


def make_token(scope: str, sub: str = "learner-1", key: str = SIGNING_KEY, **claims) -> str:
    now = int(time.time())
    payload = {"iss": ISSUER, "aud": AUDIENCE, "sub": sub, "scope": scope, "iat": now}
    payload["exp"] = now + 60
    payload.update(claims)
    return jwt.encode(payload, key, algorithm="HS256")


def auth(scope: str, **kwargs) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(scope, **kwargs)}"}


def fixture_text(name: str) -> str:
    return (FIXTURES / name).read_text()


def counter_spec(design: str = "counter.sv", **settings) -> JobSpec:
    base = {"mode": "bmc", "solver": "boolector", "depth": 20, "timeoutSeconds": 60}
    return JobSpec.model_validate(
        {
            "design": fixture_text(design),
            "properties": fixture_text("counter_props.sv"),
            "settings": {**base, "topModule": "counter", **settings},
        }
    )


@pytest.fixture(autouse=True)
def solver_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("SOLVER_SIGNING_KEY", SIGNING_KEY)
    monkeypatch.setenv("REDIS_URL", "redis://unused.invalid:6379")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def store() -> JobStore:
    return JobStore(fakeredis.FakeRedis(), max_queue_length=3)


@pytest.fixture
def client(store: JobStore) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_store] = lambda: store
    return TestClient(app)
