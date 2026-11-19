"""A session container's entry point: `python -m app.praman.host` (ADR 0031).

One Praman session per process. Requests come one Envelope per line on stdin
(app/praman/protocol.py) and each gets one line {"id", "reply"} on stdout; the first opens the
session. Opening and closing are answered in order; every other request on a worker thread, so a
what-if that runs a proof does not hold up polls. Stdout carries nothing else: the host keeps it
for replies and points everything else (stray prints, tool output) at stderr. The process ends
when stdin closes or the session is closed.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import IO, Any

from pydantic import ValidationError

from app.praman import ceilings
from app.praman.protocol import Envelope, Open, Request
from app.praman.store import Outbox, get_store, use_outbox
from app.workspace import strip_folder

logger = logging.getLogger("praman.host")

MAX_REQUEST_BYTES = 3 * 1024 * 1024  # a saved session: 1 MB of files, its log, JSON escaping
WATCH_SECONDS = 1.0
WORKERS = 4  # requests answered at once (a what-if, a report, polls)
PATH_KEYS = frozenset({"vcd_path"})  # Praman's trace payloads name the trace file
IN_ORDER = ("open", "close")


def error(status: int, message: str) -> dict[str, Any]:
    return {"ok": False, "status": status, "error": message}


class Host:
    def __init__(self) -> None:
        self.session: Any = None  # app.praman.session.Session, imported once the work folder is set
        self.closed = False
        self._stopping = threading.Event()

    def answer(self, request: Request) -> dict[str, Any]:
        limits = getattr(request, "ceilings", None)
        if limits is not None:
            ceilings.set_ceilings(limits)
        if isinstance(request, Open):
            return self._open(request)
        if self.session is None:
            return error(409, "The session is not open.")
        return self._run(request)

    def _open(self, request: Open) -> dict[str, Any]:
        if self.session is not None:
            return error(409, "The session is already open.")
        from app.praman.session import Session

        use_outbox(Outbox())
        saved = request.saved
        restored = None if saved is None else saved.model_dump()
        self.session = Session(request.session_id, restored=restored, name=request.name)
        if saved is None:  # a new session starts at the learner's ceilings
            limits = request.ceilings
            self.session.settings.update(
                time_limit=limits.proof_seconds,
                per_property_time_limit=min(300, limits.proof_seconds),
                max_trace_length=min(20, limits.trace_length),
            )
        threading.Thread(target=self._watch, name="praman-watch", daemon=True).start()
        return {"ok": True, "state": self.session.snapshot()}

    def _run(self, request: Request) -> dict[str, Any]:
        from app.praman.operations import OperationError

        try:
            return {"ok": True, **self._operation(request)()}
        except OperationError as failure:
            return error(failure.status, failure.message)
        except Exception:
            logger.exception("operation %s failed", request.op)
            return error(500, "The session could not do that.")

    def _operation(self, request: Request) -> Callable[[], dict[str, Any]]:
        from app.praman import operations as do

        s = self.session
        table: dict[str, Callable[[], dict[str, Any]]] = {
            "command": lambda: do.command(s, request.line),
            "stop": lambda: do.stop(s),
            "status": lambda: do.status(s),
            "poll": lambda: do.poll(s, request.after, request.version),
            "putFile": lambda: do.put_file(s, request.name, request.text),
            "deleteFile": lambda: do.delete_file(s, request.name),
            "trace": lambda: do.trace(s, request.property),
            "whatIf": lambda: do.what_if(s, request),
            "drivers": lambda: do.drivers(s, request),
            "coverageTrace": lambda: do.coverage_trace(s, request),
            "equivalenceTrace": lambda: do.equivalence_trace(s),
            "report": lambda: do.report(s),
            "script": lambda: do.script(s),
            "close": self._close,
        }
        return table[request.op]

    def _close(self) -> dict[str, Any]:
        """Close the session; the reply carries its last records and the engine time used."""
        self.session.commands.stop_proof("the session was closed")
        self.session.close()
        self.closed = True
        self._stopping.set()
        store = get_store()
        records = store.drain() if store is not None else {"session": None, "runs": []}
        return {"records": records, "proofSeconds": round(ceilings.take_used(), 3)}

    def _watch(self) -> None:
        """Stop a running proof as soon as today's proof time is used up."""
        from app.praman.operations import NO_MINUTES

        stopped_for = ""
        while not self._stopping.wait(WATCH_SECONDS):
            proof = self.session.proof
            if proof.running and proof.job_id != stopped_for and ceilings.seconds_left() < 1:
                self.session.commands.stop_proof("no proof minutes are left today")
                self.session.log("info", NO_MINUTES, code="PMI101")
                stopped_for = proof.job_id


def scrub(value: object, folder: Path) -> object:
    """A reply without server paths (hardening finding 9): the work folder is cut from every text
    and trace payloads lose their file path."""
    if isinstance(value, str):
        return strip_folder(value, folder)
    if isinstance(value, list):
        return [scrub(item, folder) for item in value]
    if isinstance(value, dict):
        return {key: scrub(item, folder) for key, item in value.items() if key not in PATH_KEYS}
    return value


def parse(line: str) -> Envelope | dict[str, Any]:
    """The envelope on a line, or the error reply (with no id) when there is none."""
    if len(line.encode()) > MAX_REQUEST_BYTES:
        return error(413, "The request is too large.")
    try:
        return Envelope.model_validate_json(line)
    except ValidationError:
        return error(400, "The request is not valid.")


class Replies:
    """Stdout for replies only: file descriptor 1 is pointed at stderr for everything else."""

    def __init__(self, folder: Path) -> None:
        self._folder = folder
        self._stream: IO[str] = os.fdopen(os.dup(1), "w", encoding="utf-8")
        self._lock = threading.Lock()
        os.dup2(2, 1)
        sys.stdout = sys.stderr

    def send(self, request_id: str, reply: dict[str, Any]) -> None:
        with self._lock:
            clean = scrub(reply, self._folder)
            self._stream.write(json.dumps({"id": request_id, "reply": clean}) + "\n")
            self._stream.flush()


def serve(host: Host, replies: Replies, lines: IO[str]) -> None:
    with ThreadPoolExecutor(max_workers=WORKERS, thread_name_prefix="praman-request") as pool:
        for line in lines:
            envelope = parse(line)
            if not isinstance(envelope, Envelope):
                replies.send("", envelope)
            elif envelope.request.op in IN_ORDER:
                replies.send(envelope.id, host.answer(envelope.request))
                if host.closed:
                    break
            else:
                pool.submit(lambda e=envelope: replies.send(e.id, host.answer(e.request)))
    if host.session is not None and not host.closed:
        host.answer(Envelope.model_validate({"id": "eof", "request": {"op": "close"}}).request)


def main() -> int:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    # Praman reads its work folder when its modules load: set it first (the container sets it).
    os.environ.setdefault("FORMAL_WORK_DIR", tempfile.mkdtemp(prefix="praman-"))
    serve(Host(), Replies(Path(os.environ["FORMAL_WORK_DIR"])), sys.stdin)
    return 0


if __name__ == "__main__":
    sys.exit(main())
