"""`sig[->N] ##K expr` after an implication, and SVA the engine cannot check.

The engine used to skip `tick[->3] ##1 done` silently, so a run passed without checking it.
It now lowers that form, counting from the right cycle for |=> and |->, and refuses a run
when any statement is left unchecked.
"""

from pathlib import Path

import pytest

from app.engine.sva_lowering import SVALoweringEngine
from app.engine.sva_parser import parse_sva
from app.job_runner import run_job
from app.models import JobSpec
from app.pipeline import run_pipeline
from app.tools import SbyTool
from tests.conftest import fixture_text, needs_sby

PROPERTIES = fixture_text("tick_pulse_props.sv")
SETTINGS = {"mode": "bmc", "solver": "boolector", "depth": 16, "timeoutSeconds": 60}


def tick_spec(design: str, properties: str = PROPERTIES) -> JobSpec:
    return JobSpec.model_validate(
        {
            "design": fixture_text(design),
            "properties": properties,
            "settings": {**SETTINGS, "topModule": "tick_pulse"},
        }
    )


def test_goto_then_delay_is_lowered_not_skipped() -> None:
    engine = SVALoweringEngine()
    lowered = engine.lower(parse_sva(PROPERTIES))
    assert engine.skipped == []
    assert "ap_done_after_third_tick: assert(0);" in lowered


@needs_sby
@pytest.mark.parametrize(
    ("design", "properties", "status"),
    [
        ("tick_pulse.sv", PROPERTIES, "PASS"),
        ("tick_pulse_bug.sv", PROPERTIES, "FAIL"),
        # With |-> a tick in the start cycle counts, so this design is one tick late.
        ("tick_pulse.sv", PROPERTIES.replace("|=> tick", "|-> tick"), "FAIL"),
    ],
)
def test_goto_then_delay_on_the_solver(
    tmp_path: Path, design: str, properties: str, status: str
) -> None:
    sby = SbyTool.locate()
    assert sby is not None
    assert run_pipeline(tick_spec(design, properties), tmp_path, sby).status == status


def test_a_property_the_engine_cannot_check_stops_the_run() -> None:
    unsupported = PROPERTIES.replace("tick[->3] ##1 done", "tick[->2] ##1 done[->2]")
    spec = tick_spec("tick_pulse.sv", unsupported)
    result = run_job(spec.model_dump_json(by_alias=True).encode())
    assert result.status == "ERROR"
    assert result.checks == []
    assert "ap_done_after_third_tick" in result.message
    assert "cannot check yet" in result.message
