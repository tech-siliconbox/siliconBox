"""Real runs through the sandbox entry point (needs SymbiYosys), and findings 1, 9 and 10."""

import time
from pathlib import Path

import pytest

from app.job_runner import run_job
from app.models import JobSpec
from app.pipeline import run_pipeline
from app.runners import LocalRunner
from app.tools import SBY_GRACE_SECONDS, SbyTool
from tests.conftest import counter_spec, fixture_text, needs_sby


@needs_sby
def test_the_reference_design_passes() -> None:
    result = LocalRunner().run(counter_spec())
    assert result.status == "PASS", result.message
    assert [(c.name, c.status) for c in result.checks] == [
        ("ap_stays_in_range", "PASS"),
        ("ap_holds_when_idle", "PASS"),
        ("cp_reaches_nine", "PASS"),
    ]
    cover = result.checks[2]
    assert cover.trace is not None  # a reached cover carries its witness trace


@needs_sby
def test_a_seeded_bug_fails_with_a_counterexample() -> None:
    result = LocalRunner().run(counter_spec("counter_bug.sv"))
    assert result.status == "FAIL"
    assert result.failed_check == "ap_stays_in_range"
    assert result.failure_cycle is not None
    failing = result.checks[0]
    assert failing.trace is not None
    names = {signal.name for signal in failing.trace.signals}
    assert "count" in names


@needs_sby
def test_results_carry_no_server_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Finding 9.
    monkeypatch.setenv("SOLVER_WORK_ROOT", str(tmp_path))
    result = run_job(counter_spec("counter_bug.sv").model_dump_json(by_alias=True).encode())
    text = result.model_dump_json()
    assert str(tmp_path) not in text
    assert str(tmp_path.resolve()) not in text


@needs_sby
def test_the_job_folder_is_made_and_removed_inside_the_work_root(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Finding 1: a sibling folder survives; nothing is left behind.
    monkeypatch.setenv("SOLVER_WORK_ROOT", str(tmp_path))
    sibling = tmp_path / "someone-else"
    sibling.mkdir()
    (sibling / "keep.txt").write_text("keep")
    run_job(counter_spec().model_dump_json(by_alias=True).encode())
    assert [p.name for p in tmp_path.iterdir()] == ["someone-else"]
    assert (sibling / "keep.txt").read_text() == "keep"


def test_an_endless_solver_is_stopped_at_the_time_limit(tmp_path: Path) -> None:
    # Finding 3: a solver that never finishes is killed when the job's budget runs out, and
    # the remaining checks are not started.
    endless = tmp_path / "endless-sby"
    endless.write_text("#!/bin/sh\nsleep 600\n")
    endless.chmod(0o755)
    work = tmp_path / "work"
    work.mkdir()
    started = time.monotonic()
    result = run_pipeline(counter_spec(timeoutSeconds=1), work, SbyTool(str(endless), "/bin"))
    assert time.monotonic() - started < 1 + SBY_GRACE_SECONDS + 3
    assert result.status == "TIMEOUT"
    assert {check.status for check in result.checks} == {"TIMEOUT"}


@pytest.mark.parametrize(
    "snippet",
    [
        '`include "/etc/passwd"',
        '` include "secrets.sv"',
        'initial $readmemh("/etc/hosts", mem);',
        'integer f = $fopen("/etc/passwd", "r");',
        'initial $system("id");',
    ],
)
def test_refuses_file_access_in_code(snippet: str) -> None:
    # Finding 10: learner code cannot read files on the runner.
    for field in ("design", "properties"):
        body = {
            "design": fixture_text("counter.sv"),
            "properties": fixture_text("counter_props.sv"),
            "settings": {"mode": "bmc", "solver": "boolector", "depth": 5, "timeoutSeconds": 10},
        }
        body[field] = snippet + "\n" + body[field]
        result = run_job(JobSpec.model_validate(body).model_dump_json(by_alias=True).encode())
        assert result.status == "ERROR"
        assert "File access" in result.message


def test_unreadable_properties_are_a_plain_error() -> None:
    body = {
        "properties": "this is not SystemVerilog",
        "settings": {"mode": "bmc", "solver": "boolector", "depth": 5, "timeoutSeconds": 10},
    }
    result = run_job(JobSpec.model_validate(body).model_dump_json(by_alias=True).encode())
    assert result.status == "ERROR"
    assert result.checks == []


def test_a_malformed_job_is_refused() -> None:
    result = run_job(b'{"properties": "x", "settings": {"mode": "bmc"}, "projectName": "../"}')
    assert result.status == "ERROR"
    assert result.message == "The job was not valid."
