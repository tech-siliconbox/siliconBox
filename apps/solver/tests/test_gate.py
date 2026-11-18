"""The publish gate on an invented Drill: the solver's own counter fixtures."""

import json
from pathlib import Path

import pytest

from app.gate import main
from tests.conftest import fixture_text, needs_sby


def drill_file(tmp_path: Path, **changes: object) -> Path:
    drill = {
        "slug": "invented-counter-bug",
        "mode": "bmc",
        "solver": "boolector",
        "target": "FAIL",
        "depth": 20,
        "timeoutSeconds": 60,
        "topModule": "counter",
        "designCode": fixture_text("counter_bug.sv"),
        "starterCode": fixture_text("counter_starter.sv"),
        "private": {
            "referenceSolution": fixture_text("counter_props.sv"),
            "referenceDesign": fixture_text("counter.sv"),
            "bugVariants": [{"name": "never wraps", "code": fixture_text("counter_bug.sv")}],
        },
        **changes,
    }
    content = {
        "courses": [{"slug": "c", "modules": [{"slug": "m", "lessons": [], "drills": [drill]}]}]
    }
    path = tmp_path / "drills.json"
    path.write_text(json.dumps(content))
    return path


@pytest.fixture(autouse=True)
def _absolute_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INIT_CWD", raising=False)


@needs_sby
def test_a_sound_drill_passes_the_gate(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main([str(drill_file(tmp_path))]) == 0
    out = capsys.readouterr().out
    assert "1 Drills, 4 checks, 0 failed." in out


@needs_sby
def test_a_drill_whose_reference_misses_the_bug_is_refused(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    weak = fixture_text("counter_starter.sv")
    path = drill_file(
        tmp_path,
        private={
            "referenceSolution": weak,
            "bugVariants": [{"name": "never wraps", "code": fixture_text("counter_bug.sv")}],
        },
    )
    assert main([str(path)]) == 1
    assert "FAIL invented-counter-bug: reference on bug 'never wraps'" in capsys.readouterr().out


@needs_sby
def test_a_drill_already_solved_by_its_starter_is_refused(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = drill_file(tmp_path, starterCode=fixture_text("counter_props.sv"))
    assert main([str(path)]) == 1
    assert "FAIL invented-counter-bug: starter does not already solve it" in capsys.readouterr().out


def test_a_file_without_drills_fails(tmp_path: Path) -> None:
    path = tmp_path / "empty.json"
    path.write_text(json.dumps({"courses": [{"modules": [{"lessons": []}]}]}))
    assert main([str(path)]) == 1
