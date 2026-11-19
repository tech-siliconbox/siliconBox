"""
Counterexample explanations: the trace is read through the checker's own
wires, so the explanation names the antecedent that matched, the condition
that was false and the cycle of the violation.
"""

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.sva.debug import explain_trace
from tests.praman.conftest import requires_sby

# dout keeps only the low byte of din: a planted truncation bug
DUT = """module d (input clk, input rst_n, input e, input a, input b, input [15:0] din,
          output reg q, output reg [15:0] dout);
  reg [7:0] narrow;
  always @(posedge clk)
    if (!rst_n) begin q <= 0; narrow <= 0; end
    else begin q <= a; narrow <= din[7:0]; end
  always @(*) dout = {8'h00, narrow};
endmodule
"""
SVA = """module d_sva ();
  a_next  : assert property (@(posedge d.clk) disable iff (!d.rst_n) d.e |=> d.q);
  a_multi : assert property (@(posedge d.clk) disable iff (!d.rst_n) (d.a ##1 d.b ##1 d.e) |-> d.q);
  property p_data; logic [15:0] data_start;
    @(posedge d.clk) disable iff (!d.rst_n) (d.e, data_start = d.din) |=> (d.dout == data_start);
  endproperty
  a_data  : assert property (p_data);
  c_aq    : cover property (@(posedge d.clk) d.a ##1 d.q);
endmodule
bind d d_sva u (.*);
"""


@pytest.fixture(scope="module")
def explained(tmp_path_factory):
    work = tmp_path_factory.mktemp("debug")
    patch = pytest.MonkeyPatch()
    patch.setattr(formal_service, "FORMAL_WORK_DIR", work)
    patch.setattr(sby_generator, "FORMAL_WORK_DIR", work)
    try:
        job = formal_service.FormalService().run_formal(
            sva_code=SVA, dut_code=DUT, dut_filename="d.sv", mode="prove", depth=12,
            project_name="debug")
    finally:
        patch.undo()
    assert job.result is not None, job.error_message
    out = {}
    for r in job.result.assertion_results:
        assert r["counterexample_vcd"], r["name"]
        out[r["name"]] = (r["verdict"], explain_trace(r["counterexample_vcd"], job.debug_info[r["name"]],
                                                      r["name"], r["type"]))
    return out


def _rows(debug):
    return {(c["role"], c["text"]): c["values"] for c in debug["conditions"]}


@requires_sby
def test_failing_condition_and_cycle(explained):
    verdict, debug = explained["a_next"]
    assert verdict == "FAIL"
    event, trigger = debug["event_cycle"], debug["trigger_cycle"]
    assert trigger == event - 1
    rows = _rows(debug)
    assert rows[("antecedent", "e")][trigger] == 1
    assert rows[("consequent", "q")][event] == 0
    assert f"Cycle {event}: the property needed `q` (q = 0) to be true" in debug["explanation"][-1]
    # the clock is not a condition, and only the property's signals are listed
    assert {s["name"] for s in debug["signals"]} == {"rst_n", "e", "q"}


@requires_sby
def test_multi_cycle_antecedent_is_named_with_its_span(explained):
    _, debug = explained["a_multi"]
    event = debug["event_cycle"]
    assert debug["antecedent"] == {"text": "a ##1 b ##1 e", "start": event - 2, "end": event}
    assert f"The antecedent `a ##1 b ##1 e` matched in cycles {event - 2}-{event}" in debug["explanation"][1]
    assert _rows(debug)[("consequent", "q")][event] == 0


@requires_sby
def test_local_variable_shows_the_captured_value(explained):
    _, debug = explained["a_data"]
    event = debug["event_cycle"]
    rows = _rows(debug)
    # one row per condition: only the failing replica is shown
    assert [k for k in rows if k[1] == "dout == data_start"] == [("consequent", "dout == data_start")]
    captured = debug["locals"][0]
    assert captured["name"] == "data_start"
    dout = next(s for s in debug["signals"] if s["name"] == "dout")
    # the bug: dout lost the captured value's upper byte
    assert int(captured["values"][event].split("'h")[1], 16) >> 8 != 0
    assert dout["values"][event] != captured["values"][event]
    assert any("Local variable `data_start` holds" in line for line in debug["explanation"])


@requires_sby
def test_cover_witness_lists_each_step(explained):
    verdict, debug = explained["c_aq"]
    assert verdict == "COVERED"
    event = debug["event_cycle"]
    assert debug["explanation"][0] == f"`c_aq` is reached at cycle {event}."
    assert f"Cycle {event - 1}: `a` (a = 1) held." in debug["explanation"]
    assert f"Cycle {event}: `q` (q = 1) held." in debug["explanation"]
