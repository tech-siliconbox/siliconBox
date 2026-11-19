"""
Several clock nets: checked in SymbiYosys multiclock mode with independent
clocks.  Before, every flop stepped at every solver step, as if all clocks
were one: a clock-domain crossing looked safe and a divided clock was
ignored.
"""

import shutil

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.sva.frontend import FrontendError
from app.praman.services.sva.pipeline import prepare
from tests.praman.conftest import requires_sby

DUT = """module cdc (input clk_a, input clk_b, input rst_n, input [3:0] din,
            output reg [3:0] data_a, output reg [3:0] dout_b, output reg [2:0] cnt_b, output reg half_q);
  reg half;
  always @(posedge clk_a)
    if (!rst_n) begin data_a <= 0; half <= 0; end else begin data_a <= din; half <= ~half; end
  always @(posedge clk_b)
    if (!rst_n) begin dout_b <= 0; cnt_b <= 0; end else begin dout_b <= data_a; cnt_b <= cnt_b + 1; end
  always @(posedge half) half_q <= din[0];
endmodule
// both clocks from one source
module tied (input clk, input rst_n, input [3:0] din);
  wire [3:0] data_a, dout_b; wire [2:0] cnt_b; wire half_q;
  cdc u (.clk_a(clk), .clk_b(clk), .rst_n(rst_n), .din(din), .data_a(data_a), .dout_b(dout_b),
         .cnt_b(cnt_b), .half_q(half_q));
endmodule
"""
SVA = """module cdc_sva ();
  a_same   : assert property (@(posedge cdc.clk_a) disable iff (!cdc.rst_n) 1 |=> cdc.data_a == $past(cdc.din));
  a_sync   : assert property (@(posedge cdc.clk_a) disable iff (!cdc.rst_n) 1 ##1 1 |=> cdc.dout_b == $past(cdc.din, 2));
  a_div    : assert property (@(posedge cdc.clk_a) disable iff (!cdc.rst_n) 1 ##1 1 |=> cdc.half_q == $past(cdc.din[0]));
  a_live_b : assert property (@(posedge cdc.clk_a) disable iff (!cdc.rst_n) s_eventually cdc.cnt_b[0]);
  c_b      : cover property (@(posedge cdc.clk_b) disable iff (!cdc.rst_n) cdc.cnt_b == 3'd3);
endmodule
bind cdc cdc_sva u_sva ();
"""

# the liveness part needs suprove (Docker image); the clocks must keep toggling
LIVE = "PROVEN" if shutil.which("suprove") else "HOLDS_BOUNDED"


def test_clock_nets_are_detected():
    independent = prepare({"cdc.sv": DUT}, {"sva.sv": SVA}, dut_top="cdc", reader="sv")
    assert independent.clocks.nets == ["cdc.clk_a", "cdc.clk_b", "cdc.half"]
    assert independent.clocks.top_inputs == ["clk_a", "clk_b"] and independent.multiclock
    assert "multiclock mode" in independent.summary
    tied = prepare({"cdc.sv": DUT}, {"sva.sv": SVA}, dut_top="tied", reader="sv")
    assert tied.clocks.nets == ["tied.clk", "tied.u.half"]      # the divided clock remains


def _verdicts(tmp_path, monkeypatch, top):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=SVA, dut_code=DUT, dut_filename="cdc.sv", dut_top=top, mode="prove", depth=20,
        project_name=f"mc_{top}")
    assert job.status == "complete", job.error_message
    assert job.result is not None and job.result.sanity["status"] == "OK"
    assert job.result.harness["multiclock"]
    return {a["name"]: a["verdict"] for a in job.result.assertion_results}


@requires_sby
def test_independent_clocks(tmp_path, monkeypatch):
    assert _verdicts(tmp_path, monkeypatch, "cdc") == {
        "a_same": "PROVEN", "a_sync": "FAIL", "a_div": "FAIL", "a_live_b": LIVE, "c_b": "COVERED"}


@requires_sby
def test_tied_clocks_with_a_divided_clock(tmp_path, monkeypatch):
    # a sub-module chosen as top elaborates it as the root
    assert _verdicts(tmp_path, monkeypatch, "tied") == {
        "a_same": "PROVEN", "a_sync": "PROVEN", "a_div": "FAIL", "a_live_b": LIVE, "c_b": "COVERED"}


def test_clock_setting_clocks_unclocked_assertions():
    dut = "module d (input clk, input rst_n, input a, output reg q); always @(posedge clk) q <= a; endmodule\n"
    sva = "module d_sva (); a_x : assert property (d.a |=> d.q); endmodule\nbind d d_sva u ();\n"
    default = prepare({"d.sv": dut}, {"sva.sv": sva}, reader="sv")
    assert "always @(posedge __va_gclk)" in default.monitor_text
    clocked = prepare({"d.sv": dut}, {"sva.sv": sva}, reader="sv", clock_signal="clk")
    assert "always @(posedge clk)" in clocked.monitor_text and "__va_gclk" not in clocked.monitor_text
    with pytest.raises(FrontendError, match="'clock' is not an input of top module 'd'"):
        prepare({"d.sv": dut}, {"sva.sv": sva}, reader="sv", clock_signal="clock")
