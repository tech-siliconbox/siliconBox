"""Witness covers (compiler WITNESS_SUFFIX, on request): for an assertion
`a |-> b`, a cover of "a matched and b held" - the assertion can pass
non-vacuously.  Off by default, so monitors and verdicts are unchanged."""

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.sva.compiler import WITNESS_SUFFIX
from app.praman.services.sva.pipeline import prepare
from tests.praman.conftest import requires_sby
from tests.praman.session.designs import PAIR, PAIR_SVA


def test_no_witness_cover_unless_asked():
    prepared = prepare({"pair.sv": PAIR}, {"sva.sv": PAIR_SVA}, "pair")
    assert WITNESS_SUFFIX not in prepared.monitor_text
    assert not any(p.has_witness for p in prepared.properties)


def test_assertions_with_an_antecedent_get_a_witness_cover():
    prepared = prepare({"pair.sv": PAIR}, {"sva.sv": PAIR_SVA}, "pair", witness_covers=True)
    has = {p.label: p.has_witness for p in prepared.properties}
    assert has == {"ap_full_stays": True, "ap_in_range": False, "cp_full": False, "ap_bad": True,
                   "ap_vacuous": True}
    assert f"ap_full_stays{WITNESS_SUFFIX}: cover(1);" in prepared.monitor_text
    assert f"ap_in_range{WITNESS_SUFFIX}" not in prepared.monitor_text      # no antecedent: nothing to witness


@requires_sby
def test_the_witness_is_reported_with_its_assertion(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=PAIR_SVA, dut_code=PAIR, dut_filename="pair.sv", dut_top="pair", mode="prove", depth=20,
        project_name="witness", witness_covers=True)
    assert job.status == "complete", job.error_message
    entries = {e["name"]: e for e in job.result.assertion_results}
    # the witness covers are part of their assertions, not properties of their own
    assert set(entries) == {"ap_full_stays", "ap_in_range", "cp_full", "ap_bad", "ap_vacuous"}
    assert entries["ap_full_stays"]["verdict"] == "PROVEN"
    assert entries["ap_full_stays"]["witness"]["status"] == "REACHED"
    # the witness needs one cycle more than the precondition (|=>)
    assert entries["ap_full_stays"]["witness"]["step"] > entries["ap_full_stays"]["precondition"]["step"]
    assert entries["ap_vacuous"]["verdict"] == "VACUOUS"
    assert entries["ap_vacuous"]["witness"]["status"] == "UNREACHABLE"
    assert "witness" not in entries["ap_in_range"] and "witness" not in entries["cp_full"]


@requires_sby
def test_results_are_the_same_without_witness_covers(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=PAIR_SVA, dut_code=PAIR, dut_filename="pair.sv", dut_top="pair", mode="prove", depth=20,
        project_name="no_witness")
    verdicts = {e["name"]: e["verdict"] for e in job.result.assertion_results}
    assert verdicts == {"ap_full_stays": "PROVEN", "ap_in_range": "PROVEN", "cp_full": "COVERED",
                        "ap_bad": "FAIL", "ap_vacuous": "VACUOUS"}
    assert all("witness" not in e for e in job.result.assertion_results)
