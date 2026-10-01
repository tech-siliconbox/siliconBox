"""Hardening findings 4 and 5: no unauthenticated route, no CORS, scoped short-lived tokens."""

import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from tests.conftest import SIGNING_KEY, auth, make_token

NOW = int(time.time())


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer not-a-token"},
        {"Authorization": f"Basic {SIGNING_KEY}"},
        # The old shared-token scheme: the key itself is not a token.
        {"Authorization": f"Bearer {SIGNING_KEY}"},
        auth("health", key="x" * 48),
        auth("health", exp=NOW - 60, iat=NOW - 120),
        auth("health", aud="someone-else"),
        auth("health", iss="someone-else"),
        # A long-lived token is refused even when correctly signed.
        auth("health", iat=NOW, exp=NOW + 3600),
    ],
    ids=[
        "none",
        "garbage",
        "basic",
        "raw-key",
        "wrong-key",
        "expired",
        "audience",
        "issuer",
        "long-lived",
    ],
)
def test_refuses_calls_without_a_valid_token(client: TestClient, headers: dict) -> None:
    assert client.get("/v1/health", headers=headers).status_code == 401


def test_refuses_unsigned_tokens(client: TestClient) -> None:
    claims = {"iss": "siliconbox-web", "aud": "siliconbox-solver", "sub": "a", "scope": "health"}
    unsigned = jwt.encode({**claims, "iat": NOW, "exp": NOW + 60}, key=None, algorithm="none")
    headers = {"Authorization": f"Bearer {unsigned}"}
    assert client.get("/v1/health", headers=headers).status_code == 401


def test_refuses_tokens_missing_the_learner_or_scope(client: TestClient) -> None:
    payload = {"iss": "siliconbox-web", "aud": "siliconbox-solver", "iat": NOW, "exp": NOW + 60}
    token = jwt.encode(payload, SIGNING_KEY, algorithm="HS256")
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/v1/health", headers=headers).status_code == 401


def test_a_token_only_does_what_its_scope_says(client: TestClient) -> None:
    assert client.get("/v1/health", headers=auth("jobs:read")).status_code == 403
    body = {"properties": "module m(); endmodule", "settings": {}}
    assert client.post("/v1/jobs", json=body, headers=auth("jobs:read")).status_code == 403


def test_accepts_the_backend(client: TestClient) -> None:
    response = client.get("/v1/health", headers=auth("health"))
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_sends_no_cors_headers_to_browsers(client: TestClient) -> None:
    headers = {**auth("health"), "Origin": "https://evil.example"}
    assert "access-control-allow-origin" not in client.get("/v1/health", headers=headers).headers
    preflight = client.options(
        "/v1/jobs",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in preflight.headers


def test_publishes_no_api_docs(client: TestClient) -> None:
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


def test_refuses_to_start_with_a_short_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SOLVER_SIGNING_KEY", "short")
    get_settings.cache_clear()
    with pytest.raises(ValueError, match="at least 32"):
        get_settings()


def test_token_helper_is_valid() -> None:
    # Guards the fixtures above: a default token must pass, or the 401 cases prove nothing.
    claims = jwt.decode(
        make_token("health"), SIGNING_KEY, algorithms=["HS256"], audience="siliconbox-solver"
    )
    assert claims["scope"] == "health"
