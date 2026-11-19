"""
Cross-check of engines (docs/agent/PRD.md §9.4, M3.8).

Runs the same job on two engines and compares the verdicts property by
property:
  agree     same verdict (and, for FAIL / COVERED, the same step)
  conflict  conclusive results that contradict each other (PROVEN vs
            FAIL, COVERED vs UNREACHABLE, ...): a soundness bug, P0
  weaker    one engine is conclusive, the other is not (e.g. sby's PDR
            proves what k-induction cannot): a completeness gap, reported
  step      both FAIL / COVERED, at different steps
  other     any other difference (ERROR, TIMEOUT, a missing property)

"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.praman.engine.api import CONCLUSIVE, EngineResult

_PASSING = {"PROVEN", "HOLDS_BOUNDED", "VACUOUS"}
_FOUND = {"FAIL", "COVERED"}
# how sby words a FAIL / COVERED its proof engine found beyond the BMC depth (formal_service)
_BEYOND = ("beyond the BMC depth", "only after more than")


def classify(a: Optional[str], b: Optional[str], step_a: int = 0, step_b: int = 0) -> str:
    if a == b:
        return "step" if a in _FOUND and step_a != step_b else "agree"
    if a is None or b is None:
        return "other"
    pair = {a, b}
    contradictory = [{"PROVEN", "FAIL"}, {"COVERED", "UNREACHABLE"}, {"VACUOUS", "FAIL"}, {"HOLDS_BOUNDED", "FAIL"},
                     {"COVERED", "NOT_REACHED"}]
    if pair in ({"PROVEN", "FAIL"}, {"COVERED", "UNREACHABLE"}):
        return "conflict"
    if pair in contradictory:
        # a bounded pass vs a FAIL within the same depth, or a cover found vs not found within it:
        # contradictory unless the FAIL / COVERED came from beyond the depth (a proof engine)
        return "beyond"
    if (a in CONCLUSIVE) != (b in CONCLUSIVE):
        return "weaker"
    return "other"


@dataclass
class Comparison:
    name: str
    rows: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for r in self.rows:
            out[r["class"]] = out.get(r["class"], 0) + 1
        return out


def compare(name: str, first: EngineResult, second: EngineResult) -> Comparison:
    cmp = Comparison(name)
    def refused(r: EngineResult) -> bool:
        return not r.ok or (bool(r.verdicts) and all(v.verdict == "ERROR" for v in r.verdicts.values()))
    if refused(first) and refused(second) and not (first.ok and second.ok):
        # both refuse the design (e.g. it cannot be read): agreement, recorded
        cmp.rows.append({"label": "(design)", first.engine: "ERROR", second.engine: "ERROR", "class": "agree",
                         "detail": second.error[:200]})
        return cmp
    for r, label in ((first, first.engine), (second, second.engine)):
        if not r.ok:
            cmp.errors.append(f"{label}: {r.error}")
    if cmp.errors:
        return cmp
    for label in sorted(set(first.verdicts) | set(second.verdicts)):
        a, b = first.verdicts.get(label), second.verdicts.get(label)
        cls = classify(a and a.verdict, b and b.verdict, a.step if a else 0, b.step if b else 0)
        if cls == "step" and any(any(w in v.detail for w in _BEYOND) for v in (a, b)):
            cls = "agree"            # found beyond the depth: a PDR trace need not be the shortest
        if cls == "beyond":
            # sby's FAIL / COVERED beyond the BMC depth comes from its proof engine
            found = a if a and a.verdict in _FOUND else b
            cls = "weaker" if found and any(w in found.detail for w in _BEYOND) else "conflict"
        cmp.rows.append({"label": label, first.engine: a and a.verdict, second.engine: b and b.verdict,
                         f"{first.engine}_step": a.step if a else None, f"{second.engine}_step": b.step if b else None,
                         "class": cls})
    if first.sanity != second.sanity:
        cmp.rows.append({"label": "(sanity)", first.engine: first.sanity, second.engine: second.sanity,
                         "class": "conflict" if {first.sanity, second.sanity} == {"OK", "OVERCONSTRAINED"} else "other"})
    return cmp

