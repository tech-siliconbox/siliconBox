"""
The native engine (app/praman/engine) on its own: how the cross-check
classifies two verdicts, evidence levels, simple paths, candidate
invariants and which verdicts are conclusive.  formal-verify also tests it
on its agent's evaluation cases; those cases stay in formal-verify.
"""

import shutil

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.engine.api import CONCLUSIVE, EngineJob, Verdict
from app.praman.engine.crosscheck import classify, compare
from app.praman.engine.export import label_of
from app.praman.engine.native import NativeEngine
from tests.praman.conftest import requires_yosys

requires_solver = pytest.mark.skipif(shutil.which("yices-smt2") is None and shutil.which("z3") is None,
                                     reason="no SMT solver")


@pytest.fixture(autouse=True)
def work_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    return tmp_path



def test_a_cover_found_beyond_the_depth_is_weaker_not_a_conflict():
    from app.praman.engine.api import EngineResult, Verdict
    found = Verdict("co", "COVER", "COVERED", detail="Reachable, but only after more than 20 cycles.")
    within = Verdict("co", "COVER", "COVERED", detail="Reached.", step=3)
    bounded = Verdict("co", "COVER", "NOT_REACHED", bound=20)
    def row(a):
        return compare("t", EngineResult("sby", True, verdicts={"co": a}),
                       EngineResult("native", True, verdicts={"co": bounded})).rows[0]["class"]
    assert row(found) == "weaker" and row(within) == "conflict"


def test_labels_and_classification():
    assert label_of("__va_mon.ap_req001_reset") == label_of("ap_req001_reset") == "ap_req001_reset"
    assert classify("PROVEN", "PROVEN") == "agree"
    assert classify("FAIL", "FAIL", 3, 4) == "step"
    assert classify("PROVEN", "FAIL") == "conflict" and classify("COVERED", "UNREACHABLE") == "conflict"
    assert classify("PROVEN", "HOLDS_BOUNDED") == "weaker" and classify("UNREACHABLE", "NOT_REACHED") == "weaker"



def test_evidence_levels():
    from app.praman.engine.portfolio import level
    assert level(set()) == "L0" and level({"native"}) == "L1"
    assert level({"native", "sby"}) == "L2" and level({"rIC3", "sby"}) == "L2"
    assert level({"sby", "abc_pdr"}) == "L1"                  # the same PDR counts once



LOOP_RTL = """module looper (input logic clk, input logic rst_n, input logic go, output logic [3:0] x);
  always_ff @(posedge clk)
    if (!rst_n)       x <= 4'd0;
    else if (x == 10) x <= 4'd11;
    else if (x == 11) x <= go ? 4'd12 : 4'd10;     // an unreachable loop that can leave to 12
    else if (x < 5)   x <= x + 4'd1;
    else              x <= 4'd0;
endmodule
"""
LOOP_SVA = """module looper_props (input logic clk, input logic rst_n, input logic go, input logic [3:0] x);
  default clocking @(posedge clk); endclocking
  default disable iff (!rst_n);
  a_never_12: assert property (x != 4'd12);
endmodule
bind looper looper_props u_props (.*);
"""


@requires_yosys
@requires_solver
def test_simple_paths_prove_what_plain_k_induction_cannot(monkeypatch):
    # 10 -> 11 -> 10 ... -> 12 satisfies "x != 12" in every state before the last, for any k:
    # plain k-induction never converges; with the k + 1 states pairwise different it does (E4)
    job = EngineJob(rtl=LOOP_RTL, sva=LOOP_SVA, rtl_name="looper.sv", top="looper", clock="clk", reset="rst_n",
                    reset_polarity="low", mode="prove", depth=8, name="t_loop")
    result = NativeEngine().run(job)
    assert result.ok, result.error
    assert result.verdicts["a_never_12"].verdict == "PROVEN"
    monkeypatch.setenv("FORMAL_SIMPLE_PATH", "0")                 # the worker runs plain k-induction only
    monkeypatch.setenv("FORMAL_LEMMAS", "0")
    assert NativeEngine().run(job).verdicts["a_never_12"].verdict == "HOLDS_BOUNDED"



def test_candidate_invariants_are_claimed_after_reset_only():
    from app.praman.engine.lemmas import STATE, Candidate

    class Smt:
        def net_width(self, top, path):
            return {"count": 3, "wptr": 2, "rptr": 2, "__va_harness.reset_cycles": 2}[path[0]]

        def net_expr(self, top, state, path):
            return f"(|{path[0]}| {state})"

    class FakeSession:
        smt, top = Smt(), "t"

        def registers(self):
            return [["count"], ["wptr"], ["rptr"], ["__va_harness.reset_cycles"], ["$auto$x"]]

    from app.praman.engine.lemmas import candidates
    cands = {c.text: c for c in candidates(FakeSession())}
    fifo = cands["after reset: count[1:0] == wptr - rptr"]
    assert fifo.at(3) == ("(or (not (= (|__va_harness.reset_cycles| s3) #b10)) "
                          "(= ((_ extract 1 0) (|count| s3)) (bvsub (|wptr| s3) (|rptr| s3))))")
    assert "after reset: count != 5" in cands
    assert not any("reset_cycles" in t.split(":", 1)[1] or "$auto" in t for t in cands)   # not about the harness
    assert isinstance(fifo, Candidate) and STATE not in fifo.at(0)


def test_only_proven_covered_and_unreachable_are_conclusive():
    assert CONCLUSIVE == {"PROVEN", "COVERED", "UNREACHABLE"}
    assert not Verdict("a", "ASSERT", "HOLDS_BOUNDED").conclusive
    assert Verdict("c", "COVER", "UNREACHABLE").conclusive
