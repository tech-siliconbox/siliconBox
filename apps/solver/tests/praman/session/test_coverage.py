"""Formal coverage of the design's branches (check_cov)."""

import pytest

from app.praman import coverage
from app.praman.tclhost import tclsh_path
from tests.praman.conftest import requires_sby
from tests.praman.session.test_session import run, session  # noqa: F401  (fixture)

pytestmark = pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed")

FSM = """module dc(input clk, input rst_n, input a, output reg [1:0] st, output reg y);
  always @(posedge clk)
    if (!rst_n) st <= 2'd0;
    else case (st)
      2'd0: st <= a ? 2'd1 : 2'd0;
      2'd1: st <= 2'd0;
      2'd3: st <= 2'd0;
    endcase
  always @* if (st == 2'd2) y = 1'b1; else y = 1'b0;
  function automatic f(input x); if (x) f = 1; else f = 0; endfunction
endmodule
"""


def test_every_branch_gets_a_cover_and_no_line_moves():
    text, items = coverage.branches(FSM)
    assert text.count("\n") == FSM.count("\n")
    assert [(i["kind"], i["line"]) for i in items] == [
        ("then", 3), ("else", 4), ("case item", 5), ("case item", 6), ("case item", 7), ("no case item", 4),
        ("then", 9), ("else", 9)], "the function's branches are not the design's"
    assert items[2]["what"] == "case (st) 2'd0"
    assert coverage.reset_branch(items[0], "rst_n", True) and not coverage.reset_branch(items[6], "rst_n", True)
    for condition, is_reset in (("!rst_n", True), ("~resetn", True), ("rst == 1'b1", True), ("rst_n == 0", True),
                                ("!a", False), ("st == 2'd2", False), ("rst_n", False)):
        item = {"kind": "then", "what": f"if ({condition})"}
        assert coverage.reset_branch(item, "rst_n", True) is is_reset, condition


@requires_sby
def test_reachable_and_unreachable_branches(session):
    session.files["dc.sv"] = FSM
    run(session, "analyze -sv dc.sv", "elaborate -top dc", "clock clk", "reset !rst_n", "check_cov")
    status = {(i["line"], i["kind"]): i["status"] for i in session.coverage["items"]}
    assert status == {(3, "then"): "reset", (4, "else"): "covered", (5, "case item"): "covered",
                      (6, "case item"): "covered", (7, "case item"): "unreachable", (4, "no case item"): "unreachable",
                      (9, "then"): "unreachable", (9, "else"): "covered"}
    assert session.coverage["covered"] == 4 and session.coverage["percent"] == pytest.approx(57.1), \
        "4 of the 7 branches outside reset"
    assert all(i["file"] == "dc.sv" for i in session.coverage["items"])
    report = [e["text"] for e in session.events if e.get("code") == "PMW093"][-1]
    assert "dc.sv(7): case (st) 2'd3" in report
    # an assumption that rules out real behaviour shows up as unreachable code
    run(session, "assume -name a_never {!a}", "check_cov")
    status = {(i["line"], i["kind"]): i["status"] for i in session.coverage["items"]}
    assert status[(6, "case item")] == "unreachable", "with a never high, state 1 is never reached"


PAIR_SETUP = ("analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "clock clk", "reset !rst_n")


def test_statements_and_toggles_are_instrumented_without_moving_a_line():
    from tests.praman.session.designs import PAIR
    signals = {"cnt": [{"name": "q", "width": 3, "line": 1}, {"name": "rst_n", "width": 1, "line": 1}]}
    text, items, toggles, info = coverage.instrument(PAIR, "pair.sv", signals)
    assert text.count("\n") == PAIR.count("\n")
    assert [(i["what"], i["statements"]) for i in items] == [
        ("if (!rst_n)", 1), ("if (en && !full)", 1), ("not (en && !full)", 0)]
    assert [t["what"] for t in toggles[:2]] == ["q[0] rises", "q[0] falls"] and len(toggles) == 6, \
        "three bits, each rises and falls; the reset is not counted"
    assert "always @(posedge clk) begin __pm_tgl_1: cover ($rose(q[0]));" in text
    assert info["clocks"] == {"cnt": "clk"}


@requires_sby
def test_each_instance_is_covered_on_its_own(session):
    run(session, *PAIR_SETUP, "assume -name a_b_off {!en_b}", "check_cov")
    cov = session.coverage
    counting = {(r["instance"], r["what"]): r["status"] for r in cov["items"]}
    assert counting[("u_a", "if (en && !full)")] == "covered"
    assert counting[("u_b", "if (en && !full)")] == "unreachable", "u_b is never enabled"
    toggles = {(r["instance"], r["what"]): r["status"] for r in cov["toggles"]}
    assert toggles[("u_a", "q[2] rises")] == "covered" and toggles[("u_b", "q[0] rises")] == "unreachable"
    assert toggles[("pair", "en_b rises")] == "unreachable", "the top's ports, on the declared clock"
    by = {p["instance"]: p for p in cov["instances"]}
    assert by["u_a"]["statements"]["percent"] == 100.0 and by["u_b"]["statements"]["percent"] == 0.0
    assert by["u_b"]["branches"]["covered"] == 1 and by["u_b"]["branches"]["unreachable"] == 1
    assert set(cov["jobs"]) == {"u_a", "u_b", ""} and cov["jobs"]["u_a"] != cov["jobs"]["u_b"], "a run per instance"
    assert any("Coverage per instance" in e["text"] for e in session.events)
    run(session, "check_cov -model {branch}")
    assert session.coverage["toggles"] == [] and session.coverage["items"]


@requires_sby
def test_the_proof_core_names_the_lines_a_proof_relies_on(session):
    run(session, *PAIR_SETUP, "prove -property {ap_full_stays ap_in_range}", "check_cov -type proof")
    cov = session.coverage
    assert cov["kind"] == "proof" and cov["status"] == "done"
    lines = {r["line"]: r for r in cov["lines"]}
    assert lines[3]["status"] == "relied on" and "ap_full_stays" in lines[3]["properties"], "assign full = &q"
    assert cov["relied_on"] >= 1 and 0 < cov["percent"] <= 100
    run(session, "stopat u_a.full")
    session.submit("check_cov -type proof")
    assert session.wait_idle(60)
    assert any("clear stopat" in e["text"] for e in session.events if e["kind"] == "error")
