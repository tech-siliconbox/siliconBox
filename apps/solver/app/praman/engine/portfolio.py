"""
Proof portfolio and evidence levels (docs/agent/PRD.md §16.1-16.2, M3.9).

Besides the native engine and the sby flow (abc pdr racing smtbmc
k-induction), each assertion can be proven by other open-source model
checkers through sby: rIC3 (IC3) and avy (interpolation + PDR) on the
AIGER model, and ABC's PDR on its own.  Every PROVEN result records which
engines proved it:

  L1  one engine proved it
  L2  two independent engines proved it (required for VERIFIED, §5.9)
  L3  L2 and a checked certificate (Certifaiger, M4) - not produced here

Engines count as independent when their algorithms and implementations
differ: native k-induction, sby (pdr / k-induction race), rIC3, avy,
abc pdr.  ("sby" and "abc_pdr" share ABC's PDR, so together they count
once.)

A proof run takes every candidate assertion at once; a PASS proves them
all.  Anything else (one fails beyond the depth, a timeout) proves none of
that run, and the candidates are tried one by one, up to a limit.
"""

from __future__ import annotations

import shutil
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.praman.services.sby_generator import FORMAL_WORK_DIR, generate_files_project
from app.praman.services.yosys_reader import MONITOR_FILE

ENGINES = {                      # name -> (sby engine line, executable)
    "rIC3": ("aiger rIC3", "rIC3"),
    "avy": ("aiger avy", "avy"),
    "abc_pdr": ("abc pdr", "yosys-abc"),
}
_SAME_ALGORITHM = [{"sby", "abc_pdr"}]          # count once
SINGLE_LIMIT = 12                               # one-by-one retries per engine


def available() -> list[str]:
    return [name for name, (_, exe) in ENGINES.items() if shutil.which(exe)]


def level(proved_by: set[str]) -> str:
    """L0 (not proven), L1 or L2 from the engines that proved a property."""
    engines = set(proved_by)
    for group in _SAME_ALGORITHM:
        if len(engines & group) > 1:
            engines -= group
            engines.add(sorted(group)[0])
    return "L2" if len(engines) >= 2 else "L1" if engines else "L0"


@dataclass
class PortfolioResult:
    proven: dict[str, set[str]] = field(default_factory=dict)      # engine -> labels it proved
    errors: dict[str, str] = field(default_factory=dict)
    seconds: dict[str, float] = field(default_factory=dict)

    def proved_by(self, label: str) -> set[str]:
        return {e for e, labels in self.proven.items() if label in labels}


def prove(prepared, labels: list[str], depth: int, timeout: int = 120, engines: Optional[list[str]] = None,
          work_dir: Optional[Path] = None) -> PortfolioResult:
    """Try to prove `labels` (assertions) with each portfolio engine."""
    from app.praman.services.formal_service import FormalService
    service = FormalService()
    result = PortfolioResult()
    if not labels:
        return result
    root = Path(work_dir or FORMAL_WORK_DIR) / f"portfolio_{uuid.uuid4().hex[:6]}"
    steps = depth * prepared.steps_per_cycle

    def run(engine: str, active: list[str], tag: str) -> str:
        files = prepared.sources(0)
        files[MONITOR_FILE] = service._isolate(prepared.monitor_text, set(active))
        project = generate_files_project(str(root / f"{engine}_{tag}"), f"{engine}_{tag}", files, prepared.top,
                                         mode="prove", depth=steps, engine=ENGINES[engine][0], timeout=timeout,
                                         reader=prepared.reader, multiclock=prepared.multiclock,
                                         prep_script=prepared.script)
        return service._run_sby(project.sby_file, project.work_dir, timeout + 30).status

    for engine in (engines or available()):
        start = time.monotonic()
        try:
            status = run(engine, labels, "all")
            if status == "PASS":
                result.proven[engine] = set(labels)
            else:
                proven = set()
                for i, label in enumerate(labels[:SINGLE_LIMIT]):
                    if run(engine, [label], f"{i:02d}") == "PASS":
                        proven.add(label)
                result.proven[engine] = proven
        except Exception as e:                       # a tool problem: no evidence from this engine
            result.errors[engine] = str(e)[:300]
        result.seconds[engine] = round(time.monotonic() - start, 2)
    return result
