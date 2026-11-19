"""
Assertion strength by mutation analysis: mutants of the design that the
passing assertions catch, and those they miss (unchecked logic).
"""

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
import app.praman.services.strength_service as strength_service
from app.praman.services.strength_service import run_strength
from tests.praman.conftest import requires_sby
from tests.praman.test_auto_checks import DUT

# Checks the state machine only; the memory and q are not checked
SVA = """module fsm_sva ();
  default clocking @(posedge fsm.clk); endclocking
  default disable iff (!fsm.rst_n);
  a_run  : assert property (fsm.st == 2'd1 |=> fsm.st == 2'd2);
  a_done : assert property (fsm.st == 2'd2 |=> fsm.st == 2'd0);
  a_go   : assert property (fsm.st == 2'd0 && fsm.go |=> fsm.st == 2'd1);
  a_bad  : assert property (fsm.st != 2'd1);
endmodule
bind fsm fsm_sva u ();
"""


@requires_sby
def test_mutants_of_checked_logic_are_detected(tmp_path, monkeypatch):
    for module in (formal_service, sby_generator, strength_service):
        monkeypatch.setattr(module, "FORMAL_WORK_DIR", tmp_path)
    service = formal_service.FormalService()
    job = service.run_formal(sva_code=SVA, dut_code=DUT, dut_filename="fsm.sv", mode="prove", depth=10,
                             project_name="strength")
    assert job.status == "complete", job.error_message

    report = run_strength(job, service, count=16, workers=4).to_dict()
    assert report["status"] == "complete", report["message"]
    # a_bad fails on the original design, so it does not count
    assert set(report["per_assertion"]) == {"a_run", "a_done", "a_go"}
    assert report["checked"] + report["equivalent"] == report["total"] > 0
    states = [m for m in report["mutants"] if m["location"] in ("fsm.sv:8", "fsm.sv:9", "fsm.sv:10")]
    memory = [m for m in report["mutants"] if m["location"] in ("fsm.sv:13", "fsm.sv:14", "fsm.sv:4")]
    assert any(m["status"] == "detected" for m in states)
    assert memory and all(m["status"] == "survived" for m in memory)
    assert 0 < report["score"] < 100
    assert not list(tmp_path.glob("*__strength"))     # work folders removed



TWO_OUTPUTS = """module two (input logic clk, input logic rst_n, input logic x, input logic y,
            output logic a, output logic b);
  always_ff @(posedge clk) begin
    if (!rst_n) begin a <= 1'b0; b <= 1'b0; end
    else begin a <= x; b <= !y; end
  end
endmodule
"""
TWO_SVA = """module two_props (input logic clk, input logic rst_n, input logic x, input logic y, input logic a, input logic b);
  default clocking @(posedge clk); endclocking
  default disable iff (!rst_n);
  ap_a: assert property (1'b1 |=> a == $past(x));
  ap_b: assert property (1'b1 |=> b == !$past(y));
endmodule
bind two two_props u (.*);
"""


@requires_sby
def test_a_mutant_is_invisible_to_a_requirement_that_reads_none_of_what_it_changes(tmp_path):
    # a's logic and b's are apart: a mutant of a's counts for a requirement that reads a, not for one
    # that reads only b (a module used twice: its other instance's mutants are not this requirement's)
    from app.praman.services.compile_worker import run_isolated
    from app.praman.services.formal_service import FormalService, compile_design
    from app.praman.services.strength_service import _equivalent, _list_mutations
    from app.praman.services.yosys_reader import MONITOR_FILE
    prepared = run_isolated(compile_design, TWO_SVA, TWO_OUTPUTS, "two.sv", "two", reset_signal="rst_n",
                            reset_polarity="low", clock_signal="clk")
    monitor = FormalService()._isolate(prepared.monitor_text, set())
    files = {**prepared.sources(0), MONITOR_FILE: monitor}
    mutations, _ = _list_mutations(prepared, monitor, 200, design_files={"two.sv"})
    of_a = next(m for m in mutations if "-wire a " in m and not _equivalent(prepared, files, m, 8, tmp_path / "x", 120))
    assert not _equivalent(prepared, files, of_a, 8, tmp_path / "a", 120, observe=["a"])
    assert _equivalent(prepared, files, of_a, 8, tmp_path / "b", 120, observe=["b"])



@requires_sby
def test_mutants_past_the_budget_are_not_run_and_count_neither_way(tmp_path, monkeypatch):
    """A zero budget: every mutant is "not_run", and the score has nothing to count."""
    for module in (formal_service, sby_generator, strength_service):
        monkeypatch.setattr(module, "FORMAL_WORK_DIR", tmp_path)
    service = formal_service.FormalService()
    job = service.run_formal(sva_code=SVA, dut_code=DUT, dut_filename="fsm.sv", mode="prove", depth=10,
                             project_name="strength")
    report = run_strength(job, service, count=4, workers=1, budget=0).to_dict()
    assert report["status"] == "complete", report["message"]
    assert {m["status"] for m in report["mutants"]} == {"not_run"}
    assert report["checked"] == 0 and report["score"] is None


@requires_sby
def test_the_time_a_mutant_gets_is_sized_to_the_design_and_the_undecided_get_more(tmp_path, monkeypatch):
    """The unchanged design is timed first; every mutant gets a limit sized to it
    (at least 30 s), only the undecided ones get the longest limit again, and one
    undecided even then is 'timeout': not measured, out of the score."""
    from pathlib import Path
    from app.praman.services.sby_generator import SbyResult
    for module in (formal_service, sby_generator, strength_service):
        monkeypatch.setattr(module, "FORMAL_WORK_DIR", tmp_path)
    service = formal_service.FormalService()
    job = service.run_formal(sva_code=SVA, dut_code=DUT, dut_filename="fsm.sv", mode="prove", depth=10,
                             project_name="strength")
    real, calls = service._run_sby, []

    def run_sby(sby_file, work_dir, timeout=300):
        name = Path(sby_file).parent.name
        calls.append((name, timeout))
        if name == "m001" or (name == "m000" and timeout < 600):
            return SbyResult(status="TIMEOUT", error_message="simulated")
        return real(sby_file, work_dir, timeout)
    service._run_sby = run_sby
    report = run_strength(job, service, count=6, workers=1, timeout=600).to_dict()
    assert report["status"] == "complete", report["message"]
    first, longest = report["limits"]
    assert calls[0] == ("calibration", 600) and report["calibration_seconds"] is not None
    assert 30 <= first < longest == 600, "a small design: a short first pass"
    assert [t for n, t in calls if n == "m000"] == [first, 600], "undecided at first: again with the longest limit"
    assert [t for n, t in calls if n == "m002"] == [first], "decided at once: run once"
    by_index = {m["index"]: m for m in report["mutants"]}
    assert by_index[0]["status"] in ("detected", "survived", "equivalent")
    assert by_index[1]["status"] == "timeout" and by_index[1]["message"] == "not decided in 600 s"
    assert report["timed_out"] == 1 and report["checked"] + report["equivalent"] == report["total"] - 1


