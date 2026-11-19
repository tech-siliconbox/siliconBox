"""
Sequential equivalence of two versions of a design: same outputs for the
same inputs after reset, proven or refuted with the first difference.
"""


import pytest

import app.praman.services.equivalence_service as equivalence_service
import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.equivalence_service import run_equivalence
from tests.praman.conftest import requires_sby

ORIGINAL = """module add2 (input [3:0] a, output [3:0] y); assign y = a + 4'd2; endmodule
module dut (input clk, input rst_n, input [3:0] x, output reg [3:0] q);
  wire [3:0] t;
  add2 u (.a(x), .y(t));
  always @(posedge clk) if (!rst_n) q <= 0; else q <= t;
endmodule
"""
# restructured: same behaviour (the unused add2 is a second top-level module)
REFACTORED = """module add2 (input [3:0] a, output [3:0] y); assign y = a + 4'd1 + 4'd1; endmodule
module dut (input clk, input rst_n, input [3:0] x, output reg [3:0] q);
  reg [3:0] t;
  always @(*) t = x + 4'd2;
  always @(posedge clk) if (!rst_n) q <= 0; else q <= t;
endmodule
"""
# a corner case changed
BROKEN = REFACTORED.replace("q <= t;", "q <= t ^ {3'b0, x == 4'd9};")


@pytest.fixture
def work(tmp_path, monkeypatch):
    for module in (formal_service, sby_generator, equivalence_service):
        monkeypatch.setattr(module, "FORMAL_WORK_DIR", tmp_path)
    return tmp_path


def _check(revised: str, mode: str = "prove"):
    job = run_equivalence(formal_service.formal_service, {"dut.sv": ORIGINAL}, {"dut.sv": revised},
                          mode=mode, depth=10)
    assert job.status == "complete", job.error_message
    assert job.result is not None
    return job, job.result.assertion_results[0]


@requires_sby
def test_refactoring_is_proven_equivalent(work):
    _, entry = _check(REFACTORED)
    assert entry["verdict"] == "PROVEN" and entry["name"] == "equivalence"
    _, bounded = _check(REFACTORED, mode="bmc")
    assert bounded["verdict"] == "HOLDS_BOUNDED"


@requires_sby
def test_a_changed_corner_case_is_shown(work):
    job, entry = _check(BROKEN)
    assert entry["verdict"] == "FAIL" and entry["counterexample_vcd"]
    assert entry["differences"] == [{"output": "q", "original": "4'hb", "revised": "4'ha"}]
    assert "q: original 4'hb, revised 4'ha" in entry["verdict_detail"]
    assert job.result is not None and job.result.status == "FAIL"


def test_versions_without_a_common_output_cannot_be_compared(work):
    renamed = REFACTORED.replace("output reg [3:0] q", "output reg [3:0] r").replace("q <=", "r <=")
    job = run_equivalence(formal_service.formal_service, {"dut.sv": ORIGINAL}, {"dut.sv": renamed})
    assert job.status == "failed" and "no output in common" in job.error_message


def test_a_port_that_changed_width_is_named(work):
    wider = REFACTORED.replace("output reg [3:0] q", "output reg [4:0] q")
    job = run_equivalence(formal_service.formal_service, {"dut.sv": ORIGINAL}, {"dut.sv": wider})
    assert job.status == "failed"
    assert "q (original output 4 bits, revised output 5 bits)" in job.error_message


@requires_sby
def test_ports_are_matched_by_name(work):
    # the revised version adds a debug output and a test-mode input that does not affect q
    header = REFACTORED.replace("output reg [3:0] q);", "input tm, output reg [3:0] q, output dbg);")
    body, last = header.rsplit("endmodule", 1)
    extended = body + "  assign dbg = tm & q[0];\nendmodule" + last
    job, entry = _check(extended)
    assert entry["verdict"] == "PROVEN"
    assert "Outputs only in the revised design (not compared): dbg" in job.parse_summary
    assert "Inputs only in the revised design (left free, any value): tm" in job.parse_summary


UNRESET = """
module dut (input clk, input rst_n, input [3:0] x, output [3:0] q);
  reg [3:0] seen;                       // no reset: arbitrary until x == 15
  always @(posedge clk) if (x == 4'd15) seen <= x;
  assign q = seen;
endmodule
"""


@requires_sby
def test_registers_without_reset_are_named_when_versions_differ(work):
    job = run_equivalence(formal_service.formal_service, {"dut.sv": UNRESET}, {"dut.sv": UNRESET}, depth=6)
    assert job.status == "complete", job.error_message
    entry = job.result.assertion_results[0]
    # identical code, yet the power-up values of `seen` differ between the two copies
    assert entry["verdict"] == "FAIL"
    assert "Registers without reset (original, arbitrary at power-up): seen" in job.parse_summary
    assert any("Registers without a reset" in line and "seen" in line for line in entry["explanation"])
