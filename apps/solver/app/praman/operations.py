"""What a session container does for each request: formal-verify's session routes, without HTTP.

Each operation takes the open session and a validated request (app/praman/protocol.py) and
returns the reply's fields, or raises OperationError with the status the web app passes on.
Traces of earlier runs are not here: the web app keeps them (ADR 0031) and answers from its copy
when the session no longer holds the run.
"""

from __future__ import annotations

import re
import time
from typing import TYPE_CHECKING, Any

from app.limits import PRAMAN_MAX_FILES_BYTES
from app.praman import ceilings
from app.praman.engine.export import label_of
from app.praman.protocol import (
    MAX_LINE_CHARS,
    CoverageTrace,
    Drivers,
    WhatIf,
    files_size,
)
from app.praman.services.counterexample import drivers_payload, trace_payload
from app.praman.services.formal_service import get_job
from app.praman.services.report import build_report
from app.praman.store import get_store
from app.praman.tclhost import CommandError

if TYPE_CHECKING:
    from app.praman.session import Session

NO_MINUTES = "No proof minutes are left today: proofs and checks stop at once until they come back."


class OperationError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def clean_name(name: str) -> str:
    """A file name as the session keeps it: forward slashes, no empty, `.` or `..` parts."""
    parts = name.replace("\\", "/").strip().split("/")
    return "/".join(part for part in parts if part not in ("", ".", ".."))


def put_file(session: Session, name: str, text: str) -> dict[str, Any]:
    name = clean_name(name)
    if not name:
        raise OperationError(400, "The file needs a name.")
    with session.lock:
        after = {**session.files, name: text}
        if files_size(after) > PRAMAN_MAX_FILES_BYTES:
            raise OperationError(413, "A session holds at most 1 MB of files.")
        existed = name in session.files
        session.files[name] = text
        session.bump()
    session.log("info", f"{'Replaced' if existed else 'Added'} the file {name}.", code="PMI003")
    session.suggest_script()
    session.persist()
    return {"name": name}


def delete_file(session: Session, name: str) -> dict[str, Any]:
    with session.lock:
        removed = session.files.pop(name, None) is not None
        session.bump()
    if removed:
        session.log("info", f"Removed the file {name} from the session.", code="PMI004")
        session.suggest_script()
        session.persist()
    return {"removed": removed}


def command(session: Session, line: str) -> dict[str, Any]:
    line = line.strip()
    if not line:
        return {"queued": False}
    if len(line) > MAX_LINE_CHARS:
        raise OperationError(413, "This command is too long; put it in a file and source it.")
    if ceilings.seconds_left() < 1:
        session.log("info", NO_MINUTES, code="PMI101")
    session.submit(line)
    return {"queued": True}


def stop(session: Session) -> dict[str, Any]:
    return {"stopped": session.commands.stop_proof("stopped by the user")}


def poll(session: Session, after: int, version: int) -> dict[str, Any]:
    """New log lines, the state when it changed, the records for the web app to keep, and the
    engine time used since the last poll (what the allowance counts)."""
    store = get_store()
    return {
        "events": session.events_after(after),
        "seq": session.seq,
        "version": session.version,
        "busy": session.busy,
        "proofRunning": session.proof.running,
        "state": session.snapshot() if session.version != version else None,
        "records": store.drain() if store is not None else {"session": None, "runs": []},
        "proofSeconds": round(ceilings.take_used(), 3),
        "serverTime": time.time(),
    }


def status(session: Session) -> dict[str, Any]:
    """Whether the session is working, for the supervisor's idle check; hands nothing over."""
    return {"busy": session.busy, "proofRunning": session.proof.running}


def trace(session: Session, prop_id: str) -> dict[str, Any]:
    prop = session.props.get(prop_id)
    if prop is None or not prop.has_trace or not prop.job_id:
        raise OperationError(404, "This property has no trace.")
    job = get_job(prop.job_id)
    payload = trace_payload(job, label_of(prop.id)) if job is not None else None
    if payload is None:
        raise OperationError(404, "This session no longer holds that run.")
    return {"trace": payload}


def what_if(session: Session, request: WhatIf) -> dict[str, Any]:
    if session.proof.running:
        # 423, not 409: the session is open, its proof holds the engines.
        raise OperationError(423, "A proof is running; try again when it has finished.")
    try:
        if request.quiet:
            found = session.commands.quiet_trace(request.property)
        else:
            pins = [pin.model_dump() for pin in request.pins]
            found = session.commands.what_if(request.property, pins, request.differ_from)
    except CommandError as error:
        raise OperationError(400, str(error)) from error
    payload = None
    if not found["message"]:
        payload = trace_payload(get_job(found["job_id"]), label_of(request.property))
    return {**found, "trace": payload}


def drivers(session: Session, request: Drivers) -> dict[str, Any]:
    prop = session.props.get(request.property)
    if request.job:
        if not request.job.startswith((f"{session.id}_w", f"{session.id}_c")):
            raise OperationError(404, "No such trace in this session.")
        job = get_job(request.job)
    else:
        job = get_job(prop.job_id) if prop is not None and prop.job_id else None
    if job is None:
        raise OperationError(404, "This session no longer holds that run; prove it again.")
    label = label_of(prop.id) if prop is not None else request.property
    return {"drivers": drivers_payload(job, request.signal, request.cycle, label)}


def coverage_trace(session: Session, request: CoverageTrace) -> dict[str, Any]:
    coverage = session.coverage or {}
    jobs = coverage.get("jobs") or {}
    key = "" if request.instance == session.top else request.instance
    job_id = jobs.get(key) or jobs.get(request.instance) or coverage.get("job_id", "")
    job = get_job(job_id) if job_id else None
    payload = trace_payload(job, request.label) if job is not None else None
    if payload is None:
        raise OperationError(404, "That trace is no longer here; run check_cov again.")
    return {"trace": payload}


def equivalence_trace(session: Session) -> dict[str, Any]:
    equivalence = session.equivalence or {}
    job = get_job(equivalence.get("job_id", "")) if equivalence.get("has_trace") else None
    payload = trace_payload(job, equivalence.get("label", "")) if job is not None else None
    if payload is None:
        raise OperationError(404, "There is no trace of a difference to show.")
    return {"trace": payload}


def report(session: Session) -> dict[str, Any]:
    """The last finished proof as one HTML file. The web app serves it only as a download."""
    job = get_job(session.proof.job_id) if session.proof.job_id else None
    if job is None or job.status not in ("complete", "failed"):
        raise OperationError(404, "There is no finished proof to report on in this session.")
    run = job.job_id.rsplit("_r", 1)[-1]
    name = re.sub(r"[^\w.-]+", "_", f"praman-report-{session.top or 'design'}-run{run}.html")
    return {"name": name, "html": build_report(job)}


def script(session: Session) -> dict[str, Any]:
    from app.praman.session import VERSION

    header = f"# Praman {VERSION} session script: the commands run in {session.label}\n"
    return {"text": header + "\n".join(session.journal) + "\n"}
