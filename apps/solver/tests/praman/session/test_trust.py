"""Can a result be trusted: the assumptions a proof needs
(get_needed_assumptions) and the registers the reset does not set
(check_reset)."""

import pytest

from app.praman.tclhost import tclsh_path
from tests.praman.conftest import requires_sby, requires_yosys
from tests.praman.session.test_session import run, session  # noqa: F401  (fixture)

pytestmark = pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed")
SETUP = ("analyze -sv pair.sv pair_sva.sv", "elaborate -top pair", "clock clk", "reset !rst_n")

PARTLY_RESET = """module r(input clk, input rst_n, input [3:0] d, output reg [3:0] a, output reg [3:0] b, output reg [1:0] c);
  always @(posedge clk) if (!rst_n) a <= 0; else a <= d;
  always @(posedge clk) b <= d;
  always @(posedge clk) if (!rst_n) c[0] <= 0; else c <= d[1:0];
endmodule
"""


def errors(s):
    return [e["text"] for e in s.events if e["kind"] == "error"]


@requires_sby
def test_the_assumptions_a_proof_needs(session):
    run(session, *SETUP, "assume -name a_never_a {!en_a}", "assume -name a_never_b {!en_b}",
        "assert -name t_qa_stays_zero {qa == 3'd0}", "prove -property {t_qa_stays_zero ap_in_range}")
    assert session.props["t_qa_stays_zero"].status == "proven"
    assert session.commands.call("get_needed_assumptions", ["-property", "t_qa_stays_zero"]) == "pair.a_never_a", \
        "en_b never matters to qa: that assumption is not needed"
    assert "needs: a_never_a" in session.props["t_qa_stays_zero"].detail
    assert session.commands.call("get_needed_assumptions", ["-property", "ap_in_range"]) == ""
    assert any("holds without any of the 2 assumptions" in e["text"] for e in session.events)
    session.submit("get_needed_assumptions -property ap_bad")
    assert session.wait_idle(60)
    assert any("only a proven assertion" in e for e in errors(session))


@requires_yosys
def test_registers_the_reset_does_not_set(session):
    session.files["r.sv"] = PARTLY_RESET
    run(session, "analyze -sv r.sv", "elaborate -top r", "clock clk", "reset !rst_n")
    assert session.commands.call("check_reset", []) == "b c"
    report = [e["text"] for e in session.events if e.get("code") == "PMW089"][-1]
    assert "2 of 3 registers (6 bits)" in report and "b [3:0]" in report and "c [1:0]  (some bits)" in report
    run(session, "clear -all", *SETUP)
    assert session.commands.call("check_reset", []) == ""
    assert any("all 2 registers have a value after reset" in e["text"] for e in session.events)
