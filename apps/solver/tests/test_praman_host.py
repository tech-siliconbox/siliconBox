"""A Praman session host (ADR 0031): requests, ceilings, file access and what reaches the web app.

Hardening findings 17, 20 and 21, and finding 1 for session ids.
"""

import json
import subprocess
import sys
import time
from collections.abc import Iterator
from pathlib import Path

import pytest

from app.praman import ceilings
from app.praman.host import Host, parse
from app.praman.protocol import Envelope
from app.praman.services.proc import run_tree
from app.praman.store import use_outbox
from app.praman.tclhost import tclsh_path

ROOT = Path(__file__).resolve().parent.parent
LIMITS = {"proofSeconds": 300, "traceLength": 50, "secondsLeft": 3600}
needs_tcl = pytest.mark.skipif(tclsh_path() is None, reason="tclsh is not installed")


def request(op: str, **fields) -> Envelope:
    return Envelope.model_validate({"id": "r", "request": {"op": op, **fields}})


def answer(host: Host, op: str, **fields) -> dict:
    return host.answer(request(op, **fields).request)


@pytest.fixture(autouse=True)
def fresh_process_state() -> Iterator[None]:
    yield
    ceilings.set_ceilings(None)
    ceilings.take_used()
    use_outbox(None)


@pytest.fixture
def host() -> Iterator[Host]:
    opened = Host()
    reply = answer(opened, "open", sessionId="s1", name="Session 1", ceilings=LIMITS)
    assert reply["ok"], reply
    yield opened
    if not opened.closed:
        answer(opened, "close")


def run(host: Host, line: str) -> list[dict]:
    """Run a console line; the log lines it wrote."""
    before = host.session.seq
    assert answer(host, "command", line=line, ceilings=LIMITS)["queued"]
    assert host.session.wait_idle(60)
    return host.session.events_after(before)


def texts(events: list[dict]) -> str:
    return "\n".join(event["text"] for event in events)


@pytest.mark.parametrize("session_id", ["../x", "a/b", "..", "x" * 65, ""])
def test_a_session_id_that_could_name_a_path_is_refused(session_id: str) -> None:
    line = json.dumps(
        {"id": "r", "request": {"op": "open", "sessionId": session_id, "ceilings": LIMITS}}
    )
    reply = parse(line)
    assert isinstance(reply, dict)
    assert reply["status"] == 400


def test_requests_over_the_size_limit_are_refused() -> None:
    reply = parse("x" * (4 * 1024 * 1024))
    assert isinstance(reply, dict)
    assert reply["status"] == 413


def test_nothing_but_opening_is_answered_before_the_session_is_open() -> None:
    assert answer(Host(), "command", line="help", ceilings=LIMITS)["status"] == 409


@needs_tcl
def test_a_new_session_starts_at_the_ceilings(host: Host) -> None:
    assert host.session.settings["time_limit"] == LIMITS["proofSeconds"]
    assert host.session.settings["max_trace_length"] == 20


@needs_tcl
def test_settings_above_the_ceilings_are_lowered_and_the_log_says_so(host: Host) -> None:
    log = run(host, "set_prove_time_limit 4h; set_max_trace_length 500")
    assert host.session.settings["time_limit"] == 300
    assert host.session.settings["max_trace_length"] == 50
    assert texts(log).count("is above the ceiling of your level") == 2


@needs_tcl
def test_settings_within_the_ceilings_are_kept(host: Host) -> None:
    run(host, "set_prove_time_limit 2m; set_max_trace_length 30")
    assert host.session.settings["time_limit"] == 120
    assert host.session.settings["max_trace_length"] == 30


@needs_tcl
@pytest.mark.parametrize(
    "design",
    [
        'module m(input clk); reg [7:0] m [0:3]; initial $readmemh("/etc/passwd", m); endmodule',
        'module m(input clk); integer f; initial f = $fopen("/etc/passwd", "r"); endmodule',
        'module m(input clk); initial $system("id"); endmodule',
    ],
)
def test_learner_code_never_reads_or_writes_files(host: Host, design: str) -> None:
    assert answer(host, "putFile", name="m.sv", text=design)["ok"]
    log = run(host, "analyze -sv m.sv")
    assert "Praman does not read or write files" in texts(log)
    assert host.session.phase == "empty"


@needs_tcl
def test_a_property_written_in_tcl_cannot_read_files(host: Host) -> None:
    answer(host, "putFile", name="m.sv", text="module m(input clk, input a); endmodule")
    run(host, "analyze -sv m.sv; elaborate -top m; clock clk")
    log = run(host, 'assert -name p {$fopen("/etc/passwd") == 0}')
    assert "Praman does not read or write files" in texts(log)
    assert not any(prop.id.endswith("p") for prop in host.session.props.values())


def test_files_over_one_megabyte_are_refused(host: Host) -> None:
    answer(host, "putFile", name="a.sv", text="a" * 700_000)
    reply = answer(host, "putFile", name="b.sv", text="b" * 400_000)
    assert reply["status"] == 413
    assert "b.sv" not in host.session.files


@pytest.mark.parametrize(("given", "kept"), [("../../etc/x.sv", "etc/x.sv"), ("a\\b.sv", "a/b.sv")])
def test_file_names_never_climb_out(host: Host, given: str, kept: str) -> None:
    assert answer(host, "putFile", name=given, text="//")["name"] == kept


@needs_tcl
def test_a_poll_hands_each_record_to_the_web_app_once(host: Host) -> None:
    answer(host, "putFile", name="a.sv", text="module a; endmodule")
    first = answer(host, "poll", after=0, version=-1, ceilings=LIMITS)
    again = answer(host, "poll", after=first["seq"], version=first["version"], ceilings=LIMITS)
    assert first["records"]["session"]["files"]["a.sv"] == "module a; endmodule"
    assert again["records"] == {"session": None, "runs": []}
    assert again["state"] is None


@needs_tcl
def test_a_closed_session_opens_again_from_its_save(host: Host) -> None:
    answer(host, "putFile", name="a.sv", text="module a; endmodule")
    record = answer(host, "close")["records"]["session"]
    kept = ("createdAt", "journal", "settings", "files", "state")
    saved = {**{key: record[key] for key in kept}, "events": record["newEvents"]}
    reopened = Host()
    reply = answer(reopened, "open", sessionId="s1", saved=saved, ceilings=LIMITS)
    assert reply["ok"]
    assert reopened.session.files["a.sv"] == "module a; endmodule"
    assert "reopened" in texts(reopened.session.events)
    answer(reopened, "close")


def test_engines_count_once_however_many_run_together() -> None:
    ceilings.set_ceilings(ceilings.Ceilings(proof_seconds=60, trace_length=20, seconds_left=600))
    with ceilings.engine_running(), ceilings.engine_running():
        time.sleep(0.3)
    used = ceilings.take_used()
    assert 0.25 < used < 0.6
    assert ceilings.take_used() < 0.01


def test_no_engine_starts_once_the_proof_minutes_are_used() -> None:
    ceilings.set_ceilings(ceilings.Ceilings(proof_seconds=60, trace_length=20, seconds_left=0))
    started = time.monotonic()
    with pytest.raises(subprocess.TimeoutExpired):
        run_tree(["sleep", "5"], timeout=30)
    assert time.monotonic() - started < 1


def test_an_engine_process_is_held_to_the_proof_ceiling() -> None:
    ceilings.set_ceilings(ceilings.Ceilings(proof_seconds=1, trace_length=20, seconds_left=600))
    started = time.monotonic()
    with pytest.raises(subprocess.TimeoutExpired):
        run_tree(["sleep", "30"], timeout=3600)
    assert time.monotonic() - started < 5


def test_a_command_is_done_when_it_exits_though_a_stray_child_holds_its_output() -> None:
    # sby runs each engine in a process group of its own; a losing engine slow to stop must not
    # hold the run open until its time limit (it did on CI's x64 runners: a FAIL became TIMEOUT).
    code = (
        "import subprocess; subprocess.Popen(['sleep', '10'], start_new_session=True); "
        "print('decided')"
    )
    started = time.monotonic()
    done = run_tree([sys.executable, "-c", code], timeout=20)
    assert done.stdout.strip() == "decided"
    assert time.monotonic() - started < 5


def test_depth_and_time_are_lowered_to_the_ceilings() -> None:
    ceilings.set_ceilings(ceilings.Ceilings(proof_seconds=300, trace_length=50, seconds_left=600))
    assert ceilings.depth(500) == 50
    assert ceilings.depth(20) == 20
    assert ceilings.seconds(86_400) == 300


@needs_tcl
def test_stdout_carries_only_replies() -> None:
    lines = [
        {"id": "1", "request": {"op": "open", "sessionId": "s1", "ceilings": LIMITS}},
        {"id": "2", "request": {"op": "command", "line": "puts hello", "ceilings": LIMITS}},
        {"id": "3", "request": {"op": "close"}},
    ]
    stdin = "\n".join(json.dumps(line) for line in lines) + "\n"
    done = subprocess.run(  # noqa: S603  A fixed argument list.
        [sys.executable, "-m", "app.praman.host"],
        input=stdin,
        capture_output=True,
        text=True,
        cwd=ROOT,
        timeout=60,
        check=False,
    )
    replies = [json.loads(line) for line in done.stdout.splitlines()]
    assert sorted(reply["id"] for reply in replies) == ["1", "2", "3"]
    assert all(reply["reply"]["ok"] for reply in replies)
