"""
Disk hygiene: after a job only logs and the traces shown in the UI remain,
and old job folders are deleted.
"""

import os
import time

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.services.formal_service import prune_old_jobs, prune_run_artifacts
from tests.praman.conftest import requires_sby


def _touch(path, size=10):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x" * size)
    return path


def test_prune_keeps_logs_and_shown_traces_only(tmp_path):
    task = tmp_path / "job" / "assertions" / "run1" / "run1_bmc"
    shown = _touch(task / "engine_0" / "trace0.vcd")
    hidden = _touch(task / "engine_0" / "trace1.vcd")
    log = _touch(task / "logfile.txt")
    status = _touch(task / "status")
    model = _touch(task / "model" / "design_smt2.smt2", 1000)
    src = _touch(tmp_path / "job" / "assertions" / "run1" / "src" / "dut.sv", 500)
    witness = _touch(task / "engine_0" / "trace0.yw")

    freed = prune_run_artifacts(tmp_path / "job", {str(shown)})

    assert shown.exists() and log.exists() and status.exists()
    assert not hidden.exists() and not witness.exists()
    assert not model.exists() and not src.exists()
    assert freed >= 1500


def test_old_job_folders_are_deleted(tmp_path):
    old = tmp_path / "old_job"
    new = tmp_path / "new_job"
    _touch(old / "logfile.txt")
    _touch(new / "logfile.txt")
    ten_days_ago = time.time() - 10 * 86400
    os.utime(old, (ten_days_ago, ten_days_ago))

    prune_old_jobs(tmp_path, days=7)

    assert not old.exists() and new.exists()


DUT = """module d (input clk, input rst_n, input a, output reg q);
  always @(posedge clk) if (!rst_n) q <= 0; else q <= a;
endmodule
"""
SVA = """module d_sva ();
  a_ok   : assert property (@(posedge d.clk) disable iff (!d.rst_n) d.a |=> d.q);
  a_bad  : assert property (@(posedge d.clk) disable iff (!d.rst_n) d.q |=> d.a);
  c_high : cover property (@(posedge d.clk) d.q);
endmodule
bind d d_sva u (.*);
"""


@requires_sby
def test_job_keeps_only_traces_of_failures_and_covers(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=SVA, dut_code=DUT, dut_filename="d.sv", mode="prove", depth=10,
        project_name="hygiene")
    assert job.result is not None
    verdicts = {a["name"]: a for a in job.result.assertion_results}
    assert verdicts["a_ok"]["verdict"] == "PROVEN"
    assert verdicts["a_bad"]["verdict"] == "FAIL"
    assert verdicts["c_high"]["verdict"] == "COVERED"

    traces = sorted(str(p) for p in tmp_path.rglob("*.vcd"))
    assert traces == sorted(os.path.realpath(verdicts[n]["counterexample_vcd"]) for n in ("a_bad", "c_high"))
    assert not list(tmp_path.rglob("model")) and not list(tmp_path.rglob("src"))
    assert "error" not in formal_service.read_counterexample_vcd(verdicts["a_bad"]["counterexample_vcd"])


@requires_sby
def test_only_failures_and_covers_link_a_trace(tmp_path, monkeypatch):
    # Passing assertions share batched runs with failing ones; they must not
    # point at another property's counterexample.
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)
    job = formal_service.FormalService().run_formal(
        sva_code=SVA, dut_code=DUT, dut_filename="d.sv", mode="prove", depth=10,
        project_name="traces")
    assert job.result is not None
    links = {a["name"]: a["counterexample_vcd"] for a in job.result.assertion_results}
    assert links["a_ok"] == ""
    assert links["a_bad"] and links["c_high"] and links["a_bad"] != links["c_high"]
