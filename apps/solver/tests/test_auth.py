import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app

TOKEN = "t" * 40


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("SOLVER_SERVICE_TOKEN", TOKEN)
    get_settings.cache_clear()
    return TestClient(create_app())


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer wrong-token"}, {"Authorization": f"Basic {TOKEN}"}],
)
def test_rejects_calls_without_the_service_token(client: TestClient, headers: dict) -> None:
    assert client.get("/v1/health", headers=headers).status_code == 401


def test_accepts_the_backend_with_the_service_token(client: TestClient) -> None:
    response = client.get("/v1/health", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_sends_no_cors_headers_to_browsers(client: TestClient) -> None:
    response = client.get(
        "/v1/health",
        headers={"Authorization": f"Bearer {TOKEN}", "Origin": "https://evil.example"},
    )
    assert "access-control-allow-origin" not in response.headers


def test_publishes_no_api_docs(client: TestClient) -> None:
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


def test_refuses_to_start_with_a_short_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SOLVER_SERVICE_TOKEN", "short")
    get_settings.cache_clear()
    with pytest.raises(ValueError, match="at least 32"):
        get_settings()
