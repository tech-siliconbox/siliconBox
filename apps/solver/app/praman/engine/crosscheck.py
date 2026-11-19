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

  python -m app.praman.engine.crosscheck [--cases a,b] [--mutants] [--corpus] [--sv-tests] [--out file.json]

--cases: the agent evaluation cases (eval/cases); --corpus: the regression
corpus (tests/formal_corpus, with its mutants under --mutants); --sv-tests:
the chapter 16 files of sv-tests (top, clock and reset found automatically).
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from typing import Optional

from app.praman.engine.api import CONCLUSIVE, Engine, EngineJob, EngineResult

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


def run_pair(job: EngineJob, first: Engine, second: Engine, name: str = "") -> Comparison:
    return compare(name or job.name, first.run(job), second.run(job))


def corpus_jobs(mutants: bool = False) -> list[tuple[str, EngineJob]]:
    from pathlib import Path
    root = Path(__file__).resolve().parents[2] / "tests" / "formal_corpus"
    out = []
    for path in sorted(root.glob("*/case.json")):
        case = json.loads(path.read_text())
        dut = (path.parent / case["dut"]).read_text()
        sva = (path.parent / case["sva"]).read_text()
        variants = [("golden", dut)]
        if mutants:
            for m in case.get("mutations", []):
                old, new = m["replace"]
                variants.append((m["name"], dut.replace(old, new)))
        for vname, rtl in variants:
            out.append((f"corpus/{path.parent.name}/{vname}",
                        EngineJob(rtl=rtl, sva=sva, rtl_name=case["dut"], mode=case.get("mode", "prove"),
                                  depth=case.get("depth", 20), timeout=300, name=f"xc_{path.parent.name}")))
    return out


def sv_test_jobs() -> list[tuple[str, EngineJob]]:
    from pathlib import Path
    root = Path(__file__).resolve().parents[2] / "tests" / "sv_tests_ch16"
    return [(f"sv-tests/{p.name}", EngineJob(rtl=p.read_text(), sva="", rtl_name=p.name, mode="prove", depth=20,
                                             timeout=300, name="xc_svtests"))
            for p in sorted(root.glob("*.sv"))]


def main(argv: Optional[list[str]] = None) -> int:
    from app.praman.engine.native import NativeEngine
    from app.praman.engine.sby_adapter import SbyEngine
    from eval.formal import Case, list_cases
    parser = argparse.ArgumentParser(prog="python -m app.praman.engine.crosscheck", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cases", default="")
    parser.add_argument("--mutants", action="store_true", help="also every mutant of every case")
    parser.add_argument("--out", default="")
    parser.add_argument("--corpus", action="store_true")
    parser.add_argument("--sv-tests", action="store_true")
    parser.add_argument("--no-cases", action="store_true", help="skip the evaluation cases")
    args = parser.parse_args(argv)
    sby, native = SbyEngine(), NativeEngine()
    results = []
    jobs: list[tuple[str, EngineJob]] = []
    for name in ([] if args.no_cases else (args.cases.split(",") if args.cases else list_cases())):
        case = Case.load(name)
        variants = [("golden", case.rtl)] + ([(m["name"], case.mutant(m)) for m in case.mutations] if args.mutants else [])
        for vname, rtl in variants:
            jobs.append((f"{name}/{vname}", EngineJob.from_ir(case.ir, rtl, case.sva, rtl_name=case.rtl_name,
                                                              mode=case.mode, depth=case.depth, timeout=300,
                                                              name=f"xc_{name}")))
    if args.corpus:
        jobs += corpus_jobs(args.mutants)
    if args.sv_tests:
        jobs += sv_test_jobs()
    for jname, job in jobs:
        if True:
            s, n = sby.run(job), native.run(job)
            cmp = compare(jname, s, n)
            results.append({"job": cmp.name, "counts": cmp.counts(), "errors": cmp.errors,
                            "differences": [r for r in cmp.rows if r["class"] != "agree"],
                            "seconds": {"sby": s.seconds, "native": n.seconds}})
            print(f"{cmp.name}: {cmp.counts()} {cmp.errors or ''} sby {s.seconds}s native {n.seconds}s", flush=True)
            for r in cmp.rows:
                if r["class"] != "agree":
                    print(f"    {r}", flush=True)
    totals: dict[str, int] = {}
    for r in results:
        for k, v in r["counts"].items():
            totals[k] = totals.get(k, 0) + v
    print("totals:", totals)
    if args.out:
        with open(args.out, "w") as f:
            json.dump({"totals": totals, "jobs": results}, f, indent=1)
    return 1 if totals.get("conflict") or any(r["errors"] for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
