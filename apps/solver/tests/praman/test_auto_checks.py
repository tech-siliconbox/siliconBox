"""
Automatic checks of the design, without SVA: every if/case branch must be
reachable (an unreachable one is dead code, e.g. an FSM state never
entered), and variable indexes must stay within their array's bounds.
"""

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from tests.praman.conftest import requires_sby

DUT = """module fsm (input clk, input rst_n, input go, input [3:0] sel, input [7:0] din, output reg [7:0] q);
  localparam IDLE = 2'd0, RUN = 2'd1, DONE = 2'd2, ERR = 2'd3;
  reg [1:0] st;
  reg [7:0] mem [0:11];
  always @(posedge clk)
    if (!rst_n) st <= IDLE;
    else case (st)
      IDLE: if (go) st <= RUN;
      RUN:  st <= DONE;
      DONE: st <= IDLE;
      ERR:  st <= IDLE;
    endcase
  always @(posedge clk) if (st == RUN) mem[sel] <= din;
  always @(posedge clk) if (sel < 4'd12) q <= mem[sel];
endmodule
"""


@requires_sby
def test_dead_states_and_index_overflows_are_found(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code="", dut_code=DUT, dut_filename="fsm.sv", mode="prove", depth=12,
        project_name="auto", auto_checks=True)
    assert job.status == "complete", job.error_message
    assert job.result is not None
    results = {a["name"]: a for a in job.result.assertion_results}
    verdicts = {k: v["verdict"] for k, v in results.items()}
    assert verdicts == {
        "auto_reach_fsm_L7_item0": "COVERED",        # IDLE
        "auto_reach_fsm_L7_item1": "COVERED",        # RUN
        "auto_reach_fsm_L7_item2": "COVERED",        # DONE
        "auto_reach_fsm_L7_item3": "UNREACHABLE",    # ERR: never entered
        "auto_reach_fsm_L8_then": "COVERED",
        "auto_reach_fsm_L13_then": "COVERED",
        "auto_index_fsm_L13": "FAIL",                # sel can be 12..15
        "auto_reach_fsm_L14_then": "COVERED",
        "auto_index_fsm_L14": "PROVEN",              # guarded by sel < 12
    }
    assert results["auto_reach_fsm_L7_item3"]["description"] == "'case (st)' item ERR at fsm.sv:7 is reachable"
    assert "stays within [0:11]" in results["auto_index_fsm_L13"]["description"]


def test_auto_checks_are_off_by_default():
    from app.praman.services.sva.pipeline import prepare
    assert prepare({"fsm.sv": DUT}, {}, reader="sv").properties == []


def test_index_in_a_continuous_assignment_is_checked():
    from app.praman.services.sva.pipeline import prepare
    src = DUT.replace("endmodule", "  wire [7:0] peek;\n  assign peek = mem[sel];\nendmodule")
    labels = [p.label for p in prepare({"fsm.sv": src}, {}, reader="sv", auto_checks=True).properties]
    assert "auto_index_fsm_L16" in labels
