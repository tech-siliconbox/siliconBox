"""
Engine interface and the SymbiYosys adapter (docs/agent/PRD.md §9.7-9.8):
the adapter gives the same verdicts as the pipeline it wraps, takes clock
and reset from the IR, and reports a failed run as a failed run.
"""

import pytest

import app.praman.services.formal_service as formal_service
import app.praman.services.sby_generator as sby_generator
from app.praman.engine.api import CONCLUSIVE, EngineJob, Verdict
from app.praman.engine.sby_adapter import SbyEngine
from eval.formal import Case
from tests.praman.conftest import requires_sby


@pytest.fixture(autouse=True)
def work_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(formal_service, "FORMAL_WORK_DIR", tmp_path)
    monkeypatch.setattr(sby_generator, "FORMAL_WORK_DIR", tmp_path)


def test_job_from_ir_uses_the_ir_facts():
    case = Case.load("sync_fifo4")
    job = EngineJob.from_ir(case.ir, case.rtl, case.sva, depth=12)
    assert (job.top, job.clock, job.reset, job.reset_polarity) == ("sync_fifo4", "clk", "rst", "high")
    assert job.rtl_name == "sync_fifo4.sv" and job.depth == 12 and job.mode == "prove"


def test_only_proven_covered_and_unreachable_are_conclusive():
    assert CONCLUSIVE == {"PROVEN", "COVERED", "UNREACHABLE"}
    assert not Verdict("a", "ASSERT", "HOLDS_BOUNDED").conclusive
    assert Verdict("c", "COVER", "UNREACHABLE").conclusive


@requires_sby
def test_sby_adapter_matches_the_golden_expectations():
    case = Case.load("up_down_counter")
    result = SbyEngine().run(EngineJob.from_ir(case.ir, case.rtl, case.sva, depth=case.depth))
    assert result.ok and result.sanity == "OK" and result.engine == "sby"
    assert result.verdict_map() == case.expected
    assert set(result.asserts()) | set(result.covers()) == set(case.expected)
    assert all(v.kind == "COVER" for k, v in result.verdicts.items() if k.startswith("co_"))


@requires_sby
def test_sby_adapter_keeps_the_trace_of_a_failure_and_filters_labels():
    case = Case.load("up_down_counter")
    rtl = case.mutant(case.mutations[0])          # load does not beat a count step
    result = SbyEngine().run(EngineJob.from_ir(case.ir, rtl, case.sva, depth=case.depth),
                             only={"ap_req002_load", "co_req003_up"})
    assert set(result.verdicts) == {"ap_req002_load", "co_req003_up"}
    fail = result.verdicts["ap_req002_load"]
    assert fail.verdict == "FAIL" and fail.trace_path.endswith(".vcd") and fail.step > 0


@requires_sby
def test_a_run_that_cannot_compile_is_not_ok():
    case = Case.load("up_down_counter")
    result = SbyEngine().run(EngineJob.from_ir(case.ir, case.rtl, "module p; assert property (;\nendmodule\n"))
    assert not result.ok and result.error and result.verdicts == {}
