"""
The interface every formal engine implements (docs/agent/PRD.md §9.8).

The agent never calls a tool's command line itself: it builds an EngineJob
(design, properties, clock/reset, mode, depth) and reads back one Verdict
per property.  Both the existing SymbiYosys flow (sby_adapter) and, from M3,
our native BMC / k-induction engine implement it, so stages and the
cross-check do not depend on which engine ran.

Only PROVEN, COVERED and UNREACHABLE are conclusive (PRD §9.7).  Every
other verdict stays visible and is never read as a pass.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Protocol


ASSERT_VERDICTS = ("PROVEN", "HOLDS_BOUNDED", "FAIL", "VACUOUS", "ERROR", "TIMEOUT")
COVER_VERDICTS = ("COVERED", "UNREACHABLE", "NOT_REACHED", "ERROR", "TIMEOUT")
CONCLUSIVE = frozenset({"PROVEN", "COVERED", "UNREACHABLE"})


@dataclass
class EngineJob:
    rtl: str                       # design source (one or more modules)
    sva: str                       # properties (checker modules, bind)
    rtl_name: str = "dut.sv"
    top: str = ""
    clock: str = ""
    reset: str = ""
    reset_polarity: str = "auto"   # auto | low | high | none
    mode: str = "prove"            # bmc | prove | cover
    depth: int = 20
    timeout: int = 300
    name: str = ""                 # label for work directories and logs


@dataclass
class Verdict:
    label: str
    kind: str                      # ASSERT | COVER
    verdict: str
    detail: str = ""               # why: the engine's message, the kind of error
    engine: str = ""
    step: int = 0                  # failing / witness step
    bound: int = 0                 # depth reached by a bounded result
    seconds: float = 0.0
    trace_path: str = ""
    timed_out: bool = False        # HOLDS_BOUNDED because the proof ran out of time, not because it failed

    @property
    def conclusive(self) -> bool:
        return self.verdict in CONCLUSIVE


@dataclass
class EngineResult:
    engine: str
    ok: bool                       # the run completed (independently of the verdicts)
    error: str = ""
    verdicts: dict[str, Verdict] = field(default_factory=dict)
    sanity: str = ""               # OK | OVERCONSTRAINED | ...
    seconds: float = 0.0
    job_id: str = ""
    stats: dict = field(default_factory=dict)      # engine-specific: phase times, peak memory

    def asserts(self) -> dict[str, Verdict]:
        return {k: v for k, v in self.verdicts.items() if v.kind == "ASSERT"}

    def covers(self) -> dict[str, Verdict]:
        return {k: v for k, v in self.verdicts.items() if v.kind == "COVER"}

    def verdict_map(self) -> dict[str, str]:
        return {k: v.verdict for k, v in self.verdicts.items()}


class Engine(Protocol):
    name: str

    def run(self, job: EngineJob, only: Optional[set[str]] = None) -> EngineResult:
        """Check every property of the job (or only the labels in `only`)."""
        ...
