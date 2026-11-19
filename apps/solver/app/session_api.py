"""Routes for Praman sessions (ADR 0031): thin, behind a signed token with scope `sessions`.

The web app opens a session (it waits in line for a slot), sends requests and reads replies,
and closes it. A session belongs to the learner in the token; another learner's looks exactly
like a missing one (hardening finding 19). Replies that take longer than REPLY_WAIT_SECONDS
(a what-if runs a proof) come back as pending and are read later by request id.
"""

import uuid
from functools import lru_cache
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from redis import Redis

from app.auth import Caller, require_scope
from app.config import get_settings
from app.models import WireModel
from app.praman.protocol import REQUEST_ID_PATTERN, Open, Request
from app.session_store import LearnerBusy, LineFull, SessionRecord, SessionState, SessionStore

router = APIRouter(prefix="/v1/sessions")
REPLY_WAIT_SECONDS = 20
LATER_WAIT_SECONDS = 1
# Only the supervisor opens, closes and asks for status; requests carry everything else.
NOT_A_REQUEST = frozenset({"open", "close", "status"})


@lru_cache
def get_session_store() -> SessionStore:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url.get_secret_value())
    return SessionStore(redis, settings.max_waiting_sessions)


Store = Annotated[SessionStore, Depends(get_session_store)]
Learner = Annotated[Caller, Depends(require_scope("sessions"))]


class SessionView(WireModel):
    """What the web app sees of a session: no owner, no code."""

    id: str
    state: SessionState
    position: int | None = None
    reason: str = ""
    final: dict[str, Any] | None = None  # a closed session's last records


class RequestReply(WireModel):
    id: str
    pending: bool
    reply: dict[str, Any] | None = None


def _owned(store: SessionStore, session_id: UUID, caller: Caller) -> SessionRecord:
    record = store.get(str(session_id))
    if record is None or record.owner != caller.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return record


def _view(store: SessionStore, record: SessionRecord) -> SessionView:
    return SessionView(
        id=record.id,
        state=record.state,
        position=store.position(record.id) if record.state == "waiting" else None,
        reason=record.reason,
        final=store.final(record.id) if record.state == "closed" else None,
    )


def _reply(request_id: str, reply: dict[str, Any] | None, response: Response) -> RequestReply:
    if reply is None:
        response.status_code = status.HTTP_202_ACCEPTED
    return RequestReply(id=request_id, pending=reply is None, reply=reply)


@router.put("/{session_id}", response_model_by_alias=True)
def open_session(
    session_id: UUID, body: Open, caller: Learner, store: Store, response: Response
) -> SessionView:
    if body.session_id != str(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)
    existing = store.get(str(session_id))
    if existing is not None and existing.owner != caller.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if existing is not None and existing.state != "closed":
        return _view(store, existing)
    try:
        record = store.request_open(caller.user_id, body)
    except LearnerBusy as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT) from error
    except LineFull as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE) from error
    response.status_code = status.HTTP_202_ACCEPTED
    return _view(store, record)


@router.get("/{session_id}", response_model_by_alias=True)
def read_session(session_id: UUID, caller: Learner, store: Store) -> SessionView:
    return _view(store, _owned(store, session_id, caller))


@router.post("/{session_id}/requests", response_model_by_alias=True)
def send_request(
    session_id: UUID, body: Request, caller: Learner, store: Store, response: Response
) -> RequestReply:
    if body.op in NOT_A_REQUEST:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)
    record = _owned(store, session_id, caller)
    if record.state != "open":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT)
    request_id = uuid.uuid4().hex
    store.send(record.id, request_id, body.model_dump(by_alias=True))
    return _reply(request_id, store.wait_reply(record.id, request_id, REPLY_WAIT_SECONDS), response)


@router.get("/{session_id}/replies/{request_id}", response_model_by_alias=True)
def read_reply(
    session_id: UUID,
    request_id: Annotated[str, Path(pattern=REQUEST_ID_PATTERN)],
    caller: Learner,
    store: Store,
    response: Response,
) -> RequestReply:
    record = _owned(store, session_id, caller)
    return _reply(request_id, store.wait_reply(record.id, request_id, LATER_WAIT_SECONDS), response)


@router.delete("/{session_id}", response_model_by_alias=True)
def close_session(session_id: UUID, caller: Learner, store: Store) -> SessionView:
    record = _owned(store, session_id, caller)
    if record.state == "waiting":
        store.mark_closed(record, "closed")
    elif record.state == "open":
        store.request_close(record.id)
    return _view(store, store.get(record.id) or record)
