"""
Driver tracing for debug: what drives a signal, under which conditions, and
the values it read in the counterexample.
"""

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.counterexample import drivers_payload
from app.praman.services.sva.drivers import find_drivers
from tests.praman.conftest import requires_sby
from tests.praman.test_auto_checks import DUT as FSM
from tests.praman.test_sva_debug import DUT, SVA

WRAP = FSM + """module wrap (input clk, input rst_n, input go, input [3:0] sel, input [7:0] din, output [7:0] q);
  fsm u (.clk(clk), .rst_n(rst_n), .go(go), .sel(sel), .din(din), .q(q));
endmodule
"""


def test_procedural_drivers_carry_their_branch_conditions():
    drivers = find_drivers({"fsm.sv": FSM}, "fsm", "fsm.st")["drivers"]
    run = next(d for d in drivers if d["text"] == "st <= RUN")
    assert run["clocked"] and run["kind"] == "always @(posedge clk)"
    assert run["conditions"] == ["rst_n", "st == IDLE", "go"]
    assert run["reads"] == ["fsm.rst_n", "fsm.st", "fsm.go"]
    # an index is read, not written
    assert find_drivers({"fsm.sv": FSM}, "fsm", "fsm.sel")["drivers"] == []


def test_ports_lead_into_and_out_of_instances():
    out = find_drivers({"w.sv": WRAP}, "wrap", "wrap.q")["drivers"]
    assert out[0]["kind"].startswith("output port 'q' of instance u") and out[0]["reads"] == ["wrap.u.q"]
    into = find_drivers({"w.sv": WRAP}, "wrap", "wrap.u.din")["drivers"]
    assert into[0]["kind"].startswith("input port 'din'") and into[0]["reads"] == ["wrap.din"]


@requires_sby
def test_driver_values_come_from_the_counterexample(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=SVA, dut_code=DUT, dut_filename="d.sv", mode="prove", depth=12,
        project_name="drivers")
    assert job.result is not None
    fail = next(a for a in job.result.assertion_results if a["name"] == "a_data")
    cycle = fail["step"] - 1 if fail["step"] else 3
    traced = drivers_payload(job, "d.dout", cycle, "a_data")
    d = traced["drivers"][0]
    assert d["text"] == "dout = {8'h00, narrow}" and not d["clocked"]
    assert d["values_at"] == cycle and set(d["values"]) == {"d.narrow"}
    # narrow is a flop: its value at `cycle` was computed from din one cycle earlier
    narrow = drivers_payload(job, "d.narrow", cycle, "a_data")
    flop = narrow["drivers"][0]            # the driver that fired comes first
    assert flop["text"] == "narrow <= din[7:0]" and flop["active"] is True
    assert flop["clocked"] and flop["values_at"] == cycle - 1 and "d.din" in flop["values"]
    assert narrow["drivers"][1]["active"] is False          # the reset branch
