"""
The native engine's worker process: `python -m app.praman.engine.worker spec.json`.

Runs in its own process because Yosys's smtio takes over signal handling
(app/engine/smt.py), and so a job can be killed at its time limit and kept
under a memory cap.  Reads a spec written by app/engine/native.py, runs:
  1. BMC of the assertions (on the model with the assertions active) and
     of the covers (on the model with the covers active);
  2. with mode "prove": k-induction of the assertions that held, and of the
     covers not reached (never reached), each on its own model, k = the
     depth BMC completed;
  3. with mode "prove", a deeper search (E4): BMC on to 4x the depth, in a
     time budget, of what neither BMC nor induction decided - a failure or a
     cover that only appears later (sby finds those with PDR);
  4. replay of every trace in `yosys sim` (VCD + confirmation);
and writes result.json next to the spec.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path


def main(spec_path: str) -> int:
    spec = json.loads(Path(spec_path).read_text())
    out = Path(spec_path).parent
    from app.praman.engine.bmc import run_bmc
    from app.praman.engine.kind import run_induction
    from app.praman.engine.smt import Session
    from app.praman.engine.witness import replay, write_yw

    deadline = time.monotonic() + spec["timeout"]
    traces_dir = out / "traces"
    traces_dir.mkdir(exist_ok=True)
    result: dict = {"bmc_depth": {}, "failed": {}, "reached": {}, "proven": [], "k": 0, "timed_out": False,
                    "unknown": "", "seconds": {}}

    def on_trace_for(session):
        def on_trace(name: str, steps: int) -> str:
            path = traces_dir / f"{name[:80]}.yw"
            write_yw(session, steps, path)
            return str(path)
        return on_trace

    t0 = time.monotonic()
    depth = spec["depth"]
    models = spec["models"]
    if spec["asserts"]:
        s = Session(models["assert"]["smt2"], spec["solver"])
        missing = [a for a in spec["asserts"] if a not in s.props]
        asserts = [a for a in spec["asserts"] if a in s.props]
        bmc = run_bmc(s, asserts, [], depth, deadline, on_trace_for(s))
        s.close()
        result["bmc_depth"]["assert"] = bmc.depth
        result["failed"] = {f.label: {"step": f.step, "trace": f.trace} for f in bmc.failed.values()}
        result["missing"] = missing
        result["timed_out"] |= bmc.timed_out
        result["unknown"] = result["unknown"] or bmc.unknown
    result["seconds"]["bmc_assert"] = round(time.monotonic() - t0, 3)

    t0 = time.monotonic()
    if spec["covers"]:
        s = Session(models["cover"]["smt2"], spec["solver"])
        covers = [c for c in spec["covers"] if c in s.props]
        cov = run_bmc(s, [], covers, depth, deadline, on_trace_for(s))
        s.close()
        result["bmc_depth"]["cover"] = cov.depth
        result["reached"] = {f.label: {"step": f.step, "trace": f.trace} for f in cov.reached.values()}
        result["timed_out"] |= cov.timed_out
        result["unknown"] = result["unknown"] or cov.unknown
    result["seconds"]["bmc_cover"] = round(time.monotonic() - t0, 3)

    t0 = time.monotonic()
    if spec["mode"] == "prove" and not result["timed_out"]:
        # each part's induction depth is what its own BMC completed (the cover search stops
        # early once every cover is found; then no cover is left to prove unreachable)
        ks = {part: result["bmc_depth"].get(part, depth) for part in ("assert", "cover")}
        k = ks["assert"] if spec["asserts"] else ks["cover"]
        proven: set[str] = set()
        for part, wanted in (("assert", {a for a in spec["asserts"] if a not in result["failed"]}),
                             ("cover", {c for c in spec["covers"] if c not in result["reached"]})):
            if not wanted or part not in models:
                continue
            s = Session(models[part]["smt2"], spec["solver"])
            # FORMAL_SIMPLE_PATH=0 turns off the simple-path pass (E4), e.g. to compare engines
            # FORMAL_LEMMAS=0 turns off the mined invariants (E4)
            smt2 = models[part]["smt2"]
            ind = run_induction(s, {l: part for l in wanted if l in s.props}, ks[part], deadline,
                                simple_path=os.environ.get("FORMAL_SIMPLE_PATH", "1") != "0",
                                base_session=(lambda: Session(smt2, spec["solver"]))
                                if os.environ.get("FORMAL_LEMMAS", "1") != "0" else None)
            s.close()
            proven |= ind.proven
            if ind.with_lemmas:
                result.setdefault("lemmas", {})[part] = {"proven": sorted(ind.with_lemmas), "invariants": ind.lemmas}
            result["timed_out"] |= ind.timed_out
            result["unknown"] = result["unknown"] or ind.unknown
        result["proven"] = sorted(proven)
        result["k"] = k
    result["seconds"]["induction"] = round(time.monotonic() - t0, 3)

    t0 = time.monotonic()
    if spec["mode"] == "prove" and not result["timed_out"] and os.environ.get("FORMAL_DEEP", "1") != "0":
        _deeper(spec, result, depth, deadline, on_trace_for)
    result["seconds"]["deeper"] = round(time.monotonic() - t0, 3)

    t0 = time.monotonic()
    for table, part in (("failed", "assert"), ("reached", "cover")):
        if part not in models:
            continue
        prep = Path(models[part]["prep_il"])
        for label, entry in result[table].items():
            if not entry["trace"]:
                continue
            yw = Path(entry["trace"])
            summary = replay(prep, yw, yw.with_suffix(".vcd"))
            entry["vcd"] = str(yw.with_suffix(".vcd")) if "error" not in summary else ""
            entry["replay"] = summary
    result["seconds"]["replay"] = round(time.monotonic() - t0, 3)
    result["peak_memory_mb"] = _peak_memory_mb()
    (out / "result.json").write_text(json.dumps(result, indent=1))
    return 0


DEEP_FACTOR = 4


def _deeper(spec: dict, result: dict, depth: int, deadline: float, on_trace_for) -> None:
    """BMC past the depth for the assertions neither BMC nor induction decided
    and the covers neither reached nor proven unreachable.  What it finds is
    a real trace, only longer than the depth asked for; what it does not find
    stays as it was.  Its time is at most twice what the job took so far
    (at least 5 s), so a property that holds does not use up the job's limit."""
    from app.praman.engine.bmc import run_bmc
    from app.praman.engine.smt import Session
    proven = set(result["proven"])
    spent = sum(result["seconds"].values())
    budget = min(deadline, time.monotonic() + max(5.0, 2 * spent))
    for part, labels in (("assert", [a for a in spec["asserts"]
                                     if a not in result["failed"] and a not in proven and a not in result.get("missing", [])]),
                         ("cover", [c for c in spec["covers"] if c not in result["reached"] and c not in proven])):
        if not labels or part not in spec["models"] or result["bmc_depth"].get(part, 0) < depth:
            continue
        s = Session(spec["models"][part]["smt2"], spec["solver"])
        try:
            labels = [l for l in labels if l in s.props]
            run = run_bmc(s, labels if part == "assert" else [], labels if part == "cover" else [],
                          depth * DEEP_FACTOR, budget, on_trace_for(s))
        finally:
            s.close()
        found = run.failed if part == "assert" else run.reached
        table = result["failed"] if part == "assert" else result["reached"]
        for f in found.values():
            table[f.label] = {"step": f.step, "trace": f.trace, "deeper": True}
        result.setdefault("deeper", {})[part] = run.depth


def _peak_memory_mb() -> dict:
    """Peak resident memory of this worker and of its largest child (a solver or a trace replay)."""
    try:
        import resource
    except ImportError:
        return {}
    scale = 1 if sys.platform == "darwin" else 1024          # ru_maxrss: bytes on macOS, KiB on Linux
    own = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * scale
    child = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss * scale
    return {"worker": round(own / 2**20, 1), "largest_child": round(child / 2**20, 1)}


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
