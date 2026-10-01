"""Hardening findings 1, 2, 3, 6, 7 and 11 at the API: what a caller can and cannot send."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.limits import MAX_PROPERTIES_BYTES
from app.models import JobResult
from app.store import JobStore
from tests.conftest import auth

SETTINGS = {"mode": "bmc", "solver": "boolector", "depth": 20, "timeoutSeconds": 30}
BODY = {"design": "", "properties": "module p(); endmodule", "settings": SETTINGS}


def submit(client: TestClient, body: dict = BODY, user: str = "learner-1"):
    return client.post("/v1/jobs", json=body, headers=auth("jobs:write", sub=user))


def test_queues_a_job_and_returns_at_once(client: TestClient) -> None:
    response = submit(client)
    assert response.status_code == 202
    job = response.json()
    assert job["state"] == "queued"
    assert job["position"] == 1
    # Finding 6: ids are random UUIDv4, not short guessable names.
    assert uuid.UUID(job["id"]).version == 4


def test_a_learner_reads_only_their_own_jobs(client: TestClient) -> None:
    job_id = submit(client, user="learner-1").json()["id"]
    own = client.get(f"/v1/jobs/{job_id}", headers=auth("jobs:read", sub="learner-1"))
    other = client.get(f"/v1/jobs/{job_id}", headers=auth("jobs:read", sub="learner-2"))
    assert own.status_code == 200
    assert other.status_code == 404


def test_reports_the_finished_result(client: TestClient, store: JobStore) -> None:
    job_id = submit(client).json()["id"]
    taken = store.take(wait_seconds=1)
    assert taken is not None
    store.finish(taken[0], JobResult(status="PASS", elapsed_seconds=1.5))
    body = client.get(f"/v1/jobs/{job_id}", headers=auth("jobs:read")).json()
    assert body["state"] == "done"
    assert body["result"]["status"] == "PASS"
    assert body["result"]["elapsedSeconds"] == 1.5
    assert "owner" not in body


def test_unknown_and_malformed_job_ids_are_not_found(client: TestClient) -> None:
    headers = auth("jobs:read")
    assert client.get(f"/v1/jobs/{uuid.uuid4()}", headers=headers).status_code == 404
    assert client.get("/v1/jobs/..%2F..%2Fetc", headers=headers).status_code in {404, 422}


@pytest.mark.parametrize(
    "path",
    [
        "/api/formal/run-sync",
        "/api/formal/run",
        "/api/formal/run-upload",
        "/api/formal/rerun",
        "/api/formal/jobs",
        "/api/sva/generate",
        "/api/formal/debug-quick",
    ],
)
def test_the_old_routes_are_gone(client: TestClient, path: str) -> None:
    # Finding 7 (no synchronous run) and finding 8 (no AI routes in the solver).
    assert client.post(path, json=BODY, headers=auth("jobs:write")).status_code == 404


@pytest.mark.parametrize(
    "extra",
    [
        {"projectName": "../../etc"},  # finding 1: callers cannot name folders
        {"project_name": "../../etc"},
        {"timeout": 99999},  # finding 3: only the checked settings exist
        {"dutFilename": "../x.sv"},
    ],
)
def test_refuses_fields_the_caller_may_not_set(client: TestClient, extra: dict) -> None:
    assert submit(client, {**BODY, **extra}).status_code == 422


@pytest.mark.parametrize(
    "override",
    [
        {"mode": "bmc\n[script]\nshell rm -rf /"},  # finding 2: injection through mode
        {"solver": "boolector\n[script]"},
        {"solver": "custom"},
        {"topModule": "top\nprep"},
        {"topModule": "a b"},
        {"depth": 0},
        {"depth": 100000},  # finding 3: caller-chosen depth
        {"timeoutSeconds": 3600},  # finding 3: caller-chosen time
    ],
)
def test_refuses_settings_outside_the_allow_list(client: TestClient, override: dict) -> None:
    body = {**BODY, "settings": {**SETTINGS, **override}}
    assert submit(client, body).status_code == 422


def test_refuses_oversized_code(client: TestClient) -> None:
    # Finding 11: no unbounded uploads.
    big = "/" * (MAX_PROPERTIES_BYTES + 1)
    assert submit(client, {**BODY, "properties": big}).status_code == 422


def test_says_busy_when_the_queue_is_full(client: TestClient) -> None:
    for _ in range(3):
        assert submit(client).status_code == 202
    assert submit(client).status_code == 503
