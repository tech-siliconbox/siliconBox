"""The shared model (formal_service.SharedModel): the design with every
monitor statement is read once per job; a plain run starts from it and
removes the checks it does not make.  Results must be exactly those of
reading the sources in every run."""

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from tests.praman.conftest import requires_sby
from tests.praman.session.designs import PAIR, PAIR_SVA
from tests.test_sva_liveness import DUT as LIVE_DUT, _sva


def run(tmp_path, monkeypatch, reuse: bool, name: str, sva=PAIR_SVA, dut=PAIR, top="pair", depth=20):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path / name)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path / name)
    monkeypatch.setattr(formal_service, "REUSE_MODEL", reuse)
    monkeypatch.setattr(formal_service, "KEEP_ARTIFACTS", True)
    job = formal_service.FormalService().run_formal(sva_code=sva, dut_code=dut, dut_filename="d.sv", dut_top=top,
                                                    mode="prove", depth=depth, project_name=name,
                                                    witness_covers=True)
    assert job.status == "complete", job.error_message
    sbys = list((tmp_path / name / name / "assertions").glob("*/*.sby"))
    shared = sum("read_rtlil" in p.read_text() for p in sbys)
    return job.result.assertion_results, shared, len(sbys)


def summary(entries):
    return {e["name"]: (e["verdict"], e.get("step"), (e.get("precondition") or {}).get("status"),
                        (e.get("witness") or {}).get("status")) for e in entries}


@requires_sby
def test_the_same_results_with_and_without_the_shared_model(tmp_path, monkeypatch):
    with_shared, used, total = run(tmp_path, monkeypatch, True, "shared")
    without, used_off, _ = run(tmp_path, monkeypatch, False, "sources")
    assert summary(with_shared) == summary(without)
    assert used >= 2 and used_off == 0, (used, total)
    # a counterexample from the shared model is a real trace of the property
    bad = next(e for e in with_shared if e["name"] == "ap_bad")
    assert bad["verdict"] == "FAIL" and bad["counterexample_vcd"]


@requires_sby
def test_assumptions_stay_in_every_run(tmp_path, monkeypatch):
    sva = PAIR_SVA.replace("endmodule", "  am_never_en: assume property (@(posedge clk) !en_a);\nendmodule")
    entries, used, _ = run(tmp_path, monkeypatch, True, "assumed", sva=sva)
    verdicts = {e["name"]: e["verdict"] for e in entries}
    # en_a never rises: ap_bad (which fails without the assumption) never even starts
    assert verdicts["ap_bad"] == "VACUOUS", verdicts
    assert used >= 1
    without, _, _ = run(tmp_path, monkeypatch, False, "assumed_sources", sva=sva)
    assert summary(entries) == summary(without)


def test_keep_only_removes_checks_but_never_assumptions():
    script = formal_service.SharedModel.keep_only({"ap_a", "cp_b"})
    assert "select -del n:ap_a n:*.ap_a n:cp_b n:*.cp_b" in script     # flattened: <instance>.<label>
    assert "chformal -assert -cover -live -fair -remove %" in script   # -assume is never given
    assert formal_service.SharedModel.keep_only(set())[2].startswith("chformal")


def test_a_check_missing_from_the_model_reads_the_sources():
    """A run never starts from the model when a check it keeps is not found
    there by name (it would be removed, and the property proven vacuously)."""
    shared = formal_service.SharedModel.__new__(formal_service.SharedModel)
    shared._names = None
    shared._text = ("  cell $check \\__va_mon.a_bad\n  end\n  cell $check \\ap_top\n  end\n"
                    "  cell $check $flatten\\__va_harness.$assume$va_harness.sv:12$8\n")
    assert shared.has_checks({"a_bad"}) and shared.has_checks({"ap_top", "a_bad"})
    assert not shared.has_checks({"a_ba"}) and not shared.has_checks({"a_bad", "a_other"})
    assert not shared.has_checks(set())


@requires_sby
def test_liveness_runs_read_the_sources(tmp_path, monkeypatch):
    if not __import__("shutil").which("suprove"):
        pytest.skip("suprove not installed")
    entries, used, total = run(tmp_path, monkeypatch, True, "live", sva=_sva(True), dut=LIVE_DUT, top="")
    runs = [p.read_text() for p in (tmp_path / "live" / "live" / "assertions").glob("*/*.sby")]
    lives = [text for text in runs if "mode live" in text]
    assert lives and all("read_rtlil" not in text for text in lives)
