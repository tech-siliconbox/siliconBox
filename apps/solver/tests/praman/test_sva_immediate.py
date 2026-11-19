"""
Immediate assertions written in the design's always blocks are checked as
monitor properties: at the block's clock, guarded by the if/case branch they
are in, and only after the harness reset sequence (they have no disable iff).
"""

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from tests.praman.conftest import requires_sby, requires_yosys_slang

DUT = """module ctr (input clk, input rst_n, input en, input [1:0] mode,
            output reg [3:0] c, output reg busy);
  reg [3:0] tmp;
  always @(posedge clk) begin
    if (!rst_n) begin c <= 0; busy <= 0; end
    else begin
      if (en) begin
        c <= (c == 4'd9) ? 4'd0 : c + 4'd1;
        a_range : assert (c <= 4'd9);
        a_bad   : assert (c != 4'd5);
      end else begin
        c_idle  : cover (c == 4'd3);
      end
      case (mode)
        2'd0: a_mode0 : assert (c < 4'd10);
        default: ;
      endcase
      tmp = c + 4'd1;
      a_tmp : assert (tmp != 0);
    end
  end
  // combinational: c is uninitialised before the first reset edge
  always @(*) a_comb : assert (c != 4'd12);
  task t; a_task : assert (1); endtask
endmodule
"""


@requires_sby
def test_immediate_assertions_in_the_design_are_checked(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code="", dut_code=DUT, dut_filename="ctr.sv", mode="prove", depth=20,
        project_name="imm")
    assert job.status == "complete", job.error_message
    assert job.result is not None
    results = {a["name"]: a for a in job.result.assertion_results}
    verdicts = {k: v["verdict"] for k, v in results.items()}
    assert verdicts == {
        "a_range": "PROVEN", "a_bad": "FAIL", "c_idle": "COVERED", "a_mode0": "PROVEN",
        "a_comb": "PROVEN", "a_tmp": "PROVEN", "a_task": "ERROR"}
    # tmp = c + 1 is followed: the assertion reads that value
    # the task is never called, so its assertion is never executed
    assert "never called" in results["a_task"]["verdict_detail"]
    # the branch condition is the antecedent: vacuity is reported for it
    assert results["a_range"]["precondition"]["status"] == "REACHED"


# Procedural code the walk follows symbolically: values merged across if/else,
# casez / case inside arms, an unrolled loop, a task called twice (inlined at
# each call), a function, initial blocks, and a value it cannot follow.
PROCEDURAL = """module imm2 #(parameter W = 4) (input clk, input rst_n, input en,
                                 input [3:0] a, input [3:0] b, input [3:0] s, output reg [3:0] q);
  function automatic [3:0] inc(input [3:0] v); return v + 4'd1; endfunction
  task automatic check(input [3:0] x);
    a_inc : assert (inc(x) != x);
  endtask
  reg [3:0] t;
  reg [3:0] mem [0:1];
  always @(posedge clk) begin
    if (!rst_n) q <= 0;
    else begin
      if (en) t = a; else t = b;
      a_mux : assert (t == (en ? a : b));
      casez (s)
        4'b1??0: a_casez : assert (s[3] && !s[0]);
        default: ;
      endcase
      case (s) inside
        [4'd2:4'd5]: a_inside : assert (s >= 2 && s <= 5);
        default: ;
      endcase
      for (int i = 0; i < 4; i++) a_bit : assert (i != 3 || !(a[i] && b[i]));
      check(a);
      check(t);
      mem[0] = a;
      a_part : assert (mem[0] == a);
      q <= t;
    end
  end
  initial a_init : assert (W == 4);
  initial a_init_bad : assert (W == 5);
endmodule
"""


@requires_yosys_slang   # case inside, functions with return: SystemVerilog for Yosys
def test_procedural_code_is_followed(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code="", dut_code=PROCEDURAL, dut_filename="imm2.sv", mode="prove", depth=10,
        project_name="imm2")
    assert job.status == "complete" and job.result is not None, job.error_message
    results = {a["name"]: a for a in job.result.assertion_results}
    verdicts = {k: v["verdict"] for k, v in results.items()}
    assert verdicts == {
        "a_mux": "PROVEN", "a_casez": "PROVEN", "a_inside": "PROVEN",
        "a_bit__i0": "PROVEN", "a_bit__i1": "PROVEN", "a_bit__i2": "PROVEN", "a_bit__i3": "FAIL",
        "a_inc": "PROVEN", "a_inc__call2": "PROVEN",
        "a_part": "ERROR", "a_init": "PROVEN", "a_init_bad": "FAIL"}
    assert "cannot follow" in results["a_part"]["verdict_detail"], results["a_part"]["verdict_detail"]


def test_branches_inside_casez_are_automatic_checks():
    from app.praman.services.sva.pipeline import prepare
    prepared = prepare({"imm2.sv": PROCEDURAL}, {}, auto_checks=True)
    reach = [p.label for p in prepared.properties if p.label.startswith("auto_reach_")]
    # casez and case-inside arms (and their defaults) are reachability covers too
    assert any(l.endswith("_item0") for l in reach) and sum(l.endswith("_default") for l in reach) >= 2


# The same ideas in Verilog-2001 style (also readable without yosys-slang)
CLASSIC = """module imm3 (input clk, input rst_n, input [3:0] a, output reg [3:0] q);
  function [3:0] twice;
    input [3:0] v;
    twice = v + v;
  endfunction
  task check;
    input [3:0] x;
    a_even : assert ((twice(x) & 4'd1) == 0);
  endtask
  integer i;
  always @(posedge clk) begin
    if (!rst_n) q <= 0;
    else begin
      for (i = 0; i < 3; i = i + 1) a_idx : assert (i < 3);
      check(a);
      q <= a;
    end
  end
endmodule
"""


@requires_sby
def test_classic_functions_tasks_and_loops(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code="", dut_code=CLASSIC, dut_filename="imm3.sv", mode="prove", depth=8, project_name="imm3")
    assert job.status == "complete" and job.result is not None, job.error_message
    verdicts = {a["name"]: a["verdict"] for a in job.result.assertion_results}
    assert verdicts == {"a_idx__i0": "PROVEN", "a_idx__i1": "PROVEN", "a_idx__i2": "PROVEN", "a_even": "PROVEN"}


# Selects of computed values: a function result, a concatenation, an array element
SELECTS = """module sel (input clk, input rst_n, input [3:0] a, input [3:0] b, output reg [3:0] q);
  function [3:0] twice;
    input [3:0] v;
    twice = v + v;
  endfunction
  reg [3:0] mem [0:3];
  always @(posedge clk) begin
    mem[a[1:0]] <= b;
    if (!rst_n) q <= 0;
    else begin
      a_bit0   : assert (twice(a)[0] == 1'b0);
      a_concat : assert ({a, b}[3:0] == b);
      a_elem   : assert (mem[a[1:0]][3:0] == mem[a[1:0]]);
      a_wrong  : assert (twice(a)[1] == 1'b0);
      q <= a;
    end
  end
endmodule
"""


@requires_sby
def test_selects_of_computed_values(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code="", dut_code=SELECTS, dut_filename="sel.sv", mode="prove", depth=6, project_name="sel")
    assert job.status == "complete" and job.result is not None, job.error_message
    verdicts = {a["name"]: a["verdict"] for a in job.result.assertion_results}
    assert verdicts == {"a_bit0": "PROVEN", "a_concat": "PROVEN", "a_elem": "PROVEN", "a_wrong": "FAIL"}


MEM = """module rf (input clk, input rst_n, input we, input [1:0] wa, input [1:0] ra, input [7:0] wd,
           output reg [7:0] rd);
  reg [7:0] mem [0:3];
  always @(posedge clk) begin
    if (we) mem[wa] <= wd;
    rd <= mem[ra];
  end
endmodule
"""
MEM_SVA = """module rf_sva ();
  a_read  : assert property (@(posedge rf.clk) disable iff (!rf.rst_n) 1 |=> rf.rd == $past(rf.mem[rf.ra]));
  a_write : assert property (@(posedge rf.clk) disable iff (!rf.rst_n) rf.we |=> rf.mem[$past(rf.wa)] == $past(rf.wd));
  a_whole : assert property (@(posedge rf.clk) rf.mem == rf.mem);
endmodule
bind rf rf_sva u ();
"""


@requires_sby
def test_array_elements_in_concurrent_assertions(tmp_path, monkeypatch):
    # elements are read through their own ports; the whole array is not
    # checkable, and that does not stop the other properties
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=MEM_SVA, dut_code=MEM, dut_filename="rf.sv", mode="prove", depth=8, project_name="mem")
    assert job.status == "complete" and job.result is not None, job.error_message
    results = {a["name"]: a for a in job.result.assertion_results}
    assert results["a_read"]["verdict"] == "PROVEN"
    assert results["a_write"]["verdict"] == "ERROR"            # $past in an array index
    assert "array index" in results["a_write"]["verdict_detail"]
    assert results["a_whole"]["verdict"] == "ERROR"


# Values the walk follows through partial and compound assignments
PARTS = """module parts (input clk, input rst_n, input [3:0] a, output reg [3:0] q);
  reg [3:0] p, m, s;
  always @(posedge clk) begin
    if (!rst_n) q <= 0;
    else begin
      // s keeps 4 bits, also when read in a 5-bit expression
      s = a + a;
      a_wrap : assert (s + 5'd0 < 5'd16);
      p = 4'h0;
      p[0] = a[0];
      p[2:1] = 2'b11;
      a_part : assert (p == {1'b0, 2'b11, a[0]});
      p += 4'd1;
      a_comp : assert (p == {1'b0, 2'b11, a[0]} + 4'd1);
      m = 4'h0;
      m[a[1:0]] = 1'b1;
      a_onehot : assert (m == 4'd1 << a[1:0]);
      a_bad    : assert (m != 4'd8);
      q <= a;
    end
  end
endmodule
"""


@requires_sby
def test_partial_and_compound_assignments_are_followed(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code="", dut_code=PARTS, dut_filename="parts.sv", mode="prove", depth=6, project_name="parts")
    assert job.status == "complete" and job.result is not None, job.error_message
    verdicts = {a["name"]: a["verdict"] for a in job.result.assertion_results}
    assert verdicts == {"a_wrap": "PROVEN", "a_part": "PROVEN", "a_comp": "PROVEN", "a_onehot": "PROVEN",
                        "a_bad": "FAIL"}


# Loops whose iteration count depends on a signal
LOOPS = """module loops (input clk, input rst_n, input [3:0] a, input [2:0] n, output reg [3:0] q);
  reg [7:0] w, w2;
  integer i, j, k;
  always @(posedge clk) begin
    if (!rst_n) q <= 0;
    else begin
      w = 8'd0;
      for (i = 0; i < n; i = i + 1) w = w + 8'd1;
      a_count : assert (w == n);
      a_wrong : assert (w < 8'd7);
      w2 = 8'd0;
      k = 0;
      while (k < n) begin
        w2 += 8'd2;
        k++;
      end
      a_twice : assert (w2 == 2 * n);
      j = 0;
      while (j < 2) begin
        a_w : assert (j < 2);
        j++;
      end
      a_after : assert (j == 2);
      q <= a;
    end
  end
endmodule
"""


@requires_yosys_slang   # loops bounded by a signal: SystemVerilog for Yosys
def test_loops_bounded_by_signals_are_unrolled(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code="", dut_code=LOOPS, dut_filename="loops.sv", mode="prove", depth=6, project_name="loops")
    assert job.status == "complete" and job.result is not None, job.error_message
    verdicts = {a["name"]: a["verdict"] for a in job.result.assertion_results}
    assert verdicts == {"a_count": "PROVEN", "a_wrong": "FAIL", "a_twice": "PROVEN",
                        "a_w__it0": "PROVEN", "a_w__it1": "PROVEN", "a_after": "PROVEN"}


def test_loops_that_cannot_be_unrolled_are_reported():
    from app.praman.services.sva.pipeline import prepare
    dut = """module stuck (input clk, input go, input [3:0] a);
  integer i;
  always @(posedge clk) begin
    while (go) a_spin : assert (a != 0);
    while (1'b1) a_ever : assert (a != 0);
    for (i = 0; i < 4; i = i + 1) begin
      if (a[i]) break;
      a_brk : assert (i < 4);
    end
  end
endmodule
"""
    problems = {p.label: " ".join(p.problems) for p in prepare({"stuck.sv": dut}, {}).properties}
    assert "depends on signals and can exceed 32" in problems["a_spin"]
    assert "more than 256 iterations" in problems["a_ever"]
    assert "break, continue or return" in problems["a_brk"]
