"""
Proof jobs and the workers that run them.

The web server does not run proofs itself: a proof becomes a job (ProofSpec)
in a queue, and worker processes (`python -m app.praman.worker`) take jobs
and run the engines.  So a proof survives a restart of the web server (a
deploy, or a reload during development), and the number of proofs running
at once is bounded on the whole machine, not per user.

The queue is a folder (one machine): QUEUE_DIR/pending/<job>.json; a worker
claims a job by renaming it to running/ (only one can), writes what happens
to jobs/<job>/events.jsonl and, at the end, the finished job to
jobs/<job>/job.pkl.  A file jobs/<job>/cancel asks it to stop.  The next job
goes to the workspace with the fewest jobs running (fair share).

PRAMAN_WORKERS: worker processes to keep (default 2; 0 runs proofs in the
web server, as the tests do).  If no worker takes a job, the web server runs
it itself.  Workers outlive a reload of the web server and stop when it has
been gone for a minute.
"""

from __future__ import annotations

import fcntl
import json
import logging
import os
import pickle
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger("praman.jobs")

POLL = 0.2                     # seconds between looks at a job's events
CLAIM_WAIT = 10.0              # seconds a job may wait for a worker before the server runs it itself
OWNER_LOOK = 5.0               # seconds between checks that the process running a job is still there
API_GONE = 60.0                # seconds without the server's heartbeat before an idle worker stops


def workers_wanted() -> int:
    try:
        return max(0, int(os.environ.get("PRAMAN_WORKERS", "") or 2))
    except ValueError:
        return 2


def queue_dir() -> Path:
    from app.praman.services.formal_service import FORMAL_WORK_DIR
    return FORMAL_WORK_DIR / "queue"


@dataclass
class ProofSpec:
    job_id: str
    workspace: str
    design_text: str
    sva_text: str
    design_name: str
    top: str
    depth: int
    per_property: int
    scans: list[int]
    only: list[str]
    reset_signal: str = ""
    reset_polarity: str = "auto"
    clock_signal: str = ""
    witness_covers: bool = True
    cache: bool = False                  # reuse and keep results (a signed-in user's workspace)
    cut: list[str] = field(default_factory=list)       # stopat signals
    without: list[str] = field(default_factory=list)   # assumptions left out
    submitted_at: float = field(default_factory=time.time)


EngineCallback = Callable[[str, str, str, bool], None]      # (label, kind of run, line, progress?)


def run_in_process(spec: ProofSpec, cancel: threading.Event, on_property: Callable[[dict], None],
                   on_progress: Callable[[str, int, int], None], on_engine: Optional[EngineCallback] = None):
    """Run the proof here (the worker, or the web server without workers); the finished FormalJob."""
    from app.praman.services.formal_service import FormalService
    service = FormalService()
    service.only = set(spec.only)
    service.cancel = cancel
    service.scans = list(spec.scans)
    service.on_property = on_property
    service.on_progress = on_progress
    service.on_engine = on_engine
    service.cut, service.without = list(spec.cut), list(spec.without)
    if spec.cache:
        from app.praman.store import StoreCache, get_store
        store = get_store()
        if store is not None:
            service.cache = StoreCache(store, spec.workspace)
    return service.run_formal(
        sva_code=spec.sva_text, dut_code=spec.design_text, dut_filename=spec.design_name, dut_top=spec.top,
        mode="prove", depth=spec.depth, timeout=spec.per_property, project_name=spec.job_id,
        reset_signal=spec.reset_signal, reset_polarity=spec.reset_polarity, clock_signal=spec.clock_signal,
        witness_covers=spec.witness_covers)


# ── The queue ─────────────────────────────────────────────────

def _dirs() -> dict[str, Path]:
    q = queue_dir()
    out = {name: q / name for name in ("pending", "running", "jobs", "workers")}
    for d in out.values():
        d.mkdir(parents=True, exist_ok=True)
    return out


def _write_atomic(path: Path, data: bytes) -> None:
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex[:8]}")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def submit(spec: ProofSpec) -> None:
    d = _dirs()
    (d["jobs"] / spec.job_id).mkdir(parents=True, exist_ok=True)
    _write_atomic(d["pending"] / f"{spec.job_id}.json", json.dumps(asdict(spec)).encode())


def claim(worker: str) -> Optional[ProofSpec]:
    """Take the next job: of the workspace with the fewest jobs running, the oldest."""
    d = _dirs()
    running: dict[str, int] = {}
    for f in d["running"].glob("*.json"):
        try:
            if not owner_alive(f.stem):
                continue                                  # its process is gone (collect ends it)
            ws = json.loads(f.read_text()).get("workspace", "")
            running[ws] = running.get(ws, 0) + 1
        except (OSError, ValueError):
            pass
    pending = []
    for f in d["pending"].glob("*.json"):
        try:
            spec = json.loads(f.read_text())
            pending.append((running.get(spec.get("workspace", ""), 0), spec.get("submitted_at", 0), f, spec))
        except (OSError, ValueError):
            continue
    for _, _, f, spec in sorted(pending, key=lambda p: (p[0], p[1])):
        try:
            os.rename(f, d["running"] / f.name)       # only one worker gets it
        except OSError:
            continue
        _own(spec["job_id"], worker)
        return ProofSpec(**spec)
    return None


def take_back(job_id: str) -> Optional[ProofSpec]:
    """The server takes a job no worker claimed (None if a worker has it by now)."""
    d = _dirs()
    mine = d["running"] / f"{job_id}.json"
    try:
        os.rename(d["pending"] / f"{job_id}.json", mine)
    except OSError:
        return None
    _own(job_id, "server")
    return ProofSpec(**json.loads(mine.read_text()))


def _own(job_id: str, name: str) -> None:
    """Record who runs a job: a name and the process id."""
    (_dirs()["jobs"] / job_id / "worker").write_text(f"{name} {os.getpid()}")


def owner_alive(job_id: str) -> bool:
    """False when the process that took the job has gone (killed, out of memory, a restart)."""
    try:
        pid = int((queue_dir() / "jobs" / job_id / "worker").read_text().split()[-1])
    except (OSError, ValueError, IndexError):
        return True                                       # not claimed yet, or no record: assume alive
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        pass
    return True


def emit(job_id: str, event: dict) -> None:
    with open(_dirs()["jobs"] / job_id / "events.jsonl", "a") as f:
        f.write(json.dumps(event, default=str) + "\n")


def finish(job_id: str, job) -> None:
    d = _dirs()
    _write_atomic(d["jobs"] / job_id / "job.pkl", pickle.dumps(job))
    emit(job_id, {"type": "done"})
    (d["running"] / f"{job_id}.json").unlink(missing_ok=True)


def cancel(job_id: str) -> None:
    (_dirs()["jobs"] / job_id / "cancel").touch()


def state(job_id: str) -> str:
    """pending | running | done | unknown"""
    d = _dirs()
    if (d["jobs"] / job_id / "job.pkl").exists():
        return "done"
    if (d["running"] / f"{job_id}.json").exists():
        return "running"
    if (d["pending"] / f"{job_id}.json").exists():
        return "pending"
    return "unknown"


def load(job_id: str):
    path = _dirs()["jobs"] / job_id / "job.pkl"
    return pickle.loads(path.read_bytes()) if path.exists() else None


def collect(job_id: str, cancel_event: threading.Event, on_property: Callable[[dict], None],
            on_progress: Callable[[str, int, int], None], after: int = 0,
            on_engine: Optional[EngineCallback] = None):
    """Follow a job to its end, calling back for each event; the finished FormalJob
    (None if it disappeared).  `after`: events already seen (a reattach)."""
    d = _dirs()
    events = d["jobs"] / job_id / "events.jsonl"
    skip, offset, rest = after, 0, ""
    asked_to_stop, last_look = False, time.time()
    while True:
        chunk = ""
        if events.exists():
            with open(events, "r", errors="replace") as f:
                f.seek(offset)
                chunk = f.read()
                offset = f.tell()
        lines = (rest + chunk).split("\n")
        rest = lines.pop()                                 # an unfinished line: the rest comes later
        for line in lines:
            if skip:
                skip -= 1
                continue
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event["type"] == "property":
                on_property(event["entry"])
            elif event["type"] == "progress":
                on_progress(event["label"], event["expired"], event["then"])
            elif event["type"] == "engine":
                if on_engine is not None:
                    on_engine(event["label"], event["kind"], event["text"], event.get("progress", False))
            elif event["type"] == "done":
                return load(job_id)
        if cancel_event.is_set() and not asked_to_stop:
            cancel(job_id)
            asked_to_stop = True
        now_state = state(job_id)
        if now_state == "unknown":
            return None
        if now_state == "running" and time.time() - last_look > OWNER_LOOK:
            last_look = time.time()
            if not owner_alive(job_id) and state(job_id) == "running":
                return _lost(job_id)
        time.sleep(POLL)


def _lost(job_id: str):
    """End a job whose process died before it finished (its decided properties were reported)."""
    from app.praman.services.formal_service import FormalJob
    logger.warning("the process running job %s is gone", job_id)
    job = FormalJob(job_id=job_id, status="failed",
                    error_message="the process running it stopped before the proof finished "
                                  "(it may have run out of memory); run it again")
    finish(job_id, job)
    return job


def run(spec: ProofSpec, cancel_event: threading.Event, on_property: Callable[[dict], None],
        on_progress: Callable[[str, int, int], None], on_engine: Optional[EngineCallback] = None):
    """Run a proof on a worker (or here, without workers); the finished FormalJob."""
    if workers_wanted() == 0:
        return run_in_process(spec, cancel_event, on_property, on_progress, on_engine)
    ensure_workers()
    submit(spec)
    deadline = time.time() + CLAIM_WAIT
    while state(spec.job_id) == "pending" and time.time() < deadline and not cancel_event.is_set():
        time.sleep(POLL)
    if state(spec.job_id) == "pending":
        mine = take_back(spec.job_id)
        if mine is not None:
            logger.warning("no worker took job %s; the web server runs it", spec.job_id)
            job = run_in_process(mine, cancel_event, on_property, on_progress, on_engine)
            finish(spec.job_id, job)
            return job
    return collect(spec.job_id, cancel_event, on_property, on_progress, on_engine=on_engine)


# ── Keeping workers ───────────────────────────────────────────

def heartbeat_api() -> None:
    (_dirs()["workers"] / "api.alive").touch()


def _slot_free(slot: int) -> bool:
    path = _dirs()["workers"] / f"slot-{slot}.lock"
    with open(path, "a") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return False
        fcntl.flock(f, fcntl.LOCK_UN)
        return True


_spawn_lock = threading.Lock()


def ensure_workers() -> int:
    """Start the workers that are not running; the number running afterwards."""
    wanted = workers_wanted()
    if wanted == 0:
        return 0
    heartbeat_api()
    started = 0
    with _spawn_lock:
        for slot in range(wanted):
            if _slot_free(slot):
                env = dict(os.environ)
                from app.praman.services.formal_service import FORMAL_WORK_DIR
                env["FORMAL_WORK_DIR"] = str(FORMAL_WORK_DIR)
                log = open(_dirs()["workers"] / f"slot-{slot}.log", "a")
                subprocess.Popen([sys.executable, "-m", "app.praman.worker", str(slot)],
                                 cwd=str(Path(__file__).resolve().parents[2]), env=env,
                                 stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                started += 1
    if started:
        logger.info("started %d proof worker(s)", started)
    return wanted


_heartbeat: Optional[threading.Thread] = None


def start_heartbeat() -> None:
    """The server says it is alive every few seconds (idle workers stop without it)."""
    global _heartbeat
    if workers_wanted() == 0 or (_heartbeat is not None and _heartbeat.is_alive()):
        return

    def beat():
        while True:
            try:
                heartbeat_api()
            except OSError:
                pass
            time.sleep(5)
    _heartbeat = threading.Thread(target=beat, name="praman-heartbeat", daemon=True)
    _heartbeat.start()


def api_alive() -> bool:
    path = _dirs()["workers"] / "api.alive"
    return path.exists() and time.time() - path.stat().st_mtime < API_GONE


def code_changed_since(t: float) -> bool:
    """A source file of the app changed after `t` (a worker then restarts with the new code)."""
    root = Path(__file__).resolve().parents[1]
    return any(p.stat().st_mtime > t for p in root.rglob("*.py"))
