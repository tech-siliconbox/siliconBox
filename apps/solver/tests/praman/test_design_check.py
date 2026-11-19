"""
Pre-run check (services/design_check.check_design): the compile stage of a
run without the solvers.  Problems are reported per stage, at the uploaded
file and line, with a hint where one applies.
"""

import pytest

from app.praman.services.design_check import check_design
from app.praman.services.formal_service import SVA_FILENAME
from app.praman.services.sby_generator import sanitize_filename
from app.praman.services.uploads import join_sources
from tests.praman.conftest import requires_yosys

COUNTER = """module counter (input clk, input rst_n, input en, output reg [3:0] q);
  always @(posedge clk)
    if (!rst_n) q <= 0;
    else if (en) q <= q + 1;
endmodule
"""
TOP = """module top (input clk, input rst_n, input en, output [3:0] q);
  counter u (.clk(clk), .rst_n(rst_n), .en(en), .q(q));
endmodule
"""
SVA = """module counter_sva ();
  a_step : assert property (@(posedge counter.clk) disable iff (!counter.rst_n)
                            counter.en |=> counter.q == $past(counter.q) + 4'd1);
  c_max  : cover property (@(posedge counter.clk) counter.q == 4'd15);
endmodule
bind counter counter_sva u_sva ();
"""


@pytest.fixture(scope="module")
def client():
    return None


def check(client, design, sva=(), **options):
    design = [(n, t) for n, t in design if t.strip()]
    sva = [(n, t) for n, t in sva if t.strip()]
    if not design and not sva:
        return {"error": "No file content provided."}
    joined_design = join_sources(design, sanitize_filename(design[0][0]) if design else "dut.sv")
    joined_sva = join_sources(list(sva), SVA_FILENAME)
    top = options.pop("top_module", "")
    return check_design(joined_design, joined_sva, top=top, **options)


@requires_yosys
def test_a_good_design_passes_every_stage(client):
    result = check(client, [("counter.sv", COUNTER), ("top.sv", TOP)], [("counter_sva.sv", SVA)])
    assert result["ok"] and result["issues"] == []
    assert result["stages"] == {"elaborate": "pass", "properties": "pass", "read": "pass"}
    assert result["design"]["top"] == "top"
    assert result["design"]["signal"] == "rst_n" and result["design"]["clocks"] == ["clk"]
    assert {(p["label"], p["kind"]) for p in result["properties"]} == {("a_step", "assert"), ("c_max", "cover")}


def test_errors_point_at_the_uploaded_file_and_line(client):
    broken = "\n\n" + TOP.replace("counter u (", "counter u (\n").replace(".q(q));", ".q(q))")
    result = check(client, [("counter.sv", COUNTER), ("top.sv", broken)])
    assert not result["ok"] and result["stages"]["elaborate"] == "fail"
    issue = result["issues"][0]
    # top.sv starts with two blank lines; the missing ';' is after line 4 of the file
    assert (issue["file"], issue["severity"]) == ("top.sv", "error")
    assert issue["line"] == 5 and "expected ';'" in issue["message"]
    assert issue["snippet"]


def test_unknown_bind_target_comes_with_a_hint(client):
    result = check(client, [("counter.sv", COUNTER)], [("counter_sva.sv", SVA.replace("bind counter", "bind countr"))])
    issue = result["issues"][0]
    assert (issue["file"], issue["line"]) == ("counter_sva.sv", 6)
    assert "No module named 'countr' was uploaded" in issue["hint"]


@requires_yosys
def test_testbench_code_fails_the_read_stage(client):
    tb = COUNTER.replace("endmodule", "  initial forever #5 q = ~q;\nendmodule")
    result = check(client, [("counter.sv", tb)])
    assert result["stages"] == {"elaborate": "pass", "properties": "pass", "read": "fail"}
    issue = result["issues"][0]
    assert (issue["file"], issue["line"]) == ("counter.sv", 5)
    assert "Testbench-only code" in issue["hint"] and not issue["generated"]
    assert "forever" in issue["snippet"]


@requires_yosys
def test_properties_that_cannot_be_checked_are_warnings(client):
    # a clock switch under 'and' is not supported yet
    sva = SVA.replace("endmodule", "  a_two : assert property (@(posedge counter.clk) counter.en |-> "
                                   "(counter.en and @(negedge counter.clk) counter.q != 0));\nendmodule")
    result = check(client, [("counter.sv", COUNTER)], [("counter_sva.sv", sva)])
    assert result["ok"] and result["stages"]["properties"] == "warn"
    [warning] = result["issues"]
    assert (warning["severity"], warning["file"], warning["line"]) == ("warning", "counter_sva.sv", 5)
    assert warning["message"].startswith("a_two is not checkable:")
    assert "(counter_sva.sv:5)" in warning["message"]   # references use the uploaded file


def test_empty_upload_is_rejected(client):
    assert "error" in check(client, [("blank.sv", "  \n")])


def test_join_maps_lines_back_to_each_file():
    joined = join_sources([("a.sv", "\n\nline1\nline2\n"), ("b.sv", "x\ny")], "a.sv")
    assert joined.text == "line1\nline2\n\nx\ny"
    assert joined.locate(1) == ("a.sv", 3) and joined.locate(2) == ("a.sv", 4)
    assert joined.locate(4) == ("b.sv", 1) and joined.locate(5) == ("b.sv", 2)
