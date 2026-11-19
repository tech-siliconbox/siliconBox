"""Sorting analyzed files into design and SVA files (app/praman/sources.py)."""

from app.praman import sources
from tests.praman.session.designs import PAIR, PAIR_SVA


def test_a_file_with_a_bind_is_an_sva_file():
    design, sva = sources.classify([("pair.sv", PAIR), ("pair_sva.sv", PAIR_SVA)], "pair")
    assert [n for n, _ in design] == ["pair.sv"] and [n for n, _ in sva] == ["pair_sva.sv"]


def test_the_checker_module_is_sva_when_the_bind_is_in_another_file():
    checker = PAIR_SVA.split("bind")[0]
    bind = "bind pair pair_sva i_sva(.*);\n"
    design, sva = sources.classify([("pair.sv", PAIR), ("checker.sv", checker), ("bind.sv", bind)], "pair")
    assert [n for n, _ in sva] == ["checker.sv", "bind.sv"]


def test_an_unbound_assertion_module_is_sva_but_inline_assertions_stay_design():
    unbound = "module fifo_sva ();\n  a: assert property (@(posedge fifo.clk) fifo.full |-> !fifo.push);\nendmodule\n"
    inline = "module fifo(input clk, input push, output full);\n  a: assert property (@(posedge clk) 1);\nendmodule\n"
    design, sva = sources.classify([("fifo.sv", inline), ("fifo_sva.sv", unbound)], "fifo")
    assert [n for n, _ in design] == ["fifo.sv"] and [n for n, _ in sva] == ["fifo_sva.sv"]


def test_a_bind_in_a_comment_does_not_count():
    text = PAIR + "// bind pair pair_sva i (.*);\n"
    design, sva = sources.classify([("pair.sv", text)], "pair")
    assert [n for n, _ in design] == ["pair.sv"] and not sva


def test_top_candidates_are_modules_nothing_instantiates_or_binds():
    assert sources.top_candidates([("pair.sv", PAIR), ("pair_sva.sv", PAIR_SVA)]) == ["pair"]


def test_a_script_path_resolves_to_the_file_with_that_base_name():
    files = {"rtl/fifo.sv": "", "sva/fifo_sva.sv": "", "a/x.sv": "", "b/x.sv": ""}
    assert sources.resolve("rtl/fifo.sv", files) == "rtl/fifo.sv"
    assert sources.resolve("/home/user/units/fifo/source/sv/sva/fifo_sva.sv", files) == "sva/fifo_sva.sv"
    assert sources.resolve("./rtl/fifo.sv", files) == "rtl/fifo.sv"
    assert sources.resolve("x.sv", files) == ""            # two files of that name: not guessed
    assert sources.resolve("missing.sv", files) == ""


# ── The script written for uploaded files ─────────────────────

def test_a_script_is_written_for_design_and_sva_files():
    script, what = sources.default_script({"pair.sv": PAIR, "pair_sva.sv": PAIR_SVA, "notes.txt": "x"})
    assert what == "top pair, clock clk, reset !rst_n"
    assert script.splitlines()[2:] == [
        "clear -all", "", "analyze -sv pair.sv", "analyze -sv pair_sva.sv", "", "elaborate -top pair", "",
        "clock clk", "reset !rst_n", "", "prove -all"]


def test_a_combinational_design_gets_no_clock_and_no_reset():
    design = "module adder(a, b, s);\n  input [3:0] a;\n  input [3:0] b;\n  output [4:0] s;\n  assign s = a + b;\nendmodule\n"
    script, what = sources.default_script({"adder.sv": design})
    assert what == "top adder, clock none, reset none"
    assert "clock -none" in script and "reset -none" in script and "analyze -sv adder.sv" in script


def test_an_active_high_reset_and_other_clock_names_are_recognised():
    design = "module m(input logic sys_clk, input logic reset, input logic [7:0] d, output logic q);\nendmodule\n"
    assert sources.default_script({"m.sv": design})[1] == "top m, clock sys_clk, reset reset"


def test_no_script_without_source_files():
    assert sources.default_script({"readme.md": "x", "pm.tcl": "y"}) == ("", "")


def test_another_version_of_a_file_is_left_out_of_the_script():
    script, what = sources.default_script({"pair.sv": PAIR, "pair_v2.sv": PAIR.replace("+ 1", "+ 2"),
                                           "pair_sva.sv": PAIR_SVA})
    assert "analyze -sv pair.sv\n" in script and "pair_v2.sv is not analyzed: it defines cnt, pair again" in script
    assert what == "top pair, clock clk, reset !rst_n"


def test_the_clock_is_found_by_how_the_design_uses_it():
    apb = "module apb(input pclk, input presetn, input psel); always @(posedge pclk or negedge presetn) x <= psel; endmodule"
    script, what = sources.default_script({"apb.sv": apb})
    assert "clock pclk" in script and "reset !presetn" in script, "an AMBA clock is not combinational"
    assert sources._clock(["rst_n", "a"], ["always @(posedge rst_n) x <= a;"]) == "", "a reset is not the clock"
    assert sources._clock(["data", "sys_clock_i"], [""]) == "sys_clock_i", "by name when no always block shows it"
