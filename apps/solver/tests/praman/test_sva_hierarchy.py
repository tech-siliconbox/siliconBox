"""
Signals below the checked module: helper logic written in a bound checker
module, and signals of sub-instances.  yosys-slang reads the hierarchical
references; with read -sv the checker is instantiated by hand (its references
to the module become ports) and signals below the module are connected once
the design is flattened.
"""

import pytest

import app.praman.services.compile_worker as compile_worker
import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.sva.pipeline import prepare
from app.praman.services.yosys_reader import SLANG, VERILOG
from tests.praman.conftest import requires_sby, requires_yosys_slang

DUT = """module stage (input clk, input rst_n, input d, output reg q);
  always @(posedge clk) if (!rst_n) q <= 0; else q <= d;
endmodule
module pipe (input clk, input rst_n, input in, output out);
  wire mid;
  stage s0 (.clk(clk), .rst_n(rst_n), .d(in),  .q(mid));
  stage s1 (.clk(clk), .rst_n(rst_n), .d(mid), .q(out));
endmodule
"""

# Checker with helper logic (a model of the pipeline) and a probe into a
# sub-instance.  `bad_model` deliberately models one stage too few.
SVA = """module pipe_sva ();
  reg model1, model2, bad_model;
  always @(posedge pipe.clk)
    if (!pipe.rst_n) begin model1 <= 0; model2 <= 0; bad_model <= 0; end
    else begin model1 <= pipe.in; model2 <= model1; bad_model <= pipe.in; end

  a_model   : assert property (@(posedge pipe.clk) disable iff (!pipe.rst_n) pipe.out == model2);
  a_bad     : assert property (@(posedge pipe.clk) disable iff (!pipe.rst_n) pipe.out == bad_model);
  a_mid     : assert property (@(posedge pipe.clk) disable iff (!pipe.rst_n) pipe.s0.q == model1);
  c_through : cover property (@(posedge pipe.clk) disable iff (!pipe.rst_n) pipe.s1.q && model2);
endmodule
bind pipe pipe_sva u_sva ();
"""


def test_without_hierarchy_the_checker_is_instantiated_and_connected_after_flattening():
    prepared = prepare({"pipe.sv": DUT}, {"sva.sv": SVA}, reader=VERILOG)
    assert all(p.supported for p in prepared.properties), [p.problems for p in prepared.properties]
    sources = prepared.sources()
    assert "bind pipe" not in sources["sva.sv"] and "assert property" not in sources["sva.sv"]
    assert "module pipe_sva (input wire __va_up_clk," in sources["sva.sv"]
    assert "model1 <= __va_up_in;" in sources["sva.sv"]
    assert "pipe_sva u_sva (.__va_up_clk(clk)," in sources["pipe.sv"]
    assert prepared.script[:3] == ["hierarchy -top pipe", "proc", "flatten"]
    assert "connect -nounset -set __va_mon.u_sva__model2 u_sva.model2" in prepared.script
    assert "connect -nounset -set u_sva.__va_up_s0__q s0.q" in prepared.script


def test_a_checker_that_cannot_be_instantiated_is_reported():
    sva = SVA.replace("module pipe_sva ();", "module pipe_sva (go);\n  input go;").replace(
        "bind pipe pipe_sva u_sva ();", "bind pipe pipe_sva u_sva (.go(in));")
    problems = {p.label: p.problems for p in prepare({"pipe.sv": DUT}, {"sva.sv": sva}, reader=VERILOG).properties}
    assert "ports are not declared in the module header" in problems["a_model"][0]
    assert "yosys-slang" in problems["a_model"][0]


def test_with_hierarchy_monitors_connect_below_the_target():
    prepared = prepare({"pipe.sv": DUT}, {"sva.sv": SVA}, reader=SLANG)
    assert all(p.supported for p in prepared.properties), [p.problems for p in prepared.properties]
    sources = prepared.sources()
    assert "bind pipe pipe_sva" in sources["sva.sv"]           # checker kept: its helper logic runs
    assert "assert property" not in sources["sva.sv"]
    assert ".u_sva__model2(u_sva.model2)" in sources["pipe.sv"]
    assert ".s0__q(s0.q)" in sources["pipe.sv"]


@requires_sby
@pytest.mark.parametrize("reader", [pytest.param(SLANG, marks=requires_yosys_slang), VERILOG])
def test_checker_helper_logic_and_sub_instances_are_checked(tmp_path, monkeypatch, reader):
    monkeypatch.setenv("FORMAL_YOSYS_READER", reader)
    monkeypatch.setattr(compile_worker, "IN_PROCESS", True)     # workers would not see the variable
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=SVA, dut_code=DUT, dut_filename="pipe.sv", mode="prove", depth=12,
        project_name="hier")
    assert job.status == "complete", job.error_message
    assert job.result is not None
    verdicts = {a["name"]: a["verdict"] for a in job.result.assertion_results}
    assert verdicts == {"a_model": "PROVEN", "a_bad": "FAIL", "a_mid": "PROVEN", "c_through": "COVERED"}
    assert ("yosys-slang" if reader == SLANG else "read -sv") in job.parse_summary


@requires_yosys_slang
def test_unreadable_for_slang_falls_back_to_read_sv(monkeypatch):
    from app.praman.services.sva import pipeline
    from app.praman.services.sva.frontend import FrontendError

    real = pipeline.check_readable

    def slang_fails(prepared, timeout=120):
        if prepared.reader == SLANG:
            raise FrontendError("simulated yosys-slang failure")
        return real(prepared, timeout)
    monkeypatch.setattr(pipeline, "check_readable", slang_fails)
    prepared = pipeline.prepare_checked({"pipe.sv": DUT}, {"sva.sv": SVA})
    assert prepared.reader == VERILOG
    assert "simulated yosys-slang failure" in prepared.summary
    # read -sv reaches the checker and the sub-instances too (after flattening)
    assert all(p.supported for p in prepared.properties) and prepared.script
