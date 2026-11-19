"""
A Praman session: what a JasperGold session is to its user.

It holds the uploaded files, the analyzed sources, the elaborated design
(hierarchy and property table), clock and reset, the proof results and the
log.  Everything that changes it is a Tcl command (app/praman/commands.py):
the console, the menus of the UI and `source pm.tcl` all go through
`Session.submit`, so the journal of a session reproduces it.

Commands run one at a time on the session's worker thread.  The log is a
list of numbered events; the UI polls for the events after the last one it
has, and for a new snapshot of the state when `version` moved.

State lives in memory for now (the database comes with the run history).
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import queue
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from app.praman.store import get_store
from app.praman.tclhost import ExitRequested, TclError, TclHost
from app.praman.services.uploads import JoinedSource

logger = logging.getLogger("praman.session")

VERSION = "0.1"
MAX_EVENTS = 20_000              # log lines kept per session
IDLE_SECONDS = 4 * 3600          # a session nobody polled for this long is closed
MAX_SESSIONS = 200

RESTARTED = ("The server was restarted: this session was restored with its files, log, design and results. "
             "Tcl variables are not kept.")
RESTARTED_FILES = ("The server was restarted: the files and the log of this session were restored. "
                   "Run your script again to analyze and elaborate the design.")

# Final states of a property (the others: not_run, running, stopped)
DETERMINED = {"proven", "cex", "covered", "unreachable", "vacuous"}


@dataclass
class Prop:
    id: str                      # label the engine knows (unique in the design)
    name: str                    # hierarchical name shown: <instance>.<label>
    type: str                    # assert | assume | cover | restrict
    instance: str                # instance the statement is in
    file: str = ""
    line: int = 0
    parent: str = ""             # related covers: id of their assertion
    related: str = ""            # precondition | witness (covers), case (a case of a split assertion)
    supported: bool = True
    status: str = "not_run"      # not_run running proven cex covered unreachable undetermined
                                 # vacuous error stopped; assumptions stay "assumed"
    detail: str = ""
    bound: Optional[int] = None  # cycles of the trace, or the depth checked
    engine: str = ""
    seconds: Optional[float] = None
    started_at: Optional[float] = None   # server time (epoch seconds) the engines took it up
    has_trace: bool = False
    job_id: str = ""             # the run that holds its trace
    expr: str = ""               # cases of a split: the case expression
    activity: str = ""           # while running: what its engines are doing ("proof: engine_0: frame 12")
    disabled: bool = False       # assert/assume/cover -disable: not proven / not assumed
    task: str = ""               # the task it is in ("": <embedded>); its id is then <task>::<label>


@dataclass
class Proof:
    running: bool = False
    background: bool = False
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    total: int = 0
    job_id: str = ""
    time_limit: int = 0
    engine_lines: int = 0        # solver lines logged (Engine detail), up to MAX_ENGINE_LINES
    own_runs: set = field(default_factory=set, repr=False)   # properties with runs of their own by now
    cancel: threading.Event = field(default_factory=threading.Event, repr=False)
    stopped: bool = False
    reason: str = ""             # why it was stopped
    recorded: bool = False       # the run is in the database
    selected: list = field(default_factory=list)   # ids of the properties asked for
    task: str = ""                                  # the task proven ("": <embedded>)
    per_property: int = 0
    sources: tuple = ("", "")    # (design text, SVA text) the run proves: with the case splits applied
    thread: Optional[threading.Thread] = field(default=None, repr=False)


class Session:
    def __init__(self, session_id: str = "", workspace: str = "", restored: Optional[dict] = None,
                 persistent: bool = True, owner: str = "", number: int = 0):
        """restored: what the database kept of this session (store.load_session),
        when it comes back after a server restart.  persistent: kept in the
        database (a signed-in user's session); otherwise it lives in memory only
        and nothing of it - files, log, runs - is saved."""
        from app.praman.commands import Commands, COMMAND_NAMES   # commands need the session type
        self.id = session_id or f"pm_{uuid.uuid4().hex[:16]}"
        self.workspace = workspace
        self.persistent = persistent
        self.owner = owner                              # the signed-in user's name ("" for a guest)
        self.number = number                            # the how-manieth session of its owner
        self.key = uuid.uuid4().hex                     # what its stream is opened with (the owner has it)
        self.created = time.time()
        self.touched = time.time()
        # A page that saw an earlier life of this session (before a server
        # restart) must not take a fresh counter's value for one it has seen.
        self.version = secrets.randbelow(10 ** 9)
        self.lock = threading.RLock()

        self.files: dict[str, str] = {}                 # uploaded path -> text
        self.events: list[dict] = []
        self.seq = 0
        self.version = 0
        self.journal: list[str] = []
        self.runs = 0

        self.commands = Commands(self)
        self.host = TclHost(COMMAND_NAMES)
        self._queue: "queue.Queue[Optional[tuple[str, str]]]" = queue.Queue()
        self._pending = 0
        self._closed = False
        self.proof = Proof()
        self.reset_design()
        self.settings = {"time_limit": 86400, "per_property_time_limit": 300, "max_trace_length": 20}

        self.auto_script = ""                           # the pm.tcl written for the files, while it is ours
        self._listeners: set = set()                    # (event loop, asyncio.Event) of the open streams
        self._persist_lock = threading.Lock()
        self._persisted_seq = 0
        self._persist_failed = False
        design_back = False
        if restored:
            self.created = restored.get("created_at") or self.created
            self.files = dict(restored.get("files") or {})
            self.journal = list(restored.get("journal") or [])
            self.settings.update(restored.get("settings") or {})
            self.events = list(restored.get("events") or [])[-MAX_EVENTS:]
            self.seq = self._persisted_seq = self.events[-1]["seq"] if self.events else 0
            design_back = self._restore_state(restored.get("state") or {})
            self.runs = max(self.runs, int(restored.get("last_run") or 0))   # new runs get new numbers

        self._worker = threading.Thread(target=self._work, name=f"praman-{self.id}", daemon=True)
        self._worker.start()
        if restored:
            message = RESTARTED if design_back else RESTARTED_FILES
            if not (self.events and self.events[-1]["text"] == message):    # once, however often it restarts
                self.log("info", message, code="PMI006")
            running = (restored.get("state") or {}).get("proof")
            if design_back and running:
                try:
                    self.commands.resume_proof(running)
                except Exception:
                    logger.exception("session %s: the running proof could not be resumed", self.id)
        else:
            self.log("info", f"Praman {VERSION}: {self.label} started. Type 'help' for the commands.",
                     code="PMI001")
        self.persist()

    # ── State ─────────────────────────────────────────────────

    def reset_design(self) -> None:
        """`clear -all`: nothing analyzed, nothing elaborated."""
        self.analyzed: list[tuple[str, str]] = []       # (file, text) in analyze order
        self.phase = "empty"                            # empty | analyzed | elaborated
        self.top = ""
        self.tree: Optional[dict] = None
        self.ports: list[dict] = []
        self.instances = 0
        self.props: dict[str, Prop] = {}
        self.design: Optional[JoinedSource] = None      # joined design files, as compiled
        self.sva: Optional[JoinedSource] = None         # joined SVA files
        self.clock: Optional[str] = None                # None = not declared, "" = none
        self.reset: Optional[tuple[str, bool]] = None   # (signal, active low); ("", False) = none
        self.reset_declared = False
        self.detected: dict = {}                        # what elaboration found (reset, clocks)
        self.related: set[str] = {"precondition", "witness"}   # related covers made by elaborate
        self.splits: dict[str, list[str]] = {}          # case splits: assertion label -> case expressions
        self.tcl_props: list[dict] = []                 # written in Tcl: {name, kind, expr} (app/praman/tclprops.py)
        self.stopats: list[str] = []                    # signals cut (stopat): free in every cycle
        self.abstracts: list[str] = []                  # abstract: "init:<reg>" / "counter:<reg>"
        self.tasks: list[str] = []                      # tasks made with task -create (besides <embedded>)
        self.task = ""                                  # the current task ("": <embedded>)
        self.strength: Optional[dict] = None            # the last check_strength
        self.coverage: Optional[dict] = None            # the last check_cov
        self.equivalence: Optional[dict] = None         # the last check_equivalence
        self.dead_end: Optional[dict] = None            # the last check_assumptions -dead_end
        self.bump()

    def bump(self) -> None:
        self.version = getattr(self, "version", 0) + 1
        self._wake()

    # ── Streams (routers/praman.py /stream): told when there is something new ──

    def subscribe(self, loop, event) -> None:
        self._listeners.add((loop, event))

    def unsubscribe(self, loop, event) -> None:
        self._listeners.discard((loop, event))

    def _wake(self) -> None:
        for loop, event in list(getattr(self, "_listeners", set())):
            try:
                loop.call_soon_threadsafe(event.set)
            except RuntimeError:                         # its loop is gone
                self._listeners.discard((loop, event))

    def clear_results(self, why: str = "") -> None:
        cleared = False
        for prop in self.props.values():
            if prop.supported and prop.type != "assume" and prop.status != "not_run":
                cleared = True
            if prop.supported and prop.type != "assume":
                prop.status, prop.detail, prop.bound, prop.engine = "not_run", "", None, ""
                prop.seconds, prop.started_at, prop.has_trace, prop.job_id = None, None, False, ""
        if cleared:
            self.log("info", "Clearing proof results of all properties." + (f" ({why})" if why else ""),
                     code="PMI032")
        self.bump()

    @property
    def busy(self) -> bool:
        return self._pending > 0

    # ── Log ───────────────────────────────────────────────────

    def log(self, kind: str, text: str, code: str = "", depth: int = 0, prop: str = "",
            action: Optional[dict] = None) -> None:
        """kind: cmd (an echoed command) | out (a command's output) | info |
        warning | error | result (a property was decided) | engine | ui (an
        action for the UI, not shown)."""
        with self.lock:
            self.seq += 1
            event: dict[str, Any] = {"seq": self.seq, "t": round(time.time(), 3), "kind": kind, "text": text}
            if code:
                event["code"] = code
            if depth:
                event["depth"] = depth
            if prop:
                event["prop"] = prop
            if action:
                event["action"] = action
            self.events.append(event)
            if len(self.events) > MAX_EVENTS:
                del self.events[: len(self.events) - MAX_EVENTS]
        self._wake()

    @property
    def label(self) -> str:
        """What the session is called where people see it.  (Its id is random on
        purpose: it is part of what keeps a session to its owner.)"""
        if self.persistent and self.owner:
            return f"{self.owner} · Session {self.number}" if self.number else f"{self.owner}'s session"
        return "Guest session"

    def _state(self) -> dict:
        """What a restart must bring back besides files and log (kept as JSON)."""
        state: dict[str, Any] = {"runs": self.runs, "phase": self.phase, "auto_script": self.auto_script,
                                 "owner": self.owner, "number": self.number, "stream_key": self.key}
        if self.proof.running and self.proof.selected:   # a worker may go on with it through a restart
            state["proof"] = {"job_id": self.proof.job_id, "selected": self.proof.selected,
                              "per_property": self.proof.per_property, "started_at": self.proof.started_at,
                              "task": self.proof.task,
                              "time_limit": self.proof.time_limit}
        if self.phase != "empty":
            state["analyzed"] = [[name, hashlib.sha256(text.encode("utf-8")).hexdigest()]
                                 for name, text in self.analyzed]
        if self.phase == "elaborated":
            state.update(
                top=self.top, clock=self.clock, reset=list(self.reset) if self.reset is not None else None,
                reset_declared=self.reset_declared, related=sorted(self.related), detected=self.detected,
                tree=self.tree, ports=self.ports, instances=self.instances, splits=self.splits,
                tcl_props=self.tcl_props, stopats=self.stopats, abstracts=self.abstracts, tasks=self.tasks, task=self.task,
                props=[asdict(p) for p in self.props.values()])
        return state

    def _restore_state(self, state: dict) -> bool:
        """Bring the analyzed sources and the elaborated design back as they
        were saved.  True if the design is back; False if only what was
        analyzed (or nothing) could be restored: an analyzed file that is no
        longer in the session as it was means the design must be rebuilt."""
        from app.praman import sources
        self.runs = int(state.get("runs") or 0)
        self.auto_script = state.get("auto_script") or ""
        # the page that had the session open goes on streaming after a restart
        self.key = state.get("stream_key") or self.key
        self.owner = state.get("owner") or self.owner
        self.number = int(state.get("number") or 0)
        analyzed = state.get("analyzed") or []
        if not analyzed or any(
                name not in self.files
                or hashlib.sha256(self.files[name].encode("utf-8")).hexdigest() != sha for name, sha in analyzed):
            return False
        self.analyzed = [(name, self.files[name]) for name, _ in analyzed]
        self.phase = "analyzed"
        if state.get("phase") != "elaborated" or not state.get("tree"):
            return False
        try:
            self.design, self.sva, _ = sources.joined(self.analyzed, state["top"])
            props = {p["id"]: Prop(**p) for p in state.get("props") or []}
        except Exception:
            logger.exception("session %s: the saved design could not be restored", self.id)
            return False
        for prop in props.values():
            if prop.status == "running":                 # its proof ended with the server
                prop.status, prop.detail, prop.started_at = "stopped", "the server was restarted", None
        self.props = props
        self.top, self.tree, self.ports = state["top"], state["tree"], state.get("ports") or []
        self.instances = state.get("instances") or 0
        self.clock = state.get("clock")
        self.reset = tuple(state["reset"]) if state.get("reset") is not None else None
        self.reset_declared = bool(state.get("reset_declared"))
        self.related = set(state.get("related") or [])
        self.splits = {label: list(cases) for label, cases in (state.get("splits") or {}).items()}
        self.tcl_props = [dict(t) for t in state.get("tcl_props") or []]
        self.stopats = list(state.get("stopats") or [])
        self.abstracts = list(state.get("abstracts") or [])
        self.tasks = list(state.get("tasks") or [])
        self.task = state.get("task") or ""
        self.detected = state.get("detected") or {}
        self.phase = "elaborated"
        self.bump()
        return True

    def suggest_script(self) -> None:
        """Keep a pm.tcl for the files of the session, as long as the user has
        no script of their own: it is written when source files arrive and
        rewritten when they change, never once it was edited, and never run."""
        from app.praman import sources
        with self.lock:
            scripts = [name for name in self.files if sources.SCRIPT_FILE.search(name)]
            ours = self.files.get(sources.DEFAULT_SCRIPT) == self.auto_script and bool(self.auto_script)
            if scripts and not (ours and scripts == [sources.DEFAULT_SCRIPT]):
                return                                   # the user has a script
            script, what = sources.default_script(self.files)
            if not script:
                if ours:                                 # no source files left
                    del self.files[sources.DEFAULT_SCRIPT]
                    self.auto_script = ""
                    self.bump()
                return
            if script == self.auto_script:
                return
            first = not ours
            self.files[sources.DEFAULT_SCRIPT] = self.auto_script = script
            self.bump()
        self.log("info", f"{'Wrote' if first else 'Updated'} {sources.DEFAULT_SCRIPT} for these files ({what}). "
                         f"Check it, then run it: source {sources.DEFAULT_SCRIPT}", code="PMI009")

    def persist(self) -> None:
        """Write the session (files, journal, new log lines) to the database.
        Best effort: a database that is down does not stop the session."""
        store = get_store()
        if store is None or self._closed or not self.persistent:
            return
        with self._persist_lock:
            with self.lock:
                new = [e for e in self.events if e["seq"] > self._persisted_seq]
                files, journal, settings = dict(self.files), list(self.journal), dict(self.settings)
                phase, top, state = self.phase, self.top, self._state()
            try:
                store.save_session(self.id, self.workspace, self.created, phase, top, journal, settings, files,
                                   new, state)
                if new:
                    self._persisted_seq = new[-1]["seq"]
            except Exception:
                logger.exception("session %s could not be saved", self.id)
                if not self._persist_failed:
                    self._persist_failed = True
                    self.log("warning", "The database cannot be written: this session and its runs are not "
                                        "being kept for the run history.", code="PMW007")

    def events_after(self, seq: int, limit: int = 2000) -> list[dict]:
        with self.lock:
            if not self.events or seq >= self.seq:
                return []
            first = self.events[0]["seq"]
            start = max(0, seq - first + 1)
            return self.events[start:start + limit]

    # ── Running commands ──────────────────────────────────────

    def submit(self, line: str) -> None:
        """Queue a console line (any Tcl).  `stop` acts at once, even while a
        proof is running in the foreground."""
        self.touched = time.time()
        if line.strip() == "stop" and (self.busy or self.proof.running):
            self.log("cmd", "stop")
            self.commands.stop_proof("stopped by the user")
            return
        with self.lock:
            self._pending += 1
        self._queue.put(("eval", line))

    def _work(self) -> None:
        while True:
            item = self._queue.get()
            if item is None:
                return
            _, line = item
            try:
                self._run(line)
            except Exception as e:                      # never lose the worker
                logger.exception("session %s: command failed", self.id)
                self.log("error", f"internal error: {e}", code="PME999")
            finally:
                with self.lock:
                    self._pending -= 1
                    self.bump()
                self.persist()

    def _run(self, line: str) -> None:
        self.journal.append(line)
        self.log("cmd", line)
        try:
            result = self.host.evaluate(
                line,
                on_call=self.commands.call,
                on_out=lambda text, newline: self.log("out", text),
                on_echo=lambda depth, text: self.log("cmd", text, depth=depth),
            )
            if result:
                self.log("out", result)
        except ExitRequested:
            self.log("info", "exit: the script stops here; the session stays open.", code="PMI002")
        except TclError as e:
            if not self.host.alive():
                self.log("error", "The Tcl interpreter stopped; starting a new one (Tcl variables are lost).",
                         code="PME998")
                self.host.close()
                self.host = TclHost(self.host.commands)
            else:
                self.log("error", str(e), code="PME000")

    def wait_idle(self, timeout: float = 600) -> bool:
        """Block until queued commands (and a background proof) are done; for tests and batch runs."""
        end = time.time() + timeout
        while time.time() < end:
            if not self.busy and not self.proof.running:
                return True
            time.sleep(0.05)
        return False

    def close(self) -> None:
        if self._closed:
            return
        self.persist()
        self._closed = True
        self._wake()
        self.proof.cancel.set()
        self._queue.put(None)
        self.host.close()

    # ── What the UI reads ─────────────────────────────────────

    def snapshot(self) -> dict:
        with self.lock:
            analyzed = {name for name, _ in self.analyzed}
            proof = self.proof
            return {
                "id": self.id,
                "label": self.label,
                "stream_key": self.key,
                "persistent": self.persistent,
                "version": self.version,
                "phase": self.phase,
                "busy": self.busy,
                "top": self.top,
                "clock": self.clock,
                "reset": None if self.reset is None else
                         {"signal": self.reset[0], "active_low": self.reset[1]},
                "detected": self.detected,
                "tree": self.tree,
                "ports": self.ports,
                "instances": self.instances,
                "files": [{"name": name, "lines": text.count("\n") + 1, "bytes": len(text.encode()),
                           "analyzed": name in analyzed} for name, text in sorted(self.files.items())],
                "properties": [asdict(p) for p in self.props.values()],
                "settings": dict(self.settings),
                "proof": {"running": proof.running, "background": proof.background,
                          "started_at": proof.started_at, "finished_at": proof.finished_at,
                          "total": proof.total, "job_id": proof.job_id, "time_limit": proof.time_limit},
                "summary": self.summary(),
                "strength": self.strength,
                "coverage": self.coverage,
                "equivalence": self.equivalence,
                "tasks": list(self.tasks),
                "task": self.task,
                "stopats": list(self.stopats),
                "abstracts": [{"signal": a.split(":", 1)[1], "kind": a.split(":", 1)[0]} for a in self.abstracts],
                "dead_end": self.dead_end,
            }

    def summary(self) -> dict:
        """Counts as in the SUMMARY block of a proof."""
        counts: dict[str, dict[str, int]] = {"assert": {}, "cover": {}, "related": {}, "case": {}, "assume": {}}
        for prop in self.props.values():
            group = "case" if prop.related == "case" else "related" if prop.related else \
                "assume" if prop.type in ("assume", "restrict") else prop.type if prop.type in counts else "assert"
            counts[group][prop.status] = counts[group].get(prop.status, 0) + 1
            counts[group]["total"] = counts[group].get("total", 0) + 1
        return counts


# ── Registry ──────────────────────────────────────────────────

_sessions: dict[str, Session] = {}
_registry_lock = threading.Lock()


def _make_room() -> None:
    _expire()
    if len(_sessions) >= MAX_SESSIONS:
        idle = [s for s in _sessions.values() if not s.proof.running] or list(_sessions.values())
        oldest = min(idle, key=lambda s: s.touched)
        _sessions.pop(oldest.id).close()


def next_number(workspace: str) -> int:
    """The number the next saved session of `workspace` gets (1, 2, ...)."""
    store = get_store()
    try:
        return store.count_sessions(workspace) + 1 if store is not None else 0
    except Exception:
        logger.exception("sessions of %s could not be counted", workspace)
        return 0


def create_session(workspace: str = "", persistent: bool = True, owner: str = "") -> Session:
    number = next_number(workspace) if persistent and owner else 0
    with _registry_lock:
        _make_room()
        session = Session(workspace=workspace, persistent=persistent, owner=owner, number=number)
        _sessions[session.id] = session
        return session


def get_session(session_id: str) -> Optional[Session]:
    """The session; one the database kept from before a restart is brought
    back with its files and log (nothing analyzed or elaborated)."""
    session = _sessions.get(session_id)
    if session is None:
        store = get_store()
        if store is None:
            return None
        try:
            kept = store.load_session(session_id)
        except Exception:
            logger.exception("session %s could not be read from the database", session_id)
            return None
        if kept is None:
            return None
        with _registry_lock:
            session = _sessions.get(session_id)
            if session is None:
                _make_room()
                session = Session(session_id, kept.get("workspace", ""), restored=kept)
                _sessions[session_id] = session
    session.touched = time.time()
    return session


def close_session(session_id: str) -> bool:
    with _registry_lock:
        session = _sessions.pop(session_id, None)
    if session is None:
        return False
    session.close()
    return True


def _expire() -> None:
    now = time.time()
    for session_id in [sid for sid, s in _sessions.items()
                       if now - s.touched > IDLE_SECONDS and not s.proof.running]:
        _sessions.pop(session_id).close()


def close_all_sessions() -> None:
    """The server is stopping: save and close every session (they come back from the database)."""
    with _registry_lock:
        open_sessions = list(_sessions.values())
        _sessions.clear()
    for session in open_sessions:
        try:
            session.commands.stop_proof("the server is stopping")
            session.close()
        except Exception:
            logger.exception("session %s could not be closed", session.id)
