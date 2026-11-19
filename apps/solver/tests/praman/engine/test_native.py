"""
The native engine (app/engine: export, smt, bmc, kind, witness, worker,
native) and its cross-check against the SymbiYosys flow (crosscheck.py):
the exported model names every property, verdicts match the golden
expectations, a counterexample comes with a replayed trace at the step sby
reports, every result kind is produced and none counts as a pass, and on
the evaluation cases and their mutants the two engines never contradict
each other (PRD §9.4: a disagreement is a P0 bug).
"""

import shutil
from pathlib import Path

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.engine.api import CONCLUSIVE, EngineJob
from app.praman.engine.crosscheck import classify, compare
from app.praman.engine.export import export, label_of
from app.praman.engine.native import NativeEngine
from app.praman.engine.sby_adapter import SbyEngine
from app.praman.services.formal_service import compile_design
from app.praman.services.yosys_reader import MONITOR_FILE
from eval.formal import Case, list_cases
from tests.praman.conftest import requires_sby, requires_yosys

requires_solver = pytest.mark.skipif(shutil.which("yices-smt2") is None and shutil.which("z3") is None,
                                     reason="no SMT solver")


@pytest.fixture(autouse=True)
def work_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    return tmp_path


def _job(case: Case, rtl: str = "", mode: str = "", timeout: int = 300) -> EngineJob:
    return EngineJob.from_ir(case.ir, rtl or case.rtl, case.sva, rtl_name=case.rtl_name, mode=mode or case.mode,
                             depth=case.depth, timeout=timeout, name=f"t_{case.name}")


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


@requires_yosys
def test_export_names_every_property(tmp_path):
    case = Case.load("apb_gpio")
    st = case.ir.design.style
    prepared = compile_design(case.sva, case.rtl, case.rtl_name, case.ir.design.top, reset_signal=st.reset,
                              reset_polarity="low", clock_signal=st.clock)
    files = prepared.sources(20)
    files[MONITOR_FILE] = prepared.monitor_text
    model = export(files, prepared.top, prepared.reader, prepared.script, tmp_path / "m")
    assert model.smt2.exists() and model.prep_il.exists()
    asserts = {l for l, k in model.properties.items() if k == "assert"}
    covers = {l for l, k in model.properties.items() if k == "cover"}
    assert {l for l, v in case.expected.items() if l.startswith("ap_")} <= asserts
    assert "_va_sanity" in covers and "ap_req001_reset__pre" in covers


@requires_yosys
@requires_solver
def test_golden_case_gives_the_expected_verdicts():
    case = Case.load("apb_gpio")
    result = NativeEngine().run(_job(case))
    assert result.ok and result.sanity == "OK" and result.engine == "native"
    assert {k: result.verdicts[k].verdict for k in case.expected} == case.expected
    assert "k-induction" in result.verdicts["ap_req001_reset"].engine


@requires_yosys
@requires_solver
def test_a_counterexample_has_a_replayed_trace_at_the_right_step():
    case = Case.load("apb_gpio")
    mutation = case.mutations[0]                     # DIR write decoded at the OUT address
    result = NativeEngine().run(_job(case, case.mutant(mutation)))
    failing = {k for k, v in result.verdicts.items() if v.verdict == "FAIL"}
    assert failing == set(mutation["expected"])
    v = result.verdicts["ap_req002_dir_write"]
    assert v.step == 4 and "not confirmed" not in v.detail
    vcd = Path(v.trace_path)
    assert vcd.exists() and "$scope module apb_gpio $end" in vcd.read_text()


@requires_yosys
@requires_solver
def test_bmc_mode_stops_at_bounded_results():
    case = Case.load("up_down_counter")
    result = NativeEngine().run(_job(case, mode="bmc"))
    assert result.ok
    kinds = {v.verdict for v in result.verdicts.values()}
    assert kinds <= {"HOLDS_BOUNDED", "COVERED", "VACUOUS"} and "HOLDS_BOUNDED" in kinds


@requires_yosys
@requires_solver
def test_result_kinds_are_never_a_pass(monkeypatch):
    case = Case.load("sync_fifo4")
    # elaboration error
    bad = NativeEngine().run(_job(case, case.rtl.replace("endmodule", "endmodul")))
    assert not bad.ok and bad.error.startswith("elaboration_error")
    # time limit: nothing conclusive is invented
    slow = NativeEngine().run(_job(case, timeout=0))
    assert slow.ok and all(v.verdict in ("TIMEOUT", "ERROR", "HOLDS_BOUNDED", "NOT_REACHED") or
                           v.verdict not in CONCLUSIVE for v in slow.verdicts.values())
    assert any(v.verdict == "TIMEOUT" for v in slow.verdicts.values())
    # no solver
    import app.praman.engine.smt as smt
    monkeypatch.setattr(smt, "available_solvers", lambda: [])
    missing = NativeEngine().run(_job(case))
    assert not missing.ok and missing.error.startswith("tool_missing")


@pytest.mark.slow                  # nightly (tests-nightly.yml)
@requires_sby
@requires_solver
@pytest.mark.parametrize("name", list_cases())
def test_native_and_sby_never_contradict_each_other(name):
    """The CI gate of PRD §9.4 on the evaluation cases and all their mutants."""
    case = Case.load(name)
    sby, native = SbyEngine(), NativeEngine()
    problems = []
    for vname, rtl in [("golden", case.rtl)] + [(m["name"], case.mutant(m)) for m in case.mutations]:
        cmp = compare(f"{name}/{vname}", sby.run(_job(case, rtl)), native.run(_job(case, rtl)))
        problems += cmp.errors
        problems += [r for r in cmp.rows if r["class"] in ("conflict", "step", "other")]
    assert problems == []


@requires_sby
@requires_solver
def test_run_formal_engine_option(monkeypatch):
    monkeypatch.setenv("FORMAL_SIMPLE_PATH", "0")
    monkeypatch.setenv("FORMAL_LEMMAS", "0")
    case = Case.load("seq_detector")              # sby proves ap_req002_detect, plain k-induction cannot
    service = formal_service.FormalService()
    args = dict(sva_code=case.sva, dut_code=case.rtl, dut_filename=case.rtl_name, dut_top=case.ir.design.top,
                mode="prove", depth=case.depth, reset_signal="rst", reset_polarity="high", clock_signal="clk")
    by_engine = {}
    for engine in ("sby", "native", "both"):
        job = service.run_formal(project_name=f"eng_{engine}", engine=engine, **args)
        assert job.status == "complete", job.error_message
        by_engine[engine] = {e["name"]: e for e in job.result.assertion_results}
    assert by_engine["sby"]["ap_req002_detect"]["verdict"] == "PROVEN"
    assert by_engine["native"]["ap_req002_detect"]["verdict"] == "HOLDS_BOUNDED"
    both = by_engine["both"]["ap_req002_detect"]
    assert both["verdict"] == "HOLDS_BOUNDED" and both["evidence_level"] == "L1" and both["proved_by"] == ["sby"]
    reset = by_engine["both"]["ap_req001_reset"]                                 # both prove it
    assert reset["verdict"] == "PROVEN" and reset["evidence_level"] == "L2" and reset["proved_by"] == ["native", "sby"]
    assert set(by_engine["native"]) == set(by_engine["sby"])
    assert service.run_formal(project_name="eng_bad", engine="nope", **args).status == "failed"



def test_evidence_levels():
    from app.praman.engine.portfolio import level
    assert level(set()) == "L0" and level({"native"}) == "L1"
    assert level({"native", "sby"}) == "L2" and level({"rIC3", "sby"}) == "L2"
    assert level({"sby", "abc_pdr"}) == "L1"                  # the same PDR counts once


@requires_sby
@requires_solver
def test_portfolio_lifts_a_single_engine_proof_to_l2(monkeypatch):
    monkeypatch.setenv("FORMAL_SIMPLE_PATH", "0")                 # native alone cannot prove it
    monkeypatch.setenv("FORMAL_LEMMAS", "0")
    from app.praman.engine import portfolio
    if not {"rIC3", "avy"} & set(portfolio.available()):
        pytest.skip("rIC3 / avy not installed (the server image has them)")
    case = Case.load("seq_detector")
    job = formal_service.FormalService().run_formal(
        sva_code=case.sva, dut_code=case.rtl, dut_filename=case.rtl_name, dut_top="seq_detector", mode="prove",
        depth=case.depth, reset_signal="rst", reset_polarity="high", clock_signal="clk", project_name="port",
        engine="both", portfolio=True)
    entry = {e["name"]: e for e in job.result.assertion_results}["ap_req002_detect"]
    assert entry["verdict"] == "PROVEN" and entry["evidence_level"] in ("L2", "L3")      # L3 with a certificate
    assert "native" not in entry["proved_by"] and len(entry["proved_by"]) >= 2


@requires_yosys
@requires_solver
def test_the_worker_reports_phase_times_and_memory():
    case = Case.load("up_down_counter")
    result = NativeEngine().run(_job(case))
    stats = result.stats
    assert set(stats["seconds"]) == {"bmc_assert", "bmc_cover", "induction", "deeper", "replay"} and stats["k"] == case.depth
    assert 0 < stats["peak_memory_mb"]["worker"] < 1024            # PRD §9.5: <= 1 GB per process


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


@requires_yosys
@requires_solver
def test_mined_invariants_prove_the_fifo_data_properties(monkeypatch):
    # "dout is the oldest entry" needs count[1:0] == wptr - rptr and count <= 4, which hold in every
    # reachable state but not in the unreachable ones the induction step may start from (E4)
    case = Case.load("sync_fifo4")
    labels = ("ap_req005_fall_through", "ap_req005_stable", "ap_req005_order")
    result = NativeEngine().run(_job(case))
    assert result.ok, result.error
    assert {l: result.verdicts[l].verdict for l in labels} == dict.fromkeys(labels, "PROVEN")
    monkeypatch.setenv("FORMAL_LEMMAS", "0")
    off = NativeEngine().run(_job(case))
    assert {l: off.verdicts[l].verdict for l in labels} == dict.fromkeys(labels, "HOLDS_BOUNDED")


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


@requires_yosys
@requires_solver
def test_the_deeper_search_finds_what_lies_beyond_the_depth(monkeypatch):
    # count == 14 needs 14 rising edges, about 28 cycles: past edge_counter's depth of 20, so BMC alone
    # reports NOT_REACHED; the deeper search (BMC on to 4x the depth) reaches it, as sby's PDR does
    case = Case.load("edge_counter")
    cover = NativeEngine().run(_job(case)).verdicts["co_req004_count"]
    assert cover.verdict == "COVERED" and "beyond the BMC depth" in cover.detail
    monkeypatch.setenv("FORMAL_DEEP", "0")
    assert NativeEngine().run(_job(case)).verdicts["co_req004_count"].verdict == "NOT_REACHED"


@pytest.mark.slow                  # nightly (tests-nightly.yml): about 9 minutes
@requires_solver
def test_an_assertion_bounded_among_the_others_is_proven_on_its_own():
    """sync_fifo4's order (in_order) with the rest of its sentence-form properties: k-induction
    does not close with every monitor in the model, so the assertion is tried in a model of its
    own and proven there."""
    from app.agent.patterns import checker_module
    from app.agent.planner import clauses
    from app.agent.sentences import parse
    case = Case.load("sync_fifo4")
    ir = case.sentence_ir()
    insts = [i for r in ir.requirements for c in clauses(r.text) for i in (parse(c, ir, r.id) or [])]
    sva, _ = checker_module(ir, insts)
    result = NativeEngine().run(EngineJob.from_ir(ir, case.rtl, sva, rtl_name=case.rtl_name, mode="prove",
                                                  depth=case.depth, timeout=900, name="alone"))
    assert result.ok, result.error
    assert result.verdicts["ap_req005_in_order"].verdict == "PROVEN", result.verdicts["ap_req005_in_order"]
    assert "on its own" in result.verdicts["ap_req005_in_order"].detail
    assert all(v.verdict in ("PROVEN", "COVERED") for v in result.verdicts.values())
