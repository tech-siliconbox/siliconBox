"""
The existing SymbiYosys flow (FormalService.run_formal) behind the Engine
interface.  Nothing about the flow changes: this only translates a job in
and the per-property results out.
"""

from __future__ import annotations

import time
from typing import Optional

from app.praman.engine.api import EngineJob, EngineResult, Verdict
from app.praman.services.formal_service import FormalService


class SbyEngine:
    name = "sby"

    def __init__(self, service: Optional[FormalService] = None):
        self.service = service or FormalService()

    def run(self, job: EngineJob, only: Optional[set[str]] = None) -> EngineResult:
        start = time.monotonic()
        formal = self.service.run_formal(
            sva_code=job.sva, dut_code=job.rtl, dut_filename=job.rtl_name, dut_top=job.top,
            mode=job.mode, depth=job.depth, timeout=job.timeout,
            project_name=job.name or "engine_job", clock_signal=job.clock,
            reset_signal=job.reset, reset_polarity=job.reset_polarity)
        seconds = round(time.monotonic() - start, 2)
        if formal.status != "complete" or formal.result is None:
            return EngineResult(self.name, ok=False, error=formal.error_message or formal.status,
                                seconds=seconds, job_id=formal.job_id)
        verdicts = {}
        for a in formal.result.assertion_results:
            if only is not None and a["name"] not in only:
                continue
            verdicts[a["name"]] = Verdict(
                label=a["name"], kind=a.get("type", "ASSERT"), verdict=a["verdict"],
                detail=a.get("verdict_detail") or a.get("message", ""), engine=a.get("engine", ""),
                step=a.get("step") or 0, bound=a.get("bound") or 0,
                seconds=a.get("elapsed_seconds") or 0.0, trace_path=a.get("counterexample_vcd") or "")
        return EngineResult(self.name, ok=True, verdicts=verdicts,
                            sanity=formal.result.sanity.get("status", ""), seconds=seconds,
                            job_id=formal.job_id, stats={"debug": formal.debug_info})
