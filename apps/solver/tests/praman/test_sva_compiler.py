"""
The SVA compiler turns elaborated assertions into monitor RTL that Yosys
accepts, and reports what it cannot compile per property.  Verdicts are
covered by the corpus tests (they need sby).
"""

import subprocess

from app.praman.services.sva.compiler import compile_monitor
from app.praman.services.sva.frontend import elaborate
from tests.praman.conftest import requires_yosys

DUT = """
module dut (input clk, input rst_n, input d, input e, input [15:0] din, output reg q,
            output reg [15:0] dout);
  always @(posedge clk) begin
    if (!rst_n) begin q <= 0; dout <= 0; end else begin q <= d; dout <= din; end
  end
endmodule
"""

SVA = """
module dut_sva ();
  `define CHK(x) (x)
  default clocking @(posedge dut.clk); endclocking
  default disable iff (!dut.rst_n);
  a_basic   : assert property (dut.d |=> dut.q);
  a_and     : assert property ((dut.d and dut.e) |=> dut.q);
  a_seq     : assert property (dut.d ##[1:3] dut.e |-> ##1 dut.q);
  a_rep     : assert property (dut.d [*2] |=> dut.q);
  a_not     : assert property (not (dut.d ##1 !dut.q));
  a_or      : assert property ((dut.d |=> dut.q) or (dut.e |=> dut.q));
  a_until   : assert property (dut.d |=> dut.q until dut.e);
  a_goto    : assert property (dut.d [->2] |=> dut.q);
  a_within  : assert property ((dut.d ##1 dut.e) within (dut.e [*1:4]) |=> 1);
  a_past    : assert property (dut.d |=> dut.dout == $past(dut.din));
  a_macro   : assert property (`CHK(dut.d) |=> dut.q);
  a_live    : assert property (dut.d |-> s_eventually dut.q);
  c_seq     : cover property (dut.d ##[1:3] dut.e);
  m_e       : assume property (dut.e |=> !dut.e);
  property p_cap;
    logic [15:0] v;
    (dut.d, v = dut.din) ##1 dut.e |=> dut.dout != v + 16'd1;
  endproperty
  a_local   : assert property (p_cap);
endmodule
bind dut dut_sva u_sva (.*);
"""


def compiled():
    design = elaborate({"dut.sv": DUT, "sva.sv": SVA})
    return compile_monitor("__va_mon_dut", "dut", design.records)


def test_every_property_compiles_or_reports_a_reason():
    monitor = compiled()
    status = {p.label: p.supported for p in monitor.properties}
    assert all(status.values()), {p.label: p.problems for p in monitor.properties if p.problems}
    assert "a_live__live0: assert property (s_eventually" in monitor.text
    assert monitor.connections == {
        "clk": "clk", "rst_n": "rst_n", "d": "d", "q": "q", "e": "e", "dout": "dout", "din": "din"}


def test_implications_get_precondition_covers():
    monitor = compiled()
    pre = {p.label: p.has_precondition for p in monitor.properties if p.supported}
    assert pre["a_basic"] and pre["a_local"]
    assert not pre["a_not"]
    assert "a_basic__pre: cover(1);" in monitor.text


@requires_yosys
def test_generated_monitor_is_accepted_by_yosys(tmp_path):
    monitor = compiled()
    (tmp_path / "mon.sv").write_text(monitor.text)
    result = subprocess.run(
        ["yosys", "-q", "-p", "read -sv -formal mon.sv; prep -top __va_mon_dut"],
        cwd=tmp_path, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
