"""
SVA front end (slang): every concurrent assertion is found, its clock,
disable condition, target scope and signals are resolved, and its property
becomes IR, or a precise per-assertion problem.  No tools besides pyslang.
"""

import pytest

from app.praman.services.sva.frontend import FrontendError, elaborate
from app.praman.services.sva.ir import (
    AssertionKind, PropImplication, PropNot, PropSeq, PropTemporal, RepeatKind,
    SeqBinary, SeqBool, SeqConcat, SeqMatchItems, SeqOp, SeqRepeat, TemporalOp,
)

DUT = """
module dut (input clk, input rst_n, input d, input e, input [15:0] din, output reg q,
            output reg [15:0] dout);
  reg [2:0] cnt;
  always @(posedge clk) begin
    if (!rst_n) begin q <= 0; dout <= 0; cnt <= 0; end
    else begin q <= d; dout <= din; cnt <= cnt + 1; end
  end
endmodule
"""


def records(*sources: str, top: str = ""):
    design = elaborate({f"f{i}.sv": src for i, src in enumerate(sources)}, top=top)
    return {r.label: r for r in design.records}


def test_bind_checker_with_macros_resolves_to_the_target():
    sva = """
module dut_sva ();
  `define CLK  dut.clk
  `define CHK(x) (x)
  property p_q; @(posedge `CLK) disable iff (!dut.rst_n) `CHK(dut.d) |=> dut.q; endproperty
  property p_data; @(posedge `CLK) disable iff (!dut.rst_n) dut.d |=> dut.dout == $past(dut.din); endproperty
  ap_q    : assert property (p_q);
  ap_data : assert property (p_data);
  cp_e    : assume property (@(posedge `CLK) dut.e == 0);
endmodule
bind dut dut_sva u_sva (.*);
"""
    recs = records(DUT, sva)
    assert set(recs) == {"ap_q", "ap_data", "cp_e"}
    ap = recs["ap_data"]
    assert ap.kind == AssertionKind.ASSERT and ap.supported
    assert ap.target == "dut"
    assert ap.clock is not None and ap.clock.edge == "posedge"
    assert ap.disable is not None
    assert {s.path: s.width for s in ap.signals.values()} == {
        "clk": 1, "rst_n": 1, "d": 1, "dout": 16, "din": 16}
    assert recs["cp_e"].kind == AssertionKind.ASSUME
    assert recs["cp_e"].disable is None


def test_default_clocking_and_default_disable_and_procedural_clock():
    src = """
module chk (input logic clk, input logic rst_n, input logic valid, input logic ready);
  default clocking cb @(posedge clk); endclocking
  default disable iff (!rst_n);
  a_default : assert property (valid && !ready |=> valid);
  always @(negedge clk) begin
    a_proc : assert property (valid |-> ##[1:3] ready);
  end
endmodule
"""
    recs = records(src)
    default_clock, proc_clock = recs["a_default"].clock, recs["a_proc"].clock
    assert default_clock is not None and default_clock.edge == "posedge"
    assert recs["a_default"].disable is not None
    assert proc_clock is not None and proc_clock.edge == "negedge"   # procedure clock wins
    assert recs["a_proc"].location.line == 7


def test_property_structure_for_standard_constructs():
    sva = """
module dut_sva ();
  `define CHK(x) (x)
  default clocking @(posedge dut.clk); endclocking
  a_and   : assert property ((dut.d and dut.e) |=> dut.q);
  a_seq   : assert property (dut.d ##1 dut.e |=> dut.q);
  a_rep   : assert property (dut.d [*2] |=> dut.q);
  a_not   : assert property (not (dut.d ##1 !dut.q));
  a_live  : assert property (dut.d |-> s_eventually dut.q);
  a_macro : assert property (`CHK(dut.d) |=> dut.q);
  c_seq   : cover property (dut.d ##[1:3] dut.e);
endmodule
bind dut dut_sva u_sva (.*);
"""
    recs = records(DUT, sva)
    assert all(r.supported for r in recs.values())

    def implication(label: str) -> PropImplication:
        prop = recs[label].prop
        assert isinstance(prop, PropImplication)
        return prop

    a_and = implication("a_and")
    assert not a_and.overlapped
    assert isinstance(a_and.ante, SeqBinary) and a_and.ante.op == SeqOp.AND

    a_seq = implication("a_seq").ante
    assert isinstance(a_seq, SeqConcat)
    assert [(d.min, d.max) for d, _ in a_seq.items] == [(0, 0), (1, 1)]

    a_rep = implication("a_rep").ante
    assert isinstance(a_rep, SeqRepeat) and a_rep.kind == RepeatKind.CONSECUTIVE
    assert (a_rep.min, a_rep.max) == (2, 2)

    assert isinstance(recs["a_not"].prop, PropNot)
    cons = implication("a_live").cons
    assert isinstance(cons, PropTemporal) and cons.op == TemporalOp.S_EVENTUALLY
    assert isinstance(implication("a_macro").ante, SeqBool)

    c_seq = recs["c_seq"].prop
    assert isinstance(c_seq, PropSeq) and isinstance(c_seq.seq, SeqConcat)
    assert [(d.min, d.max) for d, _ in c_seq.seq.items] == [(0, 0), (1, 3)]


def test_local_variables_and_match_items():
    sva = """
module dut_sva ();
  property p_cap;
    logic [15:0] v;
    @(posedge dut.clk) (dut.d, v = dut.din) ##1 dut.e |=> dut.dout == v;
  endproperty
  a_cap : assert property (p_cap);
endmodule
bind dut dut_sva u_sva (.*);
"""
    rec = records(DUT, sva)["a_cap"]
    assert rec.supported
    assert rec.local_vars == ("v",)
    assert isinstance(rec.prop, PropImplication) and isinstance(rec.prop.ante, SeqConcat)
    first = rec.prop.ante.items[0][1]
    assert isinstance(first, SeqMatchItems) and first.assignments[0].var == "v"
    assert "din" in rec.signals and "v" not in rec.signals


def test_assertions_written_inside_the_dut_module():
    src = DUT.replace("endmodule", """
  a_inline : assert property (@(posedge clk) disable iff (!rst_n) d |=> q);
endmodule""")
    rec = records(src)["a_inline"]
    assert rec.target == "dut" and rec.supported
    assert set(rec.signals) == {"clk", "rst_n", "d", "q"}


def test_unlabeled_assertions_get_stable_labels():
    src = DUT.replace("endmodule", """
  assert property (@(posedge clk) d |=> q);
  cover property (@(posedge clk) d);
endmodule""")
    labels = set(records(src))
    assert {"_auto_assert_line10", "_auto_cover_line11"} <= labels


def test_unsupported_constructs_are_reported_per_assertion():
    sva = """
module dut_sva ();
  logic local_flag;
  assign local_flag = dut.d;
  a_ok      : assert property (@(posedge dut.clk) dut.d |=> dut.q);
  a_clocks  : assert property (@(posedge dut.clk) dut.d |-> (dut.d and @(negedge dut.clk) dut.q));
  a_case    : assert property (@(posedge dut.clk) case (dut.d) 1'b1: dut.q; default: 1'b1; endcase);
  a_checker : assert property (@(posedge dut.clk) local_flag |=> dut.q);
endmodule
bind dut dut_sva u_sva (.*);
"""
    recs = records(DUT, sva)
    assert recs["a_ok"].supported
    reasons = {label: " ".join(p.reason for p in r.problems) for label, r in recs.items()}
    assert "clock switch is supported only" in reasons["a_clocks"]
    assert recs["a_case"].supported            # case properties are supported now
    assert recs["a_checker"].supported and "u_sva.local_flag" in recs["a_checker"].signals


def test_sub_instance_signals_are_read():
    src = DUT + """
module top (input clk, input rst_n, input d, input e, input [15:0] din);
  wire q; wire [15:0] dout;
  dut u_dut (.*);
  a_deep : assert property (@(posedge clk) d |=> u_dut.cnt != 3'd7);
endmodule
"""
    rec = records(src, top="top")["a_deep"]
    assert rec.supported and "u_dut.cnt" in rec.signals     # connected after flattening with read -sv


def test_assertions_in_unsupported_contexts_are_still_reported():
    src = DUT + """
checker c_check (logic clk, logic a, logic b);
  a_in_checker : assert property (@(posedge clk) a |=> b);
endchecker
module top2 (input clk, input d, input q);
  c_check u_c (clk, d, q);
endmodule
"""
    recs = records(src)
    rec = recs["a_in_checker"]
    assert not rec.supported
    assert "context that is not supported" in rec.problems[0].reason


def test_elaboration_errors_carry_the_source_line():
    with pytest.raises(FrontendError, match=r"f0\.sv:3"):
        records("module m (input clk);\n  wire a;\n  assign a = no_such_signal;\nendmodule\n")



def test_a_compilation_lives_as_long_as_anything_from_it():
    # pyslang wrappers do not keep their compilation alive; freeing it under a
    # live wrapper made nanobind abort the process later ("unexpected collision")
    import gc
    from app.praman.services.sva import frontend
    sva = """module dut_sva (); a_q : assert property (@(posedge dut.clk) dut.d |=> dut.q); endmodule
bind dut dut_sva u_sva ();
"""
    record = records(DUT, sva)["a_q"]
    first = record.owner.compilation
    records(DUT, sva)                      # another elaboration: the record still holds the first one
    assert any(c is first for c, _ in frontend._compilations)
    del record, first
    gc.collect()
    records(DUT, sva)
    assert len(frontend._compilations) == 1    # only the newest design's, whose records are gone too
