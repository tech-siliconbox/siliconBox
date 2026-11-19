"""Attacks on a Praman session (ADR 0031; hardening findings 15, 16 and 17).

The Tcl console runs learner scripts. Escapes from its safe interpreter and endless scripts are
tried against the session host directly (the interpreter is the same in a container); memory
and a full proof are tried in a real session container (needs Docker and the image).
"""

import json
import time
import uuid
from collections.abc import Iterator

import pytest

from app.limits import PRAMAN_SESSION_MEMORY, RUNNER_PIDS
from app.praman import ceilings
from app.praman.host import Host
from app.praman.protocol import Envelope
from app.praman.store import use_outbox
from app.praman.tclhost import tclsh_path
from app.session_runners import ContainerSessionRunner, SessionProcess, session_container_command
from tests.conftest import IMAGE, needs_image
from tests.praman.session.designs import PAIR, PAIR_SVA

LIMITS = {"proofSeconds": 300, "traceLength": 50, "secondsLeft": 3600}
needs_tcl = pytest.mark.skipif(tclsh_path() is None, reason="tclsh is not installed")


def envelope(op: str, request_id: str = "r", **fields) -> Envelope:
    return Envelope.model_validate({"id": request_id, "request": {"op": op, **fields}})


@pytest.fixture
def host(monkeypatch: pytest.MonkeyPatch) -> Iterator[Host]:
    monkeypatch.setenv("PRAMAN_TCL_BUDGET", "1")  # seconds of Tcl computing per evaluation
    opened = Host()
    assert opened.answer(envelope("open", sessionId="attack", ceilings=LIMITS).request)["ok"]
    yield opened
    opened.answer(envelope("close").request)
    ceilings.set_ceilings(None)
    use_outbox(None)


def console(host: Host, line: str) -> str:
    """Run a console line; the log text it wrote."""
    before = host.session.seq
    host.answer(envelope("command", line=line, ceilings=LIMITS).request)
    assert host.session.wait_idle(60)
    return "\n".join(event["text"] for event in host.session.events_after(before))


@needs_tcl
@pytest.mark.parametrize(
    "script",
    [
        "exec id",
        "open /etc/passwd",
        "socket 127.0.0.1 22",
        "file delete -force /tmp",
        "cd /",
        "load libc.so.6",
        "interp invokehidden {} exec id",
        "interp create child; child eval {exec id}",
        "interp expose {} exec; exec id",
        "package require http",
    ],
)
def test_the_tcl_console_cannot_escape_its_safe_interpreter(host: Host, script: str) -> None:
    log = console(host, script)
    assert "uid=" not in log
    assert "root:" not in log
    error_lines = [event for event in host.session.events if event["kind"] == "error"]
    assert error_lines, f"{script!r} was not refused: {log}"


@needs_tcl
def test_source_reads_only_the_sessions_own_files(host: Host) -> None:
    log = console(host, "source /etc/passwd")
    assert "root:" not in log
    assert "it is not among the session files" in log


@needs_tcl
def test_an_endless_script_is_stopped_and_the_console_still_works(host: Host) -> None:
    started = time.monotonic()
    log = console(host, "while 1 {}")
    assert "time limit" in log
    assert time.monotonic() - started < 30
    assert "42" in console(host, "puts [expr {6 * 7}]")


# ── A real session container ───────────────────────────────────


def test_a_session_container_gets_every_isolation_flag_and_no_secret() -> None:
    command = session_container_command("siliconbox-session-x", "img", runtime=None)
    joined = " ".join(command)
    for flag in (
        "--network none",
        "--read-only",
        "--cap-drop ALL",
        "--security-opt no-new-privileges",
        "--user 65534:65534",
        f"--pids-limit {RUNNER_PIDS}",
        f"--memory {PRAMAN_SESSION_MEMORY} --memory-swap {PRAMAN_SESSION_MEMORY}",
        "--rm",
    ):
        assert flag in joined
    assert command[-3:] == ["/usr/local/bin/python", "-m", "app.praman.host"]
    env = [command[i + 1] for i, part in enumerate(command) if part == "--env"]
    names = {value.split("=", 1)[0] for value in env}
    assert names == {
        "PATH",
        "FORMAL_WORK_DIR",
        "LANG",
        "PYTHONDONTWRITEBYTECODE",
        "PRAMAN_TCL_MEMORY_MB",
        "FORMAL_MAX_PARALLEL",
        "FORMAL_COMPILE_WORKERS",
    }
    assert not any("redis" in value.lower() or "key" in value.lower() for value in env)


class Container:
    """Talks to a session host in a real container over its pipes."""

    def __init__(self, process: SessionProcess) -> None:
        self.process = process
        self._replies = process.replies()

    def ask(self, op: str, **fields) -> dict:
        request_id = uuid.uuid4().hex
        self.process.send(envelope(op, request_id, **fields).model_dump_json(by_alias=True))
        for line in self._replies:
            message = json.loads(line)
            if message["id"] == request_id:
                return message["reply"]
        raise AssertionError("the session ended")

    def console(self, line: str, seconds: float = 120) -> str:
        after = self.ask("poll", after=0, version=-1, ceilings=LIMITS)["seq"]
        assert self.ask("command", line=line, ceilings=LIMITS)["queued"]
        end = time.monotonic() + seconds
        texts: list[str] = []
        while time.monotonic() < end:
            time.sleep(0.5)
            reply = self.ask("poll", after=after, version=-1, ceilings=LIMITS)
            texts += [event["text"] for event in reply["events"]]
            after = reply["seq"]
            if not reply["busy"] and not reply["proofRunning"]:
                return "\n".join(texts)
        raise AssertionError(f"still busy after {seconds} s: {texts[-5:]}")


@pytest.fixture
def container() -> Iterator[Container]:
    process = ContainerSessionRunner(IMAGE).start(f"test-{uuid.uuid4().hex[:12]}")
    session = Container(process)
    try:
        assert session.ask("open", sessionId="attack", ceilings=LIMITS)["ok"]
        yield session
    finally:
        process.stop()


@needs_image
def test_a_proof_runs_in_a_session_container(container: Container) -> None:
    container.ask("putFile", name="pair.sv", text=PAIR)
    container.ask("putFile", name="pair_sva.sv", text=PAIR_SVA)
    container.console(
        "analyze -sv pair.sv pair_sva.sv; elaborate -top pair; clock clk; reset !rst_n"
    )
    container.console("prove -all")
    state = container.ask("poll", after=0, version=-1, ceilings=LIMITS)["state"]
    statuses = {prop["id"]: prop["status"] for prop in state["properties"]}
    assert statuses["ap_bad"] == "cex"
    assert statuses["ap_in_range"] == "proven"


@needs_image
def test_a_tcl_memory_hog_is_stopped_and_the_session_goes_on(container: Container) -> None:
    log = container.console("string repeat x 2000000000")
    assert "Tcl interpreter stopped" in log or "memory" in log.lower()
    assert "42" in container.console("puts [expr {6 * 7}]")
