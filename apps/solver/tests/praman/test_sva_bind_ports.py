"""
Checkers with ports, attached with bind: a checker port stands for the
signal of the bound module connected to it (also when renamed), so the
properties check that module with either Yosys reader.  Ports of ordinary
sub-modules are their own signals.
"""

import shutil

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.sva.pipeline import UNSUPPORTED_MARKER, prepare
from app.praman.services.yosys_reader import SLANG, VERILOG, slang_available
from tests.praman.conftest import requires_sby

DUT = """module leaf (input clk, input en, output reg q);
  always @(posedge clk) q <= en;
  a_leaf : assert property (@(posedge clk) en |=> q);
endmodule
module hs (input clk, input rst_n, input valid, output reg ready);
  always @(posedge clk) if (!rst_n) ready <= 0; else ready <= valid;
  leaf u_leaf (.clk(clk), .en(valid), .q());
endmodule
"""
SVA = """module hs_sva (input logic clk, rst_n, v, ready);
  default clocking @(posedge clk); endclocking
  default disable iff (!rst_n);
  logic helper;
  assign helper = v;
  a_follow   : assert property (v |=> ready);
  c_ready    : cover property (ready);
  a_internal : assert property (helper |-> v);
endmodule
bind hs hs_sva u_sva (.clk(clk), .rst_n(rst_n), .v(valid), .ready(ready));
"""

READERS = [VERILOG, pytest.param(SLANG, marks=pytest.mark.skipif(
    shutil.which("yosys") is None or not slang_available(), reason="needs the yosys-slang plugin"))]


@pytest.mark.parametrize("reader", READERS)
def test_checker_ports_map_to_the_bound_module(reader):
    prepared = prepare({"hs.sv": DUT}, {"hs_sva.sv": SVA}, reader=reader)
    props = {p.label: p for p in prepared.properties}
    assert props["a_follow"].supported and props["c_ready"].supported and props["a_leaf"].supported
    hs_monitor = next(m for m in prepared.monitors if m.module_name == "__va_mon_hs")
    # the renamed port v reads the design's valid
    assert "input wire valid" in hs_monitor.text and " v," not in hs_monitor.text
    assert "a_follow" in hs_monitor.text and "a_leaf" not in hs_monitor.text
    assert any(m.module_name == "__va_mon_leaf" and "a_leaf" in m.text for m in prepared.monitors)


def test_with_read_sv_the_checker_is_instantiated_with_the_binds_connections():
    # its helper logic is then read too (no bind in read -sv)
    prepared = prepare({"hs.sv": DUT}, {"hs_sva.sv": SVA}, reader=VERILOG)
    assert {p.label: p for p in prepared.properties}["a_internal"].supported
    assert UNSUPPORTED_MARKER not in prepared.monitor_text
    sources = prepared.sources()
    assert "hs_sva u_sva (.clk(clk), .rst_n(rst_n), .v(valid), .ready(ready));" in sources["hs.sv"]
    assert "assign helper = v;" in sources["hs_sva.sv"] and "bind hs" not in sources["hs_sva.sv"]


@requires_sby
def test_bound_checker_with_ports_is_checked(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=SVA, dut_code=DUT, dut_filename="hs.sv", mode="prove", depth=8,
        project_name="bindports")
    assert job.result is not None, job.error_message
    verdicts = {r["name"]: r["verdict"] for r in job.result.assertion_results}
    assert verdicts["a_follow"] == "PROVEN"
    assert verdicts["c_ready"] == "COVERED"
    assert verdicts["a_leaf"] == "PROVEN"
    assert verdicts["a_internal"] == "PROVEN"     # the checker's helper logic


PACKED_DUT = """module pk (input logic clk, input logic rst_n, input logic [1:0] d);
  logic [3:0][1:0] r;
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) r <= '0; else r <= {r[2:0], d};
endmodule
"""
PACKED_SVA = """module pk_sva (input logic clk, rst_n, input logic [1:0] d, input logic [7:0] r);
  default clocking @(posedge clk); endclocking
  default disable iff (!rst_n);
  a_shift : assert property (r[1:0] == $past(d) || !$past(rst_n));
endmodule
bind pk pk_sva u_sva (.*);
"""


@pytest.mark.skipif(shutil.which("yosys") is None or not slang_available(), reason="needs the yosys-slang plugin")
def test_slang_reads_packed_arrays_as_written():
    # a checker port of the flat packed type binds to a packed 2-D array; the
    # preprocessor's unpacked rewrite (for read -sv) would make it a type error
    prepared = formal_service.compile_design(PACKED_SVA, PACKED_DUT, "pk.sv", "pk")
    assert prepared.reader == SLANG
    assert {p.label: p for p in prepared.properties}["a_shift"].supported
