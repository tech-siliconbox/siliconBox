"""Where a session's records go: an outbox the session host empties on every poll.

formal-verify kept sessions and runs in a database of its own. In SiliconBox the web app keeps
them in MongoDB (ADR 0031), and the solver has no database: the session writes each record here
and the host hands them to the web app with the next poll. The method names and arguments are
those formal-verify's session and commands already call.
"""

from __future__ import annotations

import json
import threading
from typing import Any

from app.limits import PRAMAN_MAX_TRACE_BYTES


class Outbox:
    """The records waiting for the web app. Saving a session again replaces the waiting copy
    (only the newest matters) but keeps its new log lines (`newEvents`: the web app appends them
    to the log it keeps); runs are kept in order."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._session: dict[str, Any] | None = None
        self._runs: list[dict[str, Any]] = []

    def save_session(
        self,
        session_id: str,
        created_at: float,
        phase: str,
        top: str,
        journal: list[str],
        settings: dict[str, Any],
        files: dict[str, str],
        new_events: list[dict[str, Any]],
        state: dict[str, Any],
    ) -> None:
        with self._lock:
            events = (self._session or {}).get("newEvents", []) + list(new_events)
            self._session = {
                "id": session_id,
                "createdAt": created_at,
                "phase": phase,
                "top": top,
                "journal": list(journal),
                "settings": dict(settings),
                "files": dict(files),
                "newEvents": events,
                "state": state,
            }

    def start_run(
        self,
        run_id: str,
        session_id: str,
        number: int,
        command: str,
        top: str,
        clock: str,
        reset: str,
        started_at: float,
        settings: dict[str, Any],
        script: list[str],
        files: dict[str, str],
        analyzed: set[str],
        log_from: int,
        tools: dict[str, str],
    ) -> None:
        run = {
            "type": "runStarted",
            "id": run_id,
            "sessionId": session_id,
            "number": number,
            "command": command,
            "top": top,
            "clock": clock,
            "reset": reset,
            "startedAt": started_at,
            "settings": settings,
            "script": list(script),
            "files": [{"name": n, "text": t, "analyzed": n in analyzed} for n, t in files.items()],
            "logFrom": log_from,
            "tools": tools,
        }
        with self._lock:
            self._runs.append(run)

    def finish_run(
        self,
        run_id: str,
        status: str,
        finished_at: float,
        summary: dict[str, Any],
        log_to: int,
        properties: list[dict[str, Any]],
        traces: dict[str, dict[str, Any]],
    ) -> None:
        kept = {prop: trace for prop, trace in traces.items() if _fits(trace)}
        run = {
            "type": "runFinished",
            "id": run_id,
            "status": status,
            "finishedAt": finished_at,
            "summary": summary,
            "logTo": log_to,
            "properties": properties,
            "traces": kept,
            "tracesDropped": sorted(set(traces) - set(kept)),
        }
        with self._lock:
            self._runs.append(run)

    def drain(self) -> dict[str, Any]:
        """Everything waiting, once: {session: the newest save or None, runs: [...]}."""
        with self._lock:
            session, runs = self._session, self._runs
            self._session, self._runs = None, []
        return {"session": session, "runs": runs}


def _fits(trace: dict[str, Any]) -> bool:
    """A trace longer than the cap is not kept; its run keeps its results (ADR 0031)."""
    return len(json.dumps(trace).encode("utf-8")) <= PRAMAN_MAX_TRACE_BYTES


_outbox: Outbox | None = None


def use_outbox(outbox: Outbox | None) -> None:
    """The session host sets the outbox; without one (the tests) nothing is recorded."""
    global _outbox
    _outbox = outbox


def get_store() -> Outbox | None:
    return _outbox
