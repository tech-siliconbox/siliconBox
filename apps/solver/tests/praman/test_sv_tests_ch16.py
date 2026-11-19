"""
Robustness against the standard's own test suite: the non-UVM chapter 16
(assertions) files of chipsalliance/sv-tests (ISC licence, see
tests/sv_tests_ch16/LICENSE).  Every file must elaborate, every assertion
must either compile into a monitor or carry a precise reason, and the
design must either be readable by Yosys or be rejected with a clear message.
"""

from pathlib import Path

import pytest

from app.praman.services.sva.frontend import FrontendError
from app.praman.services.sva.pipeline import check_readable, prepare
from tests.praman.conftest import requires_sby, requires_yosys, requires_yosys_slang

SUITE = Path(__file__).parent / "sv_tests_ch16"
FILES = sorted(SUITE.glob("*.sv"))

# Files whose assertions are all expected to compile
COMPILES = {
    "16.10--property-local-var.sv", "16.10--property-local-var-fail.sv",
    "16.10--sequence-local-var.sv", "16.10--sequence-local-var-fail.sv",
    "16.12--property-disable-iff.sv", "16.12--property-disj.sv", "16.12--property-iff.sv",
    "16.12--property-prec.sv", "16.12--property.sv", "16.14--assume-property.sv",
    "16.15--property-disable-iff.sv", "16.15--property-disable-iff-fail.sv",
    "16.7--sequence.sv", "16.9--sequence-cons-repetition.sv",
    "16.9--sequence-goto-repetition.sv", "16.9--sequence-noncons-repetition.sv",
}


@pytest.mark.parametrize("path", FILES, ids=[f.name for f in FILES])
def test_every_assertion_compiles_or_has_a_reason(path):
    prepared = prepare({path.name: path.read_text()}, {})
    assert prepared.properties, "no assertion found"
    for prop in prepared.properties:
        assert prop.supported or (prop.problems and prop.problems[0].strip())
    if path.name in COMPILES:
        assert all(p.supported for p in prepared.properties), \
            {p.label: p.problems for p in prepared.properties}


@requires_yosys
@pytest.mark.parametrize("path", FILES, ids=[f.name for f in FILES])
def test_design_is_readable_or_rejected_clearly(path):
    prepared = prepare({path.name: path.read_text()}, {})
    try:
        check_readable(prepared)
    except FrontendError as e:
        assert "cannot be read for formal checking" in str(e)


@requires_yosys_slang
@requires_sby
def test_a_model_that_cannot_be_built_is_never_a_pass(tmp_path, monkeypatch):
    """Found by the engine cross-check (M3.8): here Yosys's formalff pass
    fails on the assertion's model; sby's JUnit report then marks the
    assertion "skipped", which once became HOLDS_BOUNDED."""
    import app.praman.services.formal_service as formal_service
    import app.praman.services.sby_generator as sby_generator
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    path = SUITE / "16.7--sequence.sv"
    for engine in ("sby", "native"):
        job = formal_service.FormalService().run_formal(sva_code="", dut_code=path.read_text(), dut_filename=path.name,
                                                        mode="prove", depth=20, project_name=f"nobuild_{engine}",
                                                        engine=engine)
        verdicts = {e["name"]: e["verdict"] for e in job.result.assertion_results} if job.result else {}
        assert job.status == "failed" or (verdicts and set(verdicts.values()) == {"ERROR"}), (engine, verdicts)
