"""Scans (FormalService.scans): full proofs are tried with rising time
limits, all undecided properties with the shortest first, so that a property
that needs long does not hold up the ones that do not.  Without scans the
single fixed limit is used, as before."""

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.sby_generator import SbyResult
from tests.praman.conftest import requires_sby

DUT = """module d(input clk, input rst_n, input en, output reg [3:0] q);
  always @(posedge clk) if (!rst_n) q <= 0; else if (en && q < 4'd9) q <= q + 1;
endmodule
"""
SVA = """module d_sva(input clk, input rst_n, input en, input [3:0] q);
  ap_quick: assert property (@(posedge clk) disable iff (!rst_n) q <= 4'd9);
  ap_slow: assert property (@(posedge clk) disable iff (!rst_n) q != 4'd12);
  cp_never: cover property (@(posedge clk) disable iff (!rst_n) q == 4'd11);
endmodule
bind d d_sva u(.*);
"""


@pytest.fixture
def service(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    svc = formal_service.FormalService()
    svc.build_seconds = 0.0         # no allowance for building the model: the limits are exact
    svc.limits = []                 # (run name, time limit) of every proof run
    real = svc._run_sby

    def run_sby(sby_file, work_dir, timeout=300):
        """The proofs of ap_slow and cp_never 'need' 50 s: with a shorter limit they time out at once."""
        name = sby_file.rsplit("/", 1)[-1]
        if name.endswith("_prove.sby") or "__prove" in name:
            svc.limits.append((name, timeout))
            slow = "ap_slow" in name or "cp_never" in name or "__prove0" in name
            if slow and timeout < 50:
                return SbyResult(status="TIMEOUT", return_code=-1, error_message="simulated: needs more time")
        return real(sby_file, work_dir, timeout)
    monkeypatch.setattr(svc, "_run_sby", run_sby)
    return svc


def prove(service, name):
    job = service.run_formal(sva_code=SVA, dut_code=DUT, dut_filename="d.sv", dut_top="d", mode="prove",
                             depth=12, project_name=name)
    assert job.status == "complete", job.error_message
    return {e["name"]: e for e in job.result.assertion_results}


@requires_sby
def test_undecided_properties_are_tried_again_with_the_next_limit(service):
    service.scans = [5, 20, 100]
    decided, progress = [], []
    service.on_property = lambda entry: decided.append((entry["name"], entry["verdict"]))
    service.on_progress = lambda label, expired, then: progress.append((label, expired, then))
    entries = prove(service, "scans")

    assert {name: e["verdict"] for name, e in entries.items()} == {
        "ap_quick": "PROVEN", "ap_slow": "PROVEN", "cp_never": "UNREACHABLE"}
    # the quick property is decided in the first scan, before the slow ones get their long limit
    assert decided[0] == ("ap_quick", "PROVEN")
    assert sorted(decided) == [("ap_quick", "PROVEN"), ("ap_slow", "PROVEN"), ("cp_never", "UNREACHABLE")]
    assert sorted(progress) == [("ap_slow", 5, 20), ("ap_slow", 20, 100), ("cp_never", 5, 20), ("cp_never", 20, 100)]
    own = [limit for name, limit in service.limits if "ap_slow" in name]
    assert own == [5, 20, 100], "its proof ran once per scan, with rising limits"
    assert [limit for name, limit in service.limits if "ap_quick" in name] == [5], "decided: not tried again"
    assert [limit for name, limit in service.limits if "__prove0" in name] == [5], "the batched proof uses the first"


@requires_sby
def test_the_last_scan_settles_what_is_still_undecided(service):
    service.scans = [5, 20]                    # never reaches the 50 s the slow ones need
    decided = []
    service.on_property = lambda entry: decided.append((entry["name"], entry["verdict"]))
    entries = prove(service, "scans_short")
    assert entries["ap_quick"]["verdict"] == "PROVEN"
    assert entries["ap_slow"]["verdict"] == "HOLDS_BOUNDED" and entries["cp_never"]["verdict"] == "NOT_REACHED"
    assert sorted(decided) == [("ap_quick", "PROVEN"), ("ap_slow", "HOLDS_BOUNDED"), ("cp_never", "NOT_REACHED")]


@requires_sby
def test_without_scans_the_fixed_limit_is_used_once(service):
    entries = prove(service, "no_scans")
    assert {limit for _, limit in service.limits} == {formal_service.PROOF_TIMEOUT_SECONDS}
    assert len([1 for name, _ in service.limits if "ap_slow" in name or "__prove0" in name]) == 1, \
        "one proof of ap_slow (here in the batched run), not one per scan"
    assert {name: e["verdict"] for name, e in entries.items()} == {
        "ap_quick": "PROVEN", "ap_slow": "PROVEN", "cp_never": "UNREACHABLE"}


@requires_sby
def test_a_proof_can_decide_what_the_bounded_check_did_not_finish(tmp_path, monkeypatch):
    """In a scan the proof engines run even when the bounded check ran out of
    time: a proof needs no bounded check."""
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    svc = formal_service.FormalService()
    real = svc._run_sby

    def run_sby(sby_file, work_dir, timeout=300):
        name = sby_file.rsplit("/", 1)[-1]
        if "__bmc" in name or name.endswith("ap_slow.sby") or name.endswith("ap_quick.sby"):
            return SbyResult(status="TIMEOUT", return_code=-1, error_message="simulated: bounded check too slow")
        return real(sby_file, work_dir, timeout)
    monkeypatch.setattr(svc, "_run_sby", run_sby)

    svc.scans = [5, 20]
    svc.build_seconds = 0.0
    entries = prove(svc, "bounded_open")
    assert entries["ap_quick"]["verdict"] == "PROVEN" and entries["ap_slow"]["verdict"] == "PROVEN"
    assert entries["ap_quick"]["status"] == "PASS" and not entries["ap_quick"]["message"]

    # without scans a bounded check that times out stays a timeout, as before
    svc.scans = None
    entries = prove(svc, "bounded_closed")
    assert entries["ap_quick"]["verdict"] == "TIMEOUT"


@requires_sby
def test_every_run_gets_the_model_build_time_on_top_of_its_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    svc = formal_service.FormalService()
    real, limits = svc._run_sby, []

    def run_sby(sby_file, work_dir, timeout=300):
        limits.append(timeout)
        return real(sby_file, work_dir, timeout)
    monkeypatch.setattr(svc, "_run_sby", run_sby)
    svc.scans = [5]
    svc.build_seconds = 3.2             # a design that takes this long to read
    prove(svc, "allowance")
    assert set(limits) == {5 + 7}, "limit + twice the build time, rounded up"

    measured = formal_service.FormalService()
    measured.scans = [5]
    prove(measured, "measured")
    assert measured.build_seconds is not None and measured.build_seconds > 0, "taken from the compile stage"


@requires_sby
def test_in_a_scan_the_proof_engines_go_first_when_the_batched_check_did_not_decide(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    svc = formal_service.FormalService()
    real, runs = svc._run_sby, []

    def run_sby(sby_file, work_dir, timeout=300):
        name = sby_file.rsplit("/", 1)[-1]
        runs.append(name.split("__", 1)[-1])
        if "__bmc" in name or "__prove0" in name:           # the batched runs do not finish
            return SbyResult(status="TIMEOUT", return_code=-1, error_message="simulated")
        return real(sby_file, work_dir, timeout)
    monkeypatch.setattr(svc, "_run_sby", run_sby)
    svc.scans = [20, 120]           # SiliconBox: room for slower CI runners (formal-verify: [5, 20])
    svc.build_seconds = 0.0
    sva = SVA.replace("q != 4'd12", "q != 4'd3")           # ap_slow now fails (q reaches 3)
    job = svc.run_formal(sva_code=sva, dut_code=DUT, dut_filename="d.sv", dut_top="d", mode="prove", depth=12,
                         project_name="proof_first")
    entries = {e["name"]: e for e in job.result.assertion_results}
    assert entries["ap_quick"]["verdict"] == "PROVEN" and entries["ap_slow"]["verdict"] == "FAIL"
    assert entries["ap_slow"]["counterexample_vcd"], "the proof engines give the trace"
    own = [r for r in runs if "ap_quick" in r or "ap_slow" in r]
    assert set(own) == {"01_ap_quick_prove.sby", "02_ap_slow_prove.sby"}, "proof runs only: no bounded run of their own"
    assert own.count("01_ap_quick_prove.sby") == 1, "inductive: proven by the quick induction"
    assert own.count("02_ap_slow_prove.sby") == 2, "not inductive in two cycles: the whole depth found the counterexample"
    assert entries["ap_quick"]["engine"] == "k-induction"


@requires_sby
def test_undecided_by_the_batch_a_scan_is_quick_induction_then_the_other_engines(tmp_path, monkeypatch):
    """Per scan: k-induction over a few cycles by the SMT solvers; if they run
    out of time PDR alone gets the limit; the next scan repeats with more time."""
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    svc = formal_service.FormalService()
    real, runs = svc._run_sby, []

    def run_sby(sby_file, work_dir, timeout=300):
        name = sby_file.rsplit("/", 1)[-1]
        text = open(sby_file).read()
        engines = text.split("[engines]")[1].split("[script]")[0].split()
        depth = int(text.split("depth ")[1].split()[0])
        if "__bmc" in name or "__prove0" in name:
            return SbyResult(status="TIMEOUT", return_code=-1, error_message="simulated")
        if "ap_slow" in name:
            runs.append((timeout, depth, "pdr" in engines, "yices" in engines))
            if timeout < 50:
                return SbyResult(status="TIMEOUT", return_code=-1, error_message="simulated")
        return real(sby_file, work_dir, timeout)
    monkeypatch.setattr(svc, "_run_sby", run_sby)
    svc.scans = [5, 20, 100]
    svc.build_seconds = 0.0
    entries = prove(svc, "two_stage")
    assert entries["ap_slow"]["verdict"] == "PROVEN" and entries["ap_slow"]["engine"] == "k-induction"
    assert runs == [
        (5, 2, False, True), (5, 12, True, False),          # scan 1: induction over 2 cycles, then PDR alone
        (20, 2, False, True), (20, 12, True, False),        # scan 2: the same with more time
        (100, 2, False, True),                              # scan 3: the induction decides
    ]
