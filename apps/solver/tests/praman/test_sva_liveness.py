"""
Liveness: s_eventually, strong unbounded sequences and s_until.  The safety
part is checked as usual; the eventuality is checked in SymbiYosys live mode
(suprove).  Fairness assumptions (assume property (s_eventually x)) constrain
the environment.
"""

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.sva.pipeline import prepare
from tests.praman.conftest import requires_suprove

# A request is granted one cycle after the arbiter sees it unstalled
DUT = """module arb (input clk, input rst_n, input req, input stall, output reg gnt);
  reg pend;
  always @(posedge clk)
    if (!rst_n) begin pend <= 0; gnt <= 0; end
    else begin gnt <= pend && !stall; pend <= (pend || req) && !(pend && !stall); end
endmodule
"""


def _sva(fairness: bool) -> str:
    fair = "  m_fair   : assume property (s_eventually !arb.stall);\n" if fairness else ""
    return f"""module arb_sva ();
  default clocking @(posedge arb.clk); endclocking
  default disable iff (!arb.rst_n);
  a_live   : assert property (arb.req |-> s_eventually arb.gnt);
  a_until  : assert property (arb.req && !arb.gnt |=> arb.pend s_until arb.gnt);
  a_strong : assert property (arb.req |-> strong(##[0:$] arb.gnt));
  a_input  : assert property (s_eventually arb.req);
{fair}  c_grant  : cover property (s_eventually arb.gnt);
endmodule
bind arb arb_sva u ();
"""


def test_liveness_compiles_to_live_and_witness_statements():
    prepared = prepare({"arb.sv": DUT}, {"sva.sv": _sva(True)}, reader="sv")
    assert all(p.supported for p in prepared.properties), [p.problems for p in prepared.properties]
    text = prepared.monitor_text
    for label in ("a_live", "a_until", "a_strong", "a_input"):
        assert f"{label}__live0: assert property (s_eventually" in text
        assert f"{label}__lwit0: cover(1);" in text
    assert "m_fair__fair0: assume property (s_eventually" in text
    assert "c_grant__live" not in text


@pytest.mark.parametrize("prop,reason", [
    ("strong(arb.req ##[1:$] arb.gnt)", "fairness constraints"),               # unbounded strong sequence
    ("(s_eventually arb.req) or (s_eventually arb.gnt)", "under 'or' in an assumption"),
])
def test_fairness_forms_that_are_not_supported(prop, reason):
    sva = f"""module arb_sva ();
  m_x : assume property (@(posedge arb.clk) {prop});
endmodule
bind arb arb_sva u ();
"""
    prepared = prepare({"arb.sv": DUT}, {"sva.sv": sva}, reader="sv")
    assert reason in prepared.properties[0].problems[0]


def test_eventualities_under_or_and_not_compile():
    sva = """module arb_sva ();
  default clocking @(posedge arb.clk); endclocking
  default disable iff (!arb.rst_n);
  a_or     : assert property (arb.req |-> (s_eventually arb.gnt) or (s_eventually arb.stall));
  a_never  : assert property (not s_eventually (arb.gnt && !$past(arb.pend)));
  m_seq    : assume property (s_eventually (!arb.stall ##1 !arb.stall));
  a_always : assert property (s_eventually always arb.gnt);
  a_prop   : assert property (s_eventually (arb.req |=> arb.gnt));
endmodule
bind arb arb_sva u ();
"""
    props = {p.label: p for p in prepare({"arb.sv": DUT}, {"sva.sv": sva}, reader="sv").properties}
    assert all(props[l].supported for l in ("a_or", "a_never", "m_seq", "a_always"))
    assert "s_eventually always p" in props["a_prop"].problems[0]


def _verdicts(tmp_path, monkeypatch, fairness):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=_sva(fairness), dut_code=DUT, dut_filename="arb.sv", mode="prove", depth=16,
        project_name="live")
    assert job.status == "complete", job.error_message
    assert job.result is not None
    return job, {a["name"]: a for a in job.result.assertion_results}


@requires_suprove
def test_without_fairness_a_stalled_arbiter_starves(tmp_path, monkeypatch):
    job, results = _verdicts(tmp_path, monkeypatch, fairness=False)
    for label in ("a_live", "a_until", "a_strong", "a_input"):
        assert results[label]["verdict"] == "FAIL", (label, results[label]["verdict_detail"])
        assert "Liveness violation" in results[label]["verdict_detail"]
        assert results[label]["counterexample_vcd"] and results[label]["trace_kind"] == "LIVE"
    assert results["c_grant"]["verdict"] == "COVERED"

    from app.praman.services.sva.debug import explain_trace
    r = results["a_live"]
    debug = explain_trace(r["counterexample_vcd"], job.debug_info["a_live"], "a_live", "LIVE")
    since, end = debug["pending_since"], debug["event_cycle"]
    assert since is not None and end - since + 1 >= 10
    assert any("Never true while pending: `gnt`" in line for line in debug["explanation"])


@requires_suprove
def test_with_fairness_every_request_is_granted(tmp_path, monkeypatch):
    _, results = _verdicts(tmp_path, monkeypatch, fairness=True)
    for label in ("a_live", "a_until", "a_strong"):
        assert results[label]["verdict"] == "PROVEN", (label, results[label]["verdict_detail"])
        assert "Liveness part proven" in results[label]["verdict_detail"]
    # nothing forces a request
    assert results["a_input"]["verdict"] == "FAIL"


OR_NOT = """module arb_sva ();
  default clocking @(posedge arb.clk); endclocking
  default disable iff (!arb.rst_n);
  // starving means stalling: one side or the other always happens, neither alone
  a_gnt      : assert property (arb.req |-> s_eventually arb.gnt);
  a_stall    : assert property (arb.req |-> s_eventually arb.stall);
  a_or       : assert property (arb.req |-> (s_eventually arb.gnt) or (s_eventually arb.stall));
  a_or_bad   : assert property (arb.req |-> (s_eventually arb.gnt) or (##1 !arb.stall));
  // never: a grant without a pending request the cycle before
  a_never    : assert property (not s_eventually (arb.gnt && !$past(arb.pend)));
  a_gnt_never: assert property (not s_eventually arb.gnt);
endmodule
bind arb arb_sva u ();
"""


def _run(tmp_path, monkeypatch, sva, name):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=sva, dut_code=DUT, dut_filename="arb.sv", mode="prove", depth=16, project_name=name)
    assert job.status == "complete" and job.result is not None, job.error_message
    return {a["name"]: a["verdict"] for a in job.result.assertion_results}


@requires_suprove
def test_or_of_eventualities_without_fairness(tmp_path, monkeypatch):
    verdicts = _run(tmp_path, monkeypatch, OR_NOT, "orlive")
    assert verdicts == {"a_gnt": "FAIL", "a_stall": "FAIL", "a_or": "PROVEN", "a_or_bad": "FAIL",
                        "a_never": "PROVEN", "a_gnt_never": "FAIL"}


@requires_suprove
def test_fairness_over_a_sequence(tmp_path, monkeypatch):
    sva = _sva(False).replace("endmodule", "  m_seq : assume property (s_eventually (!arb.stall ##1 !arb.stall));\nendmodule")
    verdicts = _run(tmp_path, monkeypatch, sva, "seqfair")
    assert verdicts["a_live"] == "PROVEN"


@requires_suprove
@pytest.mark.parametrize("fair", [
    "arb.req |-> s_eventually (!arb.stall ##1 !arb.stall)",   # after each request
    "s_eventually (!arb.stall ##[1:$] !arb.stall)",           # an unbounded sequence
])
def test_fairness_over_sequences_after_a_trigger_or_unbounded(tmp_path, monkeypatch, fair):
    sva = _sva(False).replace("endmodule", f"  m_seq  : assume property ({fair});\n"
                                           "  a_free : assert property (s_eventually always !arb.stall);\nendmodule")
    verdicts = _run(tmp_path, monkeypatch, sva, "seqfair2")
    # the requests are served; stall is not assumed to stop for good
    assert (verdicts["a_live"], verdicts["a_free"]) == ("PROVEN", "FAIL")


# s_eventually always p: from some cycle on, p holds for good.  done sets once
# go comes (fairness: it does), t toggles forever, busy follows !quiet, and
# quiet settles (assumed with s_eventually always).
SETTLE = """module settle (input clk, input rst_n, input go, input quiet, output reg done, output reg t,
               output reg busy);
  always @(posedge clk)
    if (!rst_n) begin done <= 0; t <= 0; busy <= 0; end
    else begin
      if (go) done <= 1;
      t <= !t;
      busy <= !quiet;
    end
endmodule
"""
SETTLE_SVA = """module settle_sva ();
  default clocking @(posedge settle.clk); endclocking
  default disable iff (!settle.rst_n);
  f_go     : assume property (s_eventually settle.go);
  f_quiet  : assume property (s_eventually always settle.quiet);
  a_settle : assert property (s_eventually always settle.done);
  a_osc    : assert property (s_eventually always settle.t);
  a_alt    : assert property (s_eventually always (settle.t |=> !settle.t));
  a_calm   : assert property (s_eventually always !settle.busy);
endmodule
bind settle settle_sva u ();
"""


def test_persistence_compiles_to_a_check_with_its_own_fairness():
    prepared = prepare({"settle.sv": SETTLE}, {"sva.sv": SETTLE_SVA}, reader="sv")
    assert all(p.supported for p in prepared.properties), [p.problems for p in prepared.properties]
    text = prepared.monitor_text
    assert "a_osc__lfair0: assume property (s_eventually" in text
    assert "a_osc__live0: assert property (s_eventually !(1'b1));" in text
    assert "f_quiet__fair0: assume property (s_eventually" in text and "f_quiet__lfair" not in text


@requires_suprove
def test_persistence_verdicts(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=SETTLE_SVA, dut_code=SETTLE, dut_filename="settle.sv", mode="prove", depth=12,
        project_name="settle")
    assert job.status == "complete" and job.result is not None, job.error_message
    results = {a["name"]: a for a in job.result.assertion_results}
    # each check uses only its own fairness: a_calm's ("busy recurs") would
    # contradict f_quiet and make every other liveness check pass vacuously
    assert {k: v["verdict"] for k, v in results.items() if k.startswith("a_")} == {
        "a_settle": "PROVEN", "a_osc": "FAIL", "a_alt": "PROVEN", "a_calm": "PROVEN"}
    assert "fail again and again" in results["a_osc"]["verdict_detail"]


@requires_suprove
def test_without_the_persistence_assumption_busy_can_recur(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    sva = SETTLE_SVA.replace("  f_quiet  : assume property (s_eventually always settle.quiet);\n", "")
    job = formal_service.FormalService().run_formal(
        sva_code=sva, dut_code=SETTLE, dut_filename="settle.sv", mode="prove", depth=12, project_name="settle2")
    assert job.status == "complete" and job.result is not None, job.error_message
    verdicts = {a["name"]: a["verdict"] for a in job.result.assertion_results}
    assert verdicts["a_calm"] == "FAIL" and verdicts["a_settle"] == "PROVEN"
