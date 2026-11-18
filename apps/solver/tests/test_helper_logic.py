"""Helper logic in a properties module (wires, registers, always blocks) reaches the solver.

The engine used to keep only the SVA, so a property reading a helper register read a free,
undeclared signal and failed on correct designs.
"""

from pathlib import Path

from app.engine.sva_lowering import SVALoweringEngine
from app.engine.sva_parser import parse_sva
from app.pipeline import run_pipeline
from app.tools import SbyTool
from tests.conftest import counter_spec, fixture_text, needs_sby


def test_helper_logic_is_kept_and_sva_is_not_repeated() -> None:
    parsed = parse_sva(fixture_text("counter_model_props.sv"))
    assert "reg [3:0] f_expected;" in parsed.helper_code
    assert "always @(posedge clk)" in parsed.helper_code
    assert "property" not in parsed.helper_code
    assert "assert" not in parsed.helper_code
    lowered = SVALoweringEngine().lower(parsed)
    assert lowered.index("reg [3:0] f_expected;") < lowered.index("ap_matches_model")


def test_properties_without_helpers_have_none() -> None:
    assert parse_sva(fixture_text("counter_props.sv")).helper_code == ""


@needs_sby
def test_a_helper_model_proves_the_design_and_catches_the_bug(tmp_path: Path) -> None:
    sby = SbyTool.locate()
    assert sby is not None
    properties = fixture_text("counter_model_props.sv")
    good = counter_spec().model_copy(update={"properties": properties})
    bad = counter_spec("counter_bug.sv").model_copy(update={"properties": properties})
    for folder in ("good", "bad"):
        (tmp_path / folder).mkdir()
    assert run_pipeline(good, tmp_path / "good", sby).status == "PASS"
    assert run_pipeline(bad, tmp_path / "bad", sby).status == "FAIL"
