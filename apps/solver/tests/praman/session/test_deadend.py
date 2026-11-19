"""check_assumptions -dead_end: a reachable state where no input satisfies
the assumptions (app/praman/deadend.py)."""

import pytest

from app.praman.tclhost import tclsh_path
from tests.praman.conftest import requires_sby
from tests.praman.session.conftest import run

pytestmark = pytest.mark.skipif(tclsh_path() is None, reason="tclsh not installed")

# the environment promises an ack the cycle after a request, but the design never acks:
# once a request is made, no input can satisfy the assumption
NEVER_ACKS = """module hs(input clk, input rst_n, input req, input [1:0] d, output reg ack, output reg [1:0] q);
  always @(posedge clk) if (!rst_n) begin ack <= 0; q <= 0; end else begin ack <= 0; q <= d; end
  a_ack: assume property (@(posedge clk) disable iff (!rst_n) req |=> ack);
  ap_q: assert property (@(posedge clk) disable iff (!rst_n) q != 2'd3 || $past(d) == 2'd3);
endmodule
"""

# an assumption on the inputs alone: some input always satisfies it
INPUTS_ONLY = """module io(input clk, input rst_n, input req, output reg seen);
  always @(posedge clk) if (!rst_n) seen <= 0; else seen <= seen | req;
  a_pulse: assume property (@(posedge clk) disable iff (!rst_n) req |=> !req);
  ap_x: assert property (@(posedge clk) disable iff (!rst_n) 1);
endmodule
"""

SETUP = ("clock clk", "reset !rst_n")


def result(s):
    return s.dead_end or {}


@requires_sby
def test_a_dead_end_is_found_with_the_cycle_and_the_state(session):
    session.files["hs.sv"] = NEVER_ACKS
    run(session, "analyze -sv hs.sv", "elaborate -top hs", *SETUP)
    assert session.commands.call("check_assumptions", []) == "consistent", "a trace without requests exists"
    assert session.commands.call("check_assumptions", ["-dead_end"]) == "dead_end"
    found = result(session)
    assert found["status"] == "found" and found["cycle"] >= 3, "a request after reset, then no way on"
    assert found["state"], "the registers of the dead end"
    report = [e["text"] for e in session.events if e.get("code") == "PME099"][-1]
    assert "Dead end at cycle" in report and "hs.a_ack" in report


@requires_sby
def test_assumptions_on_the_inputs_alone_have_no_dead_end(session):
    session.files["io.sv"] = INPUTS_ONLY
    run(session, "analyze -sv io.sv", "elaborate -top io", *SETUP)
    assert session.commands.call("check_assumptions", ["-dead_end"]) == "consistent"
    assert result(session)["status"] == "none"
    assert any("No dead end: in every state" in e["text"] for e in session.events)


# the assumptions contradict each other only when cnt is 3, which the design never reaches
UNREACHED = """module ur(input clk, input rst_n, input go, output reg [1:0] cnt);
  always @(posedge clk) if (!rst_n) cnt <= 0; else if (go && cnt != 2'd2) cnt <= cnt + 1;
  a_one: assume property (@(posedge clk) disable iff (!rst_n) cnt == 2'd3 |-> go);
  a_two: assume property (@(posedge clk) disable iff (!rst_n) cnt == 2'd3 |-> !go);
  ap_x: assert property (@(posedge clk) disable iff (!rst_n) cnt != 2'd3);
endmodule
"""


@requires_sby
def test_a_dead_end_state_the_design_never_reaches_is_not_reported(session):
    session.files["ur.sv"] = UNREACHED
    run(session, "analyze -sv ur.sv", "elaborate -top ur", *SETUP)
    assert session.commands.call("check_assumptions", ["-dead_end"]) == "undetermined"
    found = result(session)
    assert found["status"] == "not_found" and found["candidates"] == 1, found
    assert "not reached from reset" in found["message"]
