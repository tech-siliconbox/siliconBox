"""Design edits a proof applies (formal_service.design_edits): signals cut
(stopat) and assumptions left out.  A name that matches nothing is an
error - never a silently different proof - and a run the tools could not
do is an error, never a verdict about the design."""

import pytest

import app.praman.services.compile_worker as compile_worker
import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from tests.praman.conftest import requires_sby
from tests.praman.session.designs import PAIR, PAIR_SVA

SVA_WITH_ASSUMPTION = PAIR_SVA.replace(
    "  cp_full: cover property", "  am_never_a: assume property (@(posedge clk) !en_a);\n  cp_full: cover property")


@pytest.fixture
def prove(tmp_path, monkeypatch):
    monkeypatch.setattr(compile_worker, "IN_PROCESS", True)
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    count = iter(range(1000))

    def run(only, cut=(), without=(), sva=PAIR_SVA, reuse=True, cache=None):
        monkeypatch.setattr(formal_service, "REUSE_MODEL", reuse)
        service = formal_service.FormalService()
        service.only, service.scans = set(only), [10]
        service.cut, service.without, service.cache = list(cut), list(without), cache
        job = service.run_formal(sva_code=sva, dut_code=PAIR, dut_filename="pair.sv", mode="prove", depth=12,
                                 project_name=f"e{next(count)}", reset_signal="rst_n", reset_polarity="low")
        return {a["name"]: a for a in job.result.assertion_results}
    return run


def test_the_commands():
    edits = formal_service.design_edits("top", ["u.q"], ["am_x"])
    assert edits == ["flatten", "select -assert-count 1 top/w:u.q", "cutpoint top/w:u.q",
                     "select -assert-min 1 top/n:am_x top/n:*.am_x",
                     "chformal -assume -remove top/n:am_x top/n:*.am_x", "opt_clean"]
    assert formal_service.design_edits("top", [], []) == []


@requires_sby
@pytest.mark.parametrize("reuse", [True, False], ids=["shared model", "sources"])
def test_a_cut_signal_takes_any_value(prove, reuse):
    plain = prove({"ap_full_stays", "ap_in_range"}, reuse=reuse)
    cut = prove({"ap_full_stays", "ap_in_range"}, cut=["u_a.full"], reuse=reuse)
    assert plain["ap_full_stays"]["verdict"] == "PROVEN" and cut["ap_full_stays"]["verdict"] == "FAIL"
    assert cut["ap_in_range"]["verdict"] == "PROVEN"


@requires_sby
def test_a_run_the_tools_could_not_do_is_an_error_not_a_verdict(prove):
    got = prove({"ap_full_stays"}, cut=["no_such_signal"])["ap_full_stays"]
    assert got["verdict"] == "ERROR", "was VACUOUS: a failed precondition run read as 'never reached'"
    assert "pair/w:no_such_signal" in got["verdict_detail"]


@requires_sby
@pytest.mark.parametrize("reuse", [True, False], ids=["shared model", "sources"])
def test_an_assumption_left_out(prove, reuse):
    assumed = prove({"ap_bad"}, sva=SVA_WITH_ASSUMPTION, reuse=reuse)["ap_bad"]
    left_out = prove({"ap_bad"}, sva=SVA_WITH_ASSUMPTION, without=["am_never_a"], reuse=reuse)["ap_bad"]
    assert assumed["verdict"] == "VACUOUS" and left_out["verdict"] == "FAIL"
    misspelled = prove({"ap_bad"}, sva=SVA_WITH_ASSUMPTION, without=["am_nevr_a"], reuse=reuse)["ap_bad"]
    assert misspelled["verdict"] == "ERROR", "an assumption that stays would make the proof differ silently"


@requires_sby
def test_a_result_proven_without_the_cut_is_not_reused_with_it(prove):
    class Cache(dict):
        def get(self, key):
            return dict.get(self, key)

        def put(self, key, entry, trace):
            self[key] = (entry, trace)
    cache = Cache()
    assert prove({"ap_full_stays"}, cache=cache)["ap_full_stays"]["verdict"] == "PROVEN"
    assert prove({"ap_full_stays"}, cut=["u_a.full"], cache=cache)["ap_full_stays"]["verdict"] == "FAIL"
