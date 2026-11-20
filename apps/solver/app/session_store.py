"""Praman sessions in Redis: records, the waiting line and the request relay (ADR 0031).

The API never talks to a session's process; it writes here and the supervisor that holds the
session reads. Each record names its owner (other learners get 404, hardening finding 19), a
learner has at most one session waiting or open, and the waiting line has a length limit.
Records expire after a day; the web app keeps what it needs in MongoDB.
"""

import json
import time
from typing import Any, Literal

from redis import Redis

from app.models import WireModel
from app.praman.protocol import Open

WAITING_KEY = "solver:sessions:waiting"
RECORD_TTL_SECONDS = 24 * 60 * 60
REPLY_TTL_SECONDS = 10 * 60
# An open session whose supervisor has not been heard from for this long was lost with it.
LOST_AFTER_SECONDS = 30
CLOSE_REQUEST_ID = "close"

SessionState = Literal["waiting", "open", "closed"]


class SessionRecord(WireModel):
    id: str
    owner: str
    state: SessionState
    created_at: float
    alive_at: float | None = None  # the supervisor's last heartbeat while open
    reason: str = ""  # why it closed


class LearnerBusy(Exception):
    """The learner already has another session waiting or open."""


class LineFull(Exception):
    """Too many sessions are waiting; the caller should try again later."""


def _record_key(session_id: str) -> str:
    return f"solver:session:{session_id}"


def _open_key(session_id: str) -> str:
    return f"solver:session:{session_id}:open"


def _requests_key(session_id: str) -> str:
    return f"solver:session:{session_id}:requests"


def _reply_key(session_id: str, request_id: str) -> str:
    return f"solver:session:{session_id}:reply:{request_id}"


def _final_key(session_id: str) -> str:
    return f"solver:session:{session_id}:final"


def _learner_key(owner: str) -> str:
    return f"solver:learner:{owner}:session"


def _text(value: bytes | str) -> str:
    return value.decode() if isinstance(value, bytes) else value


class SessionStore:
    def __init__(self, redis: Redis, max_waiting: int) -> None:
        self._redis = redis
        self._max_waiting = max_waiting

    # ── Records ─────────────────────────────────────────────────

    def _save(self, record: SessionRecord) -> None:
        self._redis.set(_record_key(record.id), record.model_dump_json(), ex=RECORD_TTL_SECONDS)

    def get(self, session_id: str) -> SessionRecord | None:
        raw = self._redis.get(_record_key(session_id))
        if raw is None:
            return None
        record = SessionRecord.model_validate_json(raw)
        lost = time.time() - (record.alive_at or record.created_at) > LOST_AFTER_SECONDS
        if record.state == "open" and lost:
            return record.model_copy(update={"state": "closed", "reason": "lost"})
        return record

    def position(self, session_id: str) -> int | None:
        """1 for the next session to open. The line is pushed on the left, taken on the right."""
        index = self._redis.lpos(WAITING_KEY, session_id)
        if index is None:
            return None
        return int(self._redis.llen(WAITING_KEY)) - int(index)

    # ── Opening ─────────────────────────────────────────────────

    def request_open(self, owner: str, request: Open) -> SessionRecord:
        """Put the session in the waiting line. Raises LearnerBusy or LineFull."""
        held = self._redis.get(_learner_key(owner))
        if held is not None and _text(held) != request.session_id:
            other = self.get(_text(held))
            if other is not None and other.state != "closed":
                raise LearnerBusy
        if self._redis.llen(WAITING_KEY) >= self._max_waiting:
            raise LineFull
        record = SessionRecord(
            id=request.session_id, owner=owner, state="waiting", created_at=time.time()
        )
        pipe = self._redis.pipeline()
        pipe.set(_record_key(record.id), record.model_dump_json(), ex=RECORD_TTL_SECONDS)
        pipe.set(
            _open_key(record.id), request.model_dump_json(by_alias=True), ex=RECORD_TTL_SECONDS
        )
        pipe.set(_learner_key(owner), record.id, ex=RECORD_TTL_SECONDS)
        pipe.delete(_final_key(record.id), _requests_key(record.id))
        pipe.lpush(WAITING_KEY, record.id)
        pipe.execute()
        return record

    def take_waiting(self, wait_seconds: int) -> tuple[SessionRecord, str] | None:
        """The next waiting session and its open request (a JSON line), for a supervisor."""
        popped = self._redis.brpop([WAITING_KEY], timeout=wait_seconds)
        if popped is None:
            return None
        session_id = _text(popped[1])
        record = self.get(session_id)
        raw_open = self._redis.getdel(_open_key(session_id))
        if record is None or record.state != "waiting" or raw_open is None:
            return None
        return record, _text(raw_open)

    def mark_open(self, record: SessionRecord) -> SessionRecord:
        opened = record.model_copy(update={"state": "open", "alive_at": time.time()})
        self._save(opened)
        return opened

    def heartbeat(self, record: SessionRecord) -> SessionRecord:
        return self.mark_open(record)

    def mark_closed(
        self, record: SessionRecord, reason: str, final: dict[str, Any] | None = None
    ) -> None:
        """Closed for `reason`; `final` is the session's last records, kept for the web app."""
        pipe = self._redis.pipeline()
        closed = record.model_copy(update={"state": "closed", "reason": reason})
        pipe.set(_record_key(record.id), closed.model_dump_json(), ex=RECORD_TTL_SECONDS)
        if final is not None:
            pipe.set(_final_key(record.id), json.dumps(final), ex=RECORD_TTL_SECONDS)
        pipe.delete(_requests_key(record.id))
        pipe.lrem(WAITING_KEY, 0, record.id)
        pipe.execute()
        held = self._redis.get(_learner_key(record.owner))
        if held is not None and _text(held) == record.id:
            self._redis.delete(_learner_key(record.owner))

    def take_final(self, session_id: str) -> dict[str, Any] | None:
        """A closed session's last records, handed over once: the web app keeps them and counts
        their engine time, so a second read must find nothing."""
        raw = self._redis.getdel(_final_key(session_id))
        return None if raw is None else json.loads(raw)

    # ── Requests and replies ───────────────────────────────────

    def send(self, session_id: str, request_id: str, request: dict[str, Any]) -> None:
        envelope = json.dumps({"id": request_id, "request": request})
        pipe = self._redis.pipeline()
        pipe.lpush(_requests_key(session_id), envelope)
        pipe.expire(_requests_key(session_id), RECORD_TTL_SECONDS)
        pipe.execute()

    def request_close(self, session_id: str) -> None:
        self.send(session_id, CLOSE_REQUEST_ID, {"op": "close"})

    def next_request(self, session_id: str, wait_seconds: int) -> str | None:
        popped = self._redis.brpop([_requests_key(session_id)], timeout=wait_seconds)
        return None if popped is None else _text(popped[1])

    def put_reply(self, session_id: str, request_id: str, reply: dict[str, Any]) -> None:
        pipe = self._redis.pipeline()
        pipe.lpush(_reply_key(session_id, request_id), json.dumps(reply))
        pipe.expire(_reply_key(session_id, request_id), REPLY_TTL_SECONDS)
        pipe.execute()

    def wait_reply(
        self, session_id: str, request_id: str, wait_seconds: int
    ) -> dict[str, Any] | None:
        popped = self._redis.brpop([_reply_key(session_id, request_id)], timeout=wait_seconds)
        return None if popped is None else json.loads(popped[1])
