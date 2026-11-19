"""
Regression corpus: every DUT/SVA pair that has broken the formal pipeline,
with its expected per-property verdicts (PROVEN, FAIL, VACUOUS, COVERED, ...).

Each case in tests/formal_corpus/<case>/case.json also lists mutations:
copies of the DUT with a planted bug that must turn a specific assertion into
FAIL.  These catch vacuous passes, which a plain "does it run" test cannot.

Requires yosys + sby (OSS CAD Suite).  Run from backend/:  pytest tests
"""

import json
from pathlib import Path

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from tests.praman.conftest import requires_sby, requires_yosys

CORPUS_DIR = Path(__file__).parent / "formal_corpus"
CASES = sorted(p.parent.name for p in CORPUS_DIR.glob("*/case.json"))


def _load_case(name: str) -> dict:
    case_dir = CORPUS_DIR / name
    case = json.loads((case_dir / "case.json").read_text())
    case["dut_code"] = (case_dir / case["dut"]).read_text()
    case["sva_code"] = (case_dir / case["sva"]).read_text()
    return case


def _run_job(sva_code: str, dut_code: str, dut_filename: str, mode: str, depth: int,
             work_dir: Path, monkeypatch, engine: str = "sby"):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", work_dir)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", work_dir)

    job = formal_service.FormalService().run_formal(
        sva_code=sva_code,
        dut_code=dut_code,
        dut_filename=dut_filename,
        mode=mode,
        depth=depth,
        timeout=300,
        project_name="corpus",
        engine=engine,
    )
    assert job.status == "complete", f"pipeline failed: {job.error_message}"
    assert job.result is not None
    return job.result


def _run(case: dict, dut_code: str, work_dir: Path, monkeypatch) -> dict[str, str]:
    """Run the full pipeline and return {property label: verdict}."""
    result = _run_job(case["sva_code"], dut_code, case["dut"], case.get("mode", "prove"),
                      case["depth"], work_dir, monkeypatch)
    assert result.sanity.get("status") == "OK", result.sanity
    return {a["name"]: a["verdict"] for a in result.assertion_results}


def _mutations():
    for name in CASES:
        for mutation in _load_case(name).get("mutations", []):
            yield pytest.param(name, mutation, id=f"{name}: {mutation['name']}")


@requires_sby
@pytest.mark.parametrize("case_name", CASES)
def test_expected_verdicts(case_name, tmp_path, monkeypatch):
    case = _load_case(case_name)
    results = _run(case, case["dut_code"], tmp_path, monkeypatch)
    # Exact match: a dropped or newly appearing assertion is a regression too
    assert results == case["expected"]


@requires_sby
@pytest.mark.parametrize("case_name, mutation", list(_mutations()))
def test_mutation_is_caught(case_name, mutation, tmp_path, monkeypatch):
    case = _load_case(case_name)
    old, new = mutation["replace"]
    assert case["dut_code"].count(old) == 1, f"mutation anchor not unique in {case['dut']}: {old!r}"
    results = _run(case, case["dut_code"].replace(old, new), tmp_path, monkeypatch)
    for label, status in mutation["expected"].items():
        assert results.get(label) == status, f"{label}: expected {status}, got {results.get(label)}"


CONTRADICTORY_SVA = """
module fifo_sva ();
  property p_flags;
    @(posedge fifo.clk) disable iff (!fifo.rstn) !(fifo.full && fifo.empty);
  endproperty
  property p_always_write;
    @(posedge fifo.clk) disable iff (!fifo.rstn) fifo.wr_en;
  endproperty
  property p_never_write;
    @(posedge fifo.clk) disable iff (!fifo.rstn) !fifo.wr_en;
  endproperty
  ap_flags : assert property(p_flags);
  cp_always_write : assume property(p_always_write);
  cp_never_write  : assume property(p_never_write);
endmodule
bind fifo fifo_sva inst_fifo_sva(.*);
"""


@requires_sby
@pytest.mark.parametrize("engine", ["sby", "native"])
def test_contradictory_assumptions_make_passes_vacuous(engine, tmp_path, monkeypatch):
    case = _load_case("sync_fifo")
    result = _run_job(CONTRADICTORY_SVA, case["dut_code"], case["dut"], "prove", 10, tmp_path,
                      monkeypatch, engine=engine)
    assert result.sanity["status"] == "OVERCONSTRAINED"
    verdicts = {a["name"]: a["verdict"] for a in result.assertion_results}
    assert verdicts == {"ap_flags": "VACUOUS"}


UNKNOWN_SIGNAL_SVA = """
module fifo_sva ();
  property p_ptr;
    @(posedge fifo.clk) disable iff (!fifo.rstn) fifo.wptr != 3'h7;
  endproperty
  property p_flags;
    @(posedge fifo.clk) disable iff (!fifo.rstn) !(fifo.full && fifo.empty);
  endproperty
  ap_ptr   : assert property(p_ptr);
  ap_flags : assert property(p_flags);
endmodule
bind fifo fifo_sva inst_fifo_sva(.*);
"""


@requires_sby
def test_slang_checks_internal_signals(tmp_path, monkeypatch):
    # bind semantics: the monitor sits inside the module, so internal
    # registers such as wptr can be checked (wptr is 3 bits and wraps)
    case = _load_case("sync_fifo")
    result = _run_job(UNKNOWN_SIGNAL_SVA, case["dut_code"], case["dut"], "prove", 20,
                      tmp_path, monkeypatch)
    verdicts = {a["name"]: a["verdict"] for a in result.assertion_results}
    assert verdicts == {"ap_ptr": "FAIL", "ap_flags": "PROVEN"}


@requires_yosys
def test_slang_reports_a_nonexistent_signal_with_its_line(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    case = _load_case("sync_fifo")
    sva = UNKNOWN_SIGNAL_SVA.replace("fifo.wptr", "fifo.no_such_ptr")
    job = formal_service.FormalService().run_formal(
        sva_code=sva, dut_code=case["dut_code"], dut_filename=case["dut"],
        mode="prove", depth=10, timeout=60, project_name="no_such",
    )
    assert job.status == "failed"
    assert "no_such_ptr" in job.error_message and "sva.sv:4" in job.error_message
