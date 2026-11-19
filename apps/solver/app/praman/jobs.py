"""
A proof as Praman runs it: the ProofSpec a command builds, run in this process.

formal-verify ran proofs as jobs in a folder queue taken by worker processes.
In SiliconBox each open session has a container of its own (ADR 0031), so the
proof runs in the session's own process, on a thread, and stops with its
cancel event.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Callable, Optional


@dataclass
class ProofSpec:
    job_id: str
    design_text: str
    sva_text: str
    design_name: str
    top: str
    depth: int
    per_property: int
    scans: list[int]
    only: list[str]
    reset_signal: str = ""
    reset_polarity: str = "auto"
    clock_signal: str = ""
    witness_covers: bool = True
    cut: list[str] = field(default_factory=list)       # stopat signals
    without: list[str] = field(default_factory=list)   # assumptions left out


EngineCallback = Callable[[str, str, str, bool], None]      # (label, kind of run, line, progress?)


def run(spec: ProofSpec, cancel: threading.Event, on_property: Callable[[dict], None],
        on_progress: Callable[[str, int, int], None], on_engine: Optional[EngineCallback] = None):
    """Run the proof; the finished FormalJob."""
    from app.praman.services.formal_service import FormalService
    service = FormalService()
    service.only = set(spec.only)
    service.cancel = cancel
    service.scans = list(spec.scans)
    service.on_property = on_property
    service.on_progress = on_progress
    service.on_engine = on_engine
    service.cut, service.without = list(spec.cut), list(spec.without)
    return service.run_formal(
        sva_code=spec.sva_text, dut_code=spec.design_text, dut_filename=spec.design_name, dut_top=spec.top,
        mode="prove", depth=spec.depth, timeout=spec.per_property, project_name=spec.job_id,
        reset_signal=spec.reset_signal, reset_polarity=spec.reset_polarity, clock_signal=spec.clock_signal,
        witness_covers=spec.witness_covers)
