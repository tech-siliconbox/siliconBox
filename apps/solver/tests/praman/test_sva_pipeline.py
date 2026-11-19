"""
Pipeline behaviours around the SVA compiler: standalone checkers (no
design), the SVA preview used by the editor, and the readability check.
"""

from pathlib import Path

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.sva.frontend import FrontendError
from app.praman.services.sva.pipeline import check_readable, prepare
from tests.praman.conftest import requires_sby, requires_yosys

CORPUS = Path(__file__).parent / "formal_corpus" / "sync_fifo"

CHECKER = """module my_checker (input logic clk, input logic rst_n, input logic valid, input logic ready);
    default clocking cb @(posedge clk); endclocking
    default disable iff (!rst_n);
    property p_handshake; valid && !ready |=> valid; endproperty
    assert_hs : assert property (p_handshake);
    cover_hs  : cover property (p_handshake);
endmodule
"""


@requires_sby
def test_standalone_checker_has_free_inputs(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=CHECKER, dut_code="", mode="prove", depth=10, project_name="standalone")
    assert job.status == "complete", job.error_message
    assert job.result is not None
    verdicts = {a["name"]: a["verdict"] for a in job.result.assertion_results}
    # valid/ready are unconstrained inputs, so the handshake can be violated
    assert verdicts == {"assert_hs": "FAIL", "cover_hs": "COVERED"}


def test_preview_with_design_compiles_every_assertion():
    svc = formal_service.FormalService()
    result = svc.lower_only((CORPUS / "fifo_sva.sv").read_text(), (CORPUS / "sync_fifo.sv").read_text())
    assert result["assertions"] == 16 and result["properties"] == 16
    assert "module __va_mon_fifo" in result["lowered_rtl"]


def test_preview_without_design_checks_syntax_and_explains():
    svc = formal_service.FormalService()
    result = svc.lower_only((CORPUS / "fifo_sva.sv").read_text(), "")
    assert result["assertions"] == 16
    assert "needs the design files" in result["parsed_summary"]
    assert "unknown module 'fifo'" in result["parsed_summary"]


def test_preview_reports_syntax_errors_with_their_line():
    svc = formal_service.FormalService()
    with pytest.raises(FrontendError, match=r"sva\.sv:2"):
        svc.lower_only("module m;\n  assert property (@(posedge clk) a |=> );\nendmodule\n", "")


@requires_yosys
def test_simulation_only_design_is_rejected_clearly():
    tb = """module tb (input clk, input a);
  reg r;
  initial begin forever begin #5 r = ~r; end end
  a_x : assert property (@(posedge clk) a |=> a);
endmodule
"""
    prepared = prepare({"tb.sv": tb}, {})
    with pytest.raises(FrontendError, match="cannot be read for formal checking"):
        check_readable(prepared)


@requires_yosys
def test_widened_operand_under_bitwise_not_is_readable():
    # Comparing with a 32-bit 0 widens the 8-bit operands to 32'(...) casts;
    # read -sv parses an unparenthesised `~32'(b)` as `(~32)'(b)` and fails
    design = """module d (input clk, input [7:0] a, input [7:0] b);
  c_x : cover property (@(posedge clk) (a & ~b) != 0);
endmodule
"""
    check_readable(prepare({"d.sv": design}, {}))


# ── Reset selection ──────────────────────────────────────────

def _dut(reset_port: str) -> str:
    return f"""module d (input clk, input {reset_port}, input en, input a, output reg q);
  always @(posedge clk) if (!{reset_port}) q <= 0; else if (en) q <= q;
endmodule
"""


def test_reset_from_the_svas_disable_iff():
    sva = """module d_sva ();
  a_zero : assert property (@(posedge d.clk) disable iff (!d.por_b) d.q == 1'b0);
endmodule
bind d d_sva u (.*);
"""
    prepared = prepare({"d.sv": _dut("por_b")}, {"sva.sv": sva})
    assert prepared.reset == ("por_b", True) and prepared.reset_source == "sva"
    assert "Reset: por_b (active low, from the SVA's disable iff)" in prepared.summary


def test_default_disable_iff_names_the_reset_too():
    sva = """module d_sva ();
  default clocking @(posedge d.clk); endclocking
  default disable iff (d.por_b == 1'b0);
  a_zero : assert property (d.q == 1'b0);
endmodule
bind d d_sva u (.*);
"""
    prepared = prepare({"d.sv": _dut("por_b")}, {"sva.sv": sva})
    assert prepared.reset == ("por_b", True) and prepared.reset_source == "sva"
    high = prepare({"d.sv": _dut("por_b")}, {"sva.sv": sva.replace("== 1'b0", "!= 1'b0")})
    assert high.reset == ("por_b", False)


def test_reset_guessed_from_the_port_name():
    sva = """module d_sva ();
  a_zero : assert property (@(posedge d.clk) d.q == 1'b0);
endmodule
bind d d_sva u (.*);
"""
    prepared = prepare({"d.sv": _dut("i_rst_n")}, {"sva.sv": sva})
    assert prepared.reset == ("i_rst_n", True) and prepared.reset_source == "name"


def test_amba_reset_names_are_guessed():
    sva = """module d_sva ();
  a_zero : assert property (@(posedge d.clk) d.q == 1'b0);
endmodule
bind d d_sva u (.*);
"""
    for name in ("presetn", "hresetn", "aresetn"):
        prepared = prepare({"d.sv": _dut(name)}, {"sva.sv": sva})
        assert prepared.reset == (name, True) and prepared.reset_source == "name"


def test_reset_from_a_bound_checker_ports_disable_iff():
    # the checker's own port `r` is connected to the DUT input por_b
    sva = """module d_sva (input logic clk, input logic r, input logic q);
  default clocking @(posedge clk); endclocking
  default disable iff (!r);
  a_zero : assert property (q == 1'b0);
endmodule
bind d d_sva u (.clk(clk), .r(por_b), .q(q));
"""
    prepared = prepare({"d.sv": _dut("por_b")}, {"sva.sv": sva})
    assert prepared.reset == ("por_b", True) and prepared.reset_source == "sva"


def test_user_reset_setting_wins_and_is_validated():
    sva = "module d_sva (); endmodule\n"
    prepared = prepare({"d.sv": _dut("por_b")}, {"sva.sv": sva},
                       reset_signal="por_b", reset_polarity="high")
    assert prepared.reset == ("por_b", False) and prepared.reset_source == "user"
    with pytest.raises(FrontendError, match="'nope' is not an input of top module 'd'.*por_b"):
        prepare({"d.sv": _dut("por_b")}, {"sva.sv": sva}, reset_signal="nope")
    none = prepare({"d.sv": _dut("rst_n")}, {"sva.sv": sva}, reset_polarity="none")
    assert none.reset is None and none.reset_source == "none"


@requires_sby
def test_wrong_reset_polarity_changes_the_verdict(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    sva = """module d_sva ();
  a_zero : assert property (@(posedge d.clk) disable iff (!d.por_b) d.q == 1'b0);
endmodule
bind d d_sva u (.*);
"""
    svc = formal_service.FormalService()

    def verdict(**reset):
        job = svc.run_formal(sva_code=sva, dut_code=_dut("por_b"), dut_filename="d.sv",
                             mode="prove", depth=8, project_name="reset", **reset)
        assert job.status == "complete", job.error_message
        assert job.result is not None
        return job.result.assertion_results[0]["verdict"], job.result.harness

    v, harness = verdict()
    assert v == "PROVEN" and harness == {"signal": "por_b", "active_low": True, "source": "sva",
                                         "clocks": ["clk"], "multiclock": False}
    v, harness = verdict(reset_signal="por_b", reset_polarity="high")   # wrong polarity: never reset
    assert v == "FAIL" and harness["source"] == "user"
