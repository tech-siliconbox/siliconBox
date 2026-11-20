"""Praman sessions through the API, the Redis store and the supervisor (ADR 0031).

Hardening findings 14 (signed calls only), 18 (bounded capacity, idle close) and 19 (another
learner's session). The supervisor tests run the real session host as a local process.
"""

import json
import threading
import time
import uuid
from collections.abc import Callable, Iterator

import fakeredis
import pytest
from fastapi.testclient import TestClient

from app import session_api
from app.main import create_app
from app.praman.protocol import Open
from app.praman.tclhost import tclsh_path
from app.session_api import get_session_store
from app.session_runners import LocalSessionRunner
from app.session_store import SessionStore
from app.supervisor import Supervisor
from tests.conftest import auth

LIMITS = {"proofSeconds": 300, "traceLength": 50, "secondsLeft": 3600}
needs_tcl = pytest.mark.skipif(tclsh_path() is None, reason="tclsh is not installed")


def open_body(session_id: str) -> dict:
    return {"op": "open", "sessionId": session_id, "name": "Session 1", "ceilings": LIMITS}


def open_request(session_id: str) -> Open:
    return Open.model_validate(open_body(session_id))


@pytest.fixture
def sessions() -> SessionStore:
    return SessionStore(fakeredis.FakeRedis(server=fakeredis.FakeServer()), max_waiting=3)


@pytest.fixture
def api(sessions: SessionStore) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_session_store] = lambda: sessions
    return TestClient(app)


def as_learner(learner: str = "learner-1") -> dict[str, str]:
    return auth("sessions", sub=learner)


def new_id() -> str:
    return str(uuid.uuid4())


def wait_for(condition: Callable[[], bool], seconds: float = 30) -> None:
    end = time.monotonic() + seconds
    while not condition():
        assert time.monotonic() < end, "timed out"
        time.sleep(0.05)


# ── The API ────────────────────────────────────────────────────


@pytest.mark.parametrize("scope", [None, "jobs:write", "sessions:read"])
def test_session_routes_need_a_token_with_the_sessions_scope(api: TestClient, scope) -> None:
    headers = auth(scope) if scope else {}  # made here: a token lives 60 seconds
    session_id = new_id()
    calls = [
        api.put(f"/v1/sessions/{session_id}", json=open_body(session_id), headers=headers),
        api.get(f"/v1/sessions/{session_id}", headers=headers),
        api.post(f"/v1/sessions/{session_id}/requests", json={"op": "stop"}, headers=headers),
        api.get(f"/v1/sessions/{session_id}/replies/abc", headers=headers),
        api.delete(f"/v1/sessions/{session_id}", headers=headers),
        api.delete(f"/v1/sessions/{session_id}/final", headers=headers),
    ]
    assert {call.status_code for call in calls} == ({403} if scope else {401})


def test_opening_puts_the_session_in_line(api: TestClient) -> None:
    session_id = new_id()
    reply = api.put(f"/v1/sessions/{session_id}", json=open_body(session_id), headers=as_learner())
    assert reply.status_code == 202
    assert reply.json() == {
        "id": session_id,
        "state": "waiting",
        "position": 1,
        "reason": "",
    }


def test_the_body_must_name_the_same_session(api: TestClient) -> None:
    reply = api.put(f"/v1/sessions/{new_id()}", json=open_body(new_id()), headers=as_learner())
    assert reply.status_code == 400


def test_another_learners_session_looks_missing(api: TestClient) -> None:
    session_id = new_id()
    api.put(f"/v1/sessions/{session_id}", json=open_body(session_id), headers=as_learner())
    other = as_learner("learner-2")
    calls = [
        api.put(f"/v1/sessions/{session_id}", json=open_body(session_id), headers=other),
        api.get(f"/v1/sessions/{session_id}", headers=other),
        api.post(f"/v1/sessions/{session_id}/requests", json={"op": "stop"}, headers=other),
        api.get(f"/v1/sessions/{session_id}/replies/abc", headers=other),
        api.delete(f"/v1/sessions/{session_id}", headers=other),
        api.delete(f"/v1/sessions/{session_id}/final", headers=other),
    ]
    assert {call.status_code for call in calls} == {404}


def test_a_learner_has_one_session_at_a_time(api: TestClient) -> None:
    first, second = new_id(), new_id()
    api.put(f"/v1/sessions/{first}", json=open_body(first), headers=as_learner())
    blocked = api.put(f"/v1/sessions/{second}", json=open_body(second), headers=as_learner())
    assert blocked.status_code == 409
    api.delete(f"/v1/sessions/{first}", headers=as_learner())
    allowed = api.put(f"/v1/sessions/{second}", json=open_body(second), headers=as_learner())
    assert allowed.status_code == 202


def test_a_full_line_says_busy(api: TestClient) -> None:
    for learner in ("a", "b", "c"):
        session_id = new_id()
        api.put(
            f"/v1/sessions/{session_id}", json=open_body(session_id), headers=as_learner(learner)
        )
    session_id = new_id()
    reply = api.put(f"/v1/sessions/{session_id}", json=open_body(session_id), headers=as_learner())
    assert reply.status_code == 503


def test_requests_wait_until_the_session_is_open(api: TestClient) -> None:
    session_id = new_id()
    api.put(f"/v1/sessions/{session_id}", json=open_body(session_id), headers=as_learner())
    reply = api.post(
        f"/v1/sessions/{session_id}/requests", json={"op": "stop"}, headers=as_learner()
    )
    assert reply.status_code == 409


@pytest.mark.parametrize("body", [open_body("x"), {"op": "close"}, {"op": "status"}])
def test_only_the_supervisor_opens_closes_and_asks_for_status(
    api: TestClient, sessions: SessionStore, body: dict
) -> None:
    session_id = new_id()
    sessions.mark_open(sessions.request_open("learner-1", open_request(session_id)))
    reply = api.post(f"/v1/sessions/{session_id}/requests", json=body, headers=as_learner())
    assert reply.status_code == 400


def test_a_request_over_the_size_limit_is_refused(api: TestClient, sessions: SessionStore) -> None:
    session_id = new_id()
    sessions.mark_open(sessions.request_open("learner-1", open_request(session_id)))
    body = {"op": "putFile", "name": "big.sv", "text": "x" * (1024 * 1024 + 1)}
    reply = api.post(f"/v1/sessions/{session_id}/requests", json=body, headers=as_learner())
    assert reply.status_code == 422


def answer_requests(sessions: SessionStore, session_id: str, count: int) -> threading.Thread:
    """Stands in for the supervisor: echoes each request's op back as its reply."""

    def run() -> None:
        for _ in range(count):
            raw = None
            while raw is None:
                raw = sessions.next_request(session_id, 1)
            envelope = json.loads(raw)
            sessions.put_reply(
                session_id, envelope["id"], {"ok": True, "op": envelope["request"]["op"]}
            )

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread


def test_a_reply_comes_back_with_the_request(api: TestClient, sessions: SessionStore) -> None:
    session_id = new_id()
    sessions.mark_open(sessions.request_open("learner-1", open_request(session_id)))
    answer_requests(sessions, session_id, 1)
    reply = api.post(
        f"/v1/sessions/{session_id}/requests",
        json={"op": "poll", "after": 0, "version": -1, "ceilings": LIMITS},
        headers=as_learner(),
    )
    assert reply.status_code == 200
    assert reply.json()["reply"] == {"ok": True, "op": "poll"}


def test_a_slow_reply_is_read_later(
    api: TestClient, sessions: SessionStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(session_api, "REPLY_WAIT_SECONDS", 1)
    session_id = new_id()
    sessions.mark_open(sessions.request_open("learner-1", open_request(session_id)))
    pending = api.post(
        f"/v1/sessions/{session_id}/requests", json={"op": "report"}, headers=as_learner()
    )
    assert pending.status_code == 202
    request_id = pending.json()["id"]
    sessions.put_reply(session_id, request_id, {"ok": True, "name": "report.html"})
    later = api.get(f"/v1/sessions/{session_id}/replies/{request_id}", headers=as_learner())
    assert later.status_code == 200
    assert later.json()["reply"]["name"] == "report.html"


def test_a_session_whose_supervisor_went_quiet_is_lost(sessions: SessionStore) -> None:
    session_id = new_id()
    record = sessions.mark_open(sessions.request_open("learner-1", open_request(session_id)))
    sessions._save(record.model_copy(update={"alive_at": time.time() - 120}))  # noqa: SLF001
    lost = sessions.get(session_id)
    assert lost is not None
    assert (lost.state, lost.reason) == ("closed", "lost")


def test_a_closed_sessions_last_records_are_handed_over_once(
    api: TestClient, sessions: SessionStore
) -> None:
    session_id = new_id()
    record = sessions.mark_open(sessions.request_open("learner-1", open_request(session_id)))
    path = f"/v1/sessions/{session_id}/final"
    assert api.delete(path, headers=as_learner()).json() == {"final": None}  # still open
    sessions.mark_closed(record, "idle", {"ok": True, "proofSeconds": 3.5})
    taken = api.delete(path, headers=as_learner())
    assert taken.json() == {"final": {"ok": True, "proofSeconds": 3.5}}
    assert api.delete(path, headers=as_learner()).json() == {"final": None}


def test_closing_a_waiting_session_takes_it_out_of_line(api: TestClient) -> None:
    session_id = new_id()
    api.put(f"/v1/sessions/{session_id}", json=open_body(session_id), headers=as_learner())
    closed = api.delete(f"/v1/sessions/{session_id}", headers=as_learner())
    assert closed.json()["state"] == "closed"
    assert closed.json()["position"] is None


# ── The supervisor, with the real session host ─────────────────


@pytest.fixture
def supervisor(sessions: SessionStore, tmp_path) -> Iterator[Supervisor]:
    running = Supervisor(sessions, LocalSessionRunner(tmp_path), slots=1, idle_seconds=60)
    yield running
    running.close_all()


def open_live(sessions: SessionStore, supervisor: Supervisor, learner: str = "learner-1") -> str:
    session_id = new_id()
    sessions.request_open(learner, open_request(session_id))
    assert supervisor.step(1)
    return session_id


def ask(sessions: SessionStore, session_id: str, request: dict) -> dict:
    request_id = uuid.uuid4().hex
    sessions.send(session_id, request_id, request)
    reply = sessions.wait_reply(session_id, request_id, 30)
    assert reply is not None
    return reply


@needs_tcl
def test_the_supervisor_opens_relays_and_closes(
    sessions: SessionStore, supervisor: Supervisor
) -> None:
    session_id = open_live(sessions, supervisor)
    assert sessions.get(session_id).state == "open"
    assert ask(
        sessions, session_id, {"op": "putFile", "name": "a.sv", "text": "module a; endmodule"}
    )["ok"]
    poll = ask(sessions, session_id, {"op": "poll", "after": 0, "version": -1, "ceilings": LIMITS})
    assert poll["records"]["session"]["files"]["a.sv"] == "module a; endmodule"
    sessions.request_close(session_id)
    wait_for(lambda: sessions.get(session_id).state == "closed")
    assert sessions.get(session_id).reason == "closed"
    assert sessions.take_final(session_id)["ok"]


@needs_tcl
def test_an_idle_session_closes_and_keeps_its_last_records(
    sessions: SessionStore, tmp_path
) -> None:
    supervisor = Supervisor(sessions, LocalSessionRunner(tmp_path), slots=1, idle_seconds=1)
    session_id = open_live(sessions, supervisor)
    ask(sessions, session_id, {"op": "putFile", "name": "a.sv", "text": "module a; endmodule"})
    wait_for(lambda: sessions.get(session_id).state == "closed")
    assert sessions.get(session_id).reason == "idle"
    assert (
        sessions.take_final(session_id)["records"]["session"]["files"]["a.sv"]
        == "module a; endmodule"
    )


@needs_tcl
def test_a_full_host_keeps_the_next_session_waiting(
    sessions: SessionStore, supervisor: Supervisor
) -> None:
    open_live(sessions, supervisor)
    waiting = new_id()
    sessions.request_open("learner-2", open_request(waiting))
    assert not supervisor.step(1)
    assert sessions.get(waiting).state == "waiting"
    assert sessions.position(waiting) == 1


@needs_tcl
def test_a_session_whose_process_ends_is_closed(
    sessions: SessionStore, supervisor: Supervisor
) -> None:
    session_id = open_live(sessions, supervisor)
    supervisor.live[session_id]._process._process.kill()  # noqa: SLF001
    wait_for(lambda: sessions.get(session_id).state == "closed")
    assert sessions.get(session_id).reason == "stopped"


class BrokenRunner:
    def start(self, _session_id: str) -> None:
        raise OSError("docker is not running")


def test_a_session_that_cannot_start_is_closed(sessions: SessionStore) -> None:
    session_id = new_id()
    sessions.request_open("learner-1", open_request(session_id))
    assert not Supervisor(sessions, BrokenRunner(), slots=1).step(1)
    assert (sessions.get(session_id).state, sessions.get(session_id).reason) == (
        "closed",
        "could not start",
    )


@needs_tcl
def test_stopping_the_supervisor_closes_sessions_with_their_last_records(
    sessions: SessionStore, tmp_path
) -> None:
    supervisor = Supervisor(sessions, LocalSessionRunner(tmp_path), slots=1)
    session_id = open_live(sessions, supervisor)
    ask(sessions, session_id, {"op": "putFile", "name": "a.sv", "text": "module a; endmodule"})
    supervisor.close_all()
    assert sessions.get(session_id).reason == "supervisor stopped"
    assert (
        sessions.take_final(session_id)["records"]["session"]["files"]["a.sv"]
        == "module a; endmodule"
    )
