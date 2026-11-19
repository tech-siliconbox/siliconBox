"""
E1: bounded model checking of assertions and covers (docs/agent/PRD.md
§9.3, M3.3/M3.5).

One incremental unrolling serves every property, as in yosys-smtbmc:
at step k the open assertions are checked together ("can any of them fail
here?"); on sat the model tells which ones failed, each gets this trace,
and the rest are checked again.  An assertion that holds at step k is then
assumed at k for the later steps, exactly as smtbmc does, so the step a
failure is reported at matches sby's.  Covers are searched the same way
without that assumption (sby's cover mode removes the assertions), so
assertions and covers need separate sessions.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable, Optional


@dataclass
class Found:
    label: str
    step: int                       # the step the assertion fails / the cover is reached
    trace: str = ""                 # witness file of the trace (steps 0..step)


@dataclass
class BmcResult:
    failed: dict[str, Found] = field(default_factory=dict)
    reached: dict[str, Found] = field(default_factory=dict)
    depth: int = 0                  # steps fully checked
    timed_out: bool = False
    unknown: str = ""               # a solver answer that was neither sat nor unsat


def run_bmc(session, asserts: list[str], covers: list[str], depth: int, deadline: float,
            on_trace: Optional[Callable[[str, int], str]] = None) -> BmcResult:
    """`on_trace(name, steps)` writes the current model as a witness and
    returns its path.  Give either assertions or covers, not both."""
    if asserts and covers:
        raise ValueError("assertions and covers are checked in separate sessions")
    result = BmcResult()
    open_a, open_c = list(asserts), list(covers)
    for step in range(depth):
        if time.monotonic() > deadline:
            result.timed_out = True
            return result
        session.frame(step)
        while open_a:
            exprs = {a: session.expr(a, step) for a in open_a}
            answer = session.check("(not (and %s))" % " ".join(exprs.values()) if len(exprs) > 1
                                   else f"(not {next(iter(exprs.values()))})")
            if answer == "unsat":
                session.pop()
                break
            if answer != "sat":
                session.pop()
                result.unknown = answer
                return result
            failing = [a for a, e in exprs.items() if not session.true_in_model(e)]
            trace = on_trace(f"fail_{failing[0]}", step + 1) if on_trace else ""
            for a in failing:
                result.failed[a] = Found(a, step, trace)
            open_a = [a for a in open_a if a not in failing]
            session.pop()
            if time.monotonic() > deadline:
                result.timed_out = True
                return result
        for a in open_a:                                   # holds at this step: assumed from now on
            session.assume(session.expr(a, step))
        while open_c:
            exprs = {c: session.expr(c, step) for c in open_c}
            answer = session.check("(or %s)" % " ".join(exprs.values()) if len(exprs) > 1
                                   else next(iter(exprs.values())))
            if answer == "unsat":
                session.pop()
                break
            if answer != "sat":
                session.pop()
                result.unknown = answer
                return result
            hit = [c for c, e in exprs.items() if session.true_in_model(e)]
            trace = on_trace(f"cover_{hit[0]}", step + 1) if on_trace else ""
            for c in hit:
                result.reached[c] = Found(c, step, trace)
            open_c = [c for c in open_c if c not in hit]
            session.pop()
        result.depth = step + 1
        if not open_a and not open_c:
            break
    return result
