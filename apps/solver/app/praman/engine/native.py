"""
The native engine behind the Engine interface (docs/agent/PRD.md §9,
M3.3-M3.6): the same front end as the sby flow (sva/pipeline compiles the
SVA into monitors, adds the harness and the sanity cover), then our own
model export (export.py) and checks (worker.py: BMC, k-induction, trace
replay), with verdicts decided by the same rules as
FormalService._check_assert / _check_cover:

  assertion  BMC fails -> FAIL; antecedent cover proven never reached ->
             VACUOUS; induction proves it -> PROVEN; antecedent never
             reached within the depth -> VACUOUS; else HOLDS_BOUNDED
  cover      reached -> COVERED; proven never reached -> UNREACHABLE;
             else NOT_REACHED
  sanity     the sanity cover not reached: passing assertions are VACUOUS

Not checked natively (never reported as a pass): liveness parts (E5) -
such assertions stay HOLDS_BOUNDED at best; properties the lowering could
not handle -> ERROR.  A job past its time limit leaves TIMEOUT.
"""

from __future__ import annotations

import dataclasses
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Optional

from app.praman.services.proc import run_tree
from app.praman.engine.api import EngineJob, EngineResult, Verdict
from app.praman.engine.export import ExportError, export
from app.praman.services.sby_generator import FORMAL_WORK_DIR, SANITY_COVER_LABEL
from app.praman.services.sva.compiler import PRECONDITION_SUFFIX
from app.praman.services.yosys_reader import MONITOR_FILE

MEMORY_LIMIT = 1 << 30                       # bytes per worker process (PRD §9.5)
NAME = "native"


def _limit_memory():                         # pragma: no cover - runs in the child
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (MEMORY_LIMIT, MEMORY_LIMIT))
    except (ValueError, OSError, ImportError):
        pass                                 # macOS does not enforce RLIMIT_AS


class NativeEngine:
    name = NAME

    def __init__(self, solver: str = "", work_dir: Optional[Path] = None, extra_script: Optional[list[str]] = None):
        self.solver = solver
        self.work_dir = work_dir
        self.extra_script = extra_script or []

    def run(self, job: EngineJob, only: Optional[set[str]] = None) -> EngineResult:
        from app.praman.services.compile_worker import run_isolated
        from app.praman.services.formal_service import compile_design
        from app.praman.services.sva.frontend import FrontendError
        from app.praman.services.sva.pipeline import DesignReadError
        start = time.monotonic()
        try:
            prepared = run_isolated(compile_design, job.sva, job.rtl, job.rtl_name, job.top,
                                    reset_signal=job.reset, reset_polarity=job.reset_polarity,
                                    clock_signal=job.clock)
        except (FrontendError, DesignReadError) as e:
            return EngineResult(NAME, ok=False, error=f"elaboration_error: {e}", seconds=_since(start))
        return self.run_prepared(prepared, job, only, start)

    def run_prepared(self, prepared, job: EngineJob, only: Optional[set[str]] = None,
                     start: Optional[float] = None) -> EngineResult:
        """Run on a design the front end has already compiled (FormalService.run_formal)."""
        from app.praman.services.formal_service import FormalService
        from app.praman.engine.smt import solver_name
        start = start if start is not None else time.monotonic()
        root = Path(self.work_dir or FORMAL_WORK_DIR) / f"{job.name or 'native'}_{uuid.uuid4().hex[:6]}"
        service = FormalService()
        lowered = prepared.monitor_text
        types = service._label_type_map(lowered)
        labels = service._extract_lowered_assert_labels(lowered)
        if only is not None:
            labels = [l for l in labels if l in only]
        steps = job.depth * prepared.steps_per_cycle
        try:
            solver = solver_name(self.solver or "yices")
        except RuntimeError as e:
            return EngineResult(NAME, ok=False, error=f"tool_missing: {e}", seconds=_since(start))
        asserts = [l for l in labels if types.get(l) == "ASSERT"]
        covers = [l for l in labels if types.get(l) == "COVER"]
        pres = [l + PRECONDITION_SUFFIX for l in asserts if types.get(l + PRECONDITION_SUFFIX) == "COVER"]
        # One model with the assertions active, one with the covers, as sby's bmc and cover
        # runs (some designs only build with them apart, and covers must not see assertions).
        # The sanity cover only goes into the cover model, as in sby's runs.  A part whose
        # model cannot be built leaves its properties ERROR; the other part still runs.
        models, broken = {}, {}
        for part, active, sanity in (("assert", set(asserts), 0), ("cover", set(covers + pres), max(1, job.depth - 4))):
            if not active and part == "assert":
                continue
            files = prepared.sources(sanity)
            files[MONITOR_FILE] = service._isolate(lowered, active)
            try:
                models[part] = export(files, prepared.top, prepared.reader, prepared.script, root / part,
                                      multiclock=prepared.multiclock, extra_script=self.extra_script)
            except ExportError as e:
                broken[part] = f"elaboration_error: {e}"
        if not models:
            return EngineResult(NAME, ok=False, error=next(iter(broken.values())), seconds=_since(start))
        spec = {"models": {k: {"smt2": str(m.smt2), "prep_il": str(m.prep_il)} for k, m in models.items()},
                "asserts": asserts if "assert" in models else [],
                "covers": covers + pres + [SANITY_COVER_LABEL] if "cover" in models else [], "depth": steps,
                "mode": job.mode, "timeout": job.timeout, "solver": solver}
        spec_path = root / "spec.json"
        spec_path.write_text(json.dumps(spec))
        env = {**os.environ, "PYTHONPATH": os.pathsep.join([str(Path(__file__).resolve().parents[3]),
                                                            os.environ.get("PYTHONPATH", "")])}
        try:
            # the worker and its solver in a process group of their own, killed together on a timeout
            proc = run_tree([sys.executable, "-m", "app.praman.engine.worker", str(spec_path)],
                            timeout=job.timeout + 60, env=env, cwd=str(root),
                            preexec_fn=_limit_memory if os.name == "posix" else None)
        except subprocess.TimeoutExpired:
            return self._all(labels, types, "TIMEOUT", f"the job did not finish within {job.timeout} s", start)
        result_path = root / "result.json"
        if proc.returncode != 0 or not result_path.exists():
            tail = (proc.stderr or proc.stdout).strip()[-400:]
            kind = "resource_exhausted" if "MemoryError" in tail or proc.returncode in (-9, 137) else "solver_crash"
            return EngineResult(NAME, ok=False, error=f"{kind}: {tail}", seconds=_since(start))
        res = json.loads(result_path.read_text())
        verdicts = self._verdicts(res, asserts if "assert" in models else [], covers if "cover" in models else [],
                                  types, lowered, service, steps, job.mode == "prove", solver,
                                  precondition_known="cover" in models)
        for part, error in broken.items():
            for label in (asserts if part == "assert" else covers):
                verdicts[label] = Verdict(label, part.upper(), "ERROR", error, NAME)
        for label, (kind, reason) in service._unsupported_labels(lowered).items():
            if only is None or label in only:
                verdicts[label] = Verdict(label, kind, "ERROR", f"unsupported_construct: {reason}", NAME)
        sanity = "OK" if SANITY_COVER_LABEL in res["reached"] else (
            "ERROR" if "cover" not in models else "TIMEOUT" if res["timed_out"] else "OVERCONSTRAINED")
        if sanity == "OVERCONSTRAINED":
            for v in verdicts.values():
                if v.kind == "ASSERT" and v.verdict in ("PROVEN", "HOLDS_BOUNDED"):
                    v.verdict = "VACUOUS"
                    v.detail = ("The assumptions stop the design from running the whole BMC depth after reset. "
                                "Assertions that pass are vacuous; check the assume properties for contradictions.")
        if only is None and job.mode == "prove" and sanity == "OK":
            self._alone(prepared, job, verdicts, start)
        return EngineResult(NAME, ok=True, verdicts=verdicts, sanity=sanity, seconds=_since(start),
                            job_id=root.name, stats={"seconds": res.get("seconds", {}), "k": res.get("k", 0),
                                                     "peak_memory_mb": res.get("peak_memory_mb", {}),
                                                     # for explain_trace (diagnosis, the UI)
                                                     "debug": {p.label: p.debug for p in prepared.properties
                                                               if p.debug}})

    ALONE_MAX = 4                       # bounded assertions tried again on their own, at most

    def _alone(self, prepared, job: EngineJob, verdicts: dict, start: float) -> None:
        """An assertion left HOLDS_BOUNDED (not for lack of time) is proven again in a model of its own.
        The other properties' monitors add registers, and with them invariant candidates and frames, that
        can keep k-induction from closing (a FIFO's order among its other properties: bounded together,
        proven alone in 40 s).  Sound: an assertion proven on its own holds."""
        bounded = [v.label for v in verdicts.values()
                   if v.kind == "ASSERT" and v.verdict == "HOLDS_BOUNDED" and not v.timed_out]
        for label in bounded[:self.ALONE_MAX]:
            left = job.timeout - (time.monotonic() - start)
            if left < 30:
                return
            alone = self.run_prepared(prepared, dataclasses.replace(job, timeout=int(left), name=f"{job.name}_alone"),
                                      only={label})
            v = alone.verdicts.get(label) if alone.ok else None
            if v is not None and v.verdict == "PROVEN":
                v.detail = (v.detail + " " if v.detail else "") + "(proven on its own: together with the other " \
                           "properties, k-induction did not close)"
                verdicts[label] = v

    @staticmethod
    def _verdicts(res: dict, asserts: list[str], covers: list[str], types: dict, lowered: str, service,
                  steps: int, prove: bool, solver: str, precondition_known: bool = True) -> dict[str, Verdict]:
        failed, reached, proven = res["failed"], res["reached"], set(res["proven"])
        complete = not res["timed_out"] and not res["unknown"]
        bmc_engine = f"native bmc ({solver})"
        kind_engine = f"native k-induction k={res['k']} ({solver})"
        out: dict[str, Verdict] = {}
        for a in asserts:
            if a in failed:
                f = failed[a]
                confirmed = any(x.get("type") == "$assert" and x.get("path", [""])[-1].lstrip("\\") == a
                                for x in f.get("replay", {}).get("assertions", []))
                where = f"beyond the BMC depth (step {f['step']})" if f.get("deeper") else f"at step {f['step']}"
                detail = f"Counterexample {where}." + ("" if confirmed else " (not confirmed in simulation)")
                out[a] = Verdict(a, "ASSERT", "FAIL", detail, bmc_engine, step=f["step"], trace_path=f.get("vcd", ""))
                continue
            if a in res.get("missing", []):
                out[a] = Verdict(a, "ASSERT", "ERROR", "unsupported_construct: not in the exported model", NAME)
                continue
            if res["bmc_depth"].get("assert", 0) < steps:
                out[a] = Verdict(a, "ASSERT", "TIMEOUT" if res["timed_out"] else "ERROR",
                                 f"bounded check stopped at step {res['bmc_depth'].get('assert', 0)}"
                                 + (f" (solver answered {res['unknown']})" if res["unknown"] else ""), NAME,
                                 bound=res["bmc_depth"].get("assert", 0))
                continue
            pre = a + PRECONDITION_SUFFIX
            has_pre = types.get(pre) == "COVER" and precondition_known
            if has_pre and pre not in reached and prove and pre in proven:
                out[a] = Verdict(a, "ASSERT", "VACUOUS",
                                 "The antecedent can never match (proven), so this assertion checks nothing.",
                                 kind_engine)
                continue
            live = service._live_parts(lowered, a)
            if has_pre and pre not in reached:
                out[a] = Verdict(a, "ASSERT", "VACUOUS",
                                 f"The antecedent never matches within {steps} cycles, so this assertion checked nothing.",
                                 bmc_engine, bound=steps)
                continue
            if prove and a in proven and not live:
                out[a] = Verdict(a, "ASSERT", "PROVEN", "Holds for all reachable states (full proof).", kind_engine)
                continue
            detail = f"No counterexample within {steps} cycles"
            if prove and a in proven:
                detail = "Safety part proven. Liveness part not checked (native engine)."
            elif live:
                detail += "; liveness part not checked (native engine)."
            else:
                detail += ("; full proof inconclusive." if complete else "; proof timed out.") if prove \
                    else " (bounded check only)."
            out[a] = Verdict(a, "ASSERT", "HOLDS_BOUNDED", detail, bmc_engine, bound=steps,
                             timed_out=bool(prove and not live and res["timed_out"]))
        for c in covers:
            if c in reached:
                where = " beyond the BMC depth" if reached[c].get("deeper") else ""
                out[c] = Verdict(c, "COVER", "COVERED", f"Reached at step {reached[c]['step']}{where}.", bmc_engine,
                                 step=reached[c]["step"], trace_path=reached[c].get("vcd", ""))
            elif prove and c in proven:
                out[c] = Verdict(c, "COVER", "UNREACHABLE", "Can never be reached (proven).", kind_engine)
            elif res["bmc_depth"].get("cover", 0) < steps:
                out[c] = Verdict(c, "COVER", "TIMEOUT" if res["timed_out"] else "ERROR",
                                 f"cover search stopped at step {res['bmc_depth'].get('cover', 0)}", NAME)
            else:
                out[c] = Verdict(c, "COVER", "NOT_REACHED", f"Not reached within {steps} cycles.", bmc_engine,
                                 bound=steps)
        return out

    def _all(self, labels, types, verdict, detail, start) -> EngineResult:
        return EngineResult(NAME, ok=True, verdicts={l: Verdict(l, types.get(l, "ASSERT"), verdict, detail, NAME)
                                                     for l in labels}, seconds=_since(start))


def to_entries(result: EngineResult) -> list[dict]:
    """Verdicts in the shape of FormalService's assertion_results (the API and UI read these)."""
    from app.praman.services.formal_service import LEGACY_STATUS
    return [{"name": v.label, "type": v.kind, "verdict": v.verdict, "status": LEGACY_STATUS[v.verdict],
             "verdict_detail": v.detail, "message": v.detail, "step": v.step, "bound": v.bound,
             "engine": v.engine, "counterexample_vcd": v.trace_path, "tracefile": v.trace_path,
             "location": "", "file": "", "line": 0, "precondition": None, "elapsed_seconds": v.seconds}
            for v in result.verdicts.values()]


def merge_both(sby_entries: list[dict], native: EngineResult, portfolio=None) -> list[dict]:
    """engine 'both': every PROVEN carries the engines that proved it and
    its evidence level (app/engine/portfolio.py); an assertion is PROVEN
    only at L2 (two independent engines), a cover UNREACHABLE only when
    both engines show it.  A contradiction between conclusive results
    (one engine proves what another refutes) is an ERROR."""
    from app.praman.engine.crosscheck import classify
    from app.praman.engine.portfolio import level
    from app.praman.services.formal_service import LEGACY_STATUS
    out = []
    for entry in sby_entries:
        n = native.verdicts.get(entry["name"])
        entry = dict(entry)
        if n is None:
            out.append(entry)
            continue
        sby_v = entry["verdict"]
        entry["native_verdict"] = n.verdict
        proved_by = ({"sby"} if sby_v == "PROVEN" else set()) | ({"native"} if n.verdict == "PROVEN" else set())
        if portfolio is not None:
            proved_by |= portfolio.proved_by(entry["name"])
        refuted = "FAIL" in (sby_v, n.verdict)
        if classify(sby_v, n.verdict, entry.get("step") or 0, n.step) == "conflict" or (refuted and proved_by):
            entry.update(verdict="ERROR", verdict_detail=f"engines disagree: sby {sby_v}, native {n.verdict}"
                         + (f", proved by {', '.join(sorted(proved_by))}" if proved_by else ""))
        elif entry.get("type") == "COVER":
            if sby_v == "UNREACHABLE" and n.verdict != "UNREACHABLE":
                entry.update(verdict="NOT_REACHED", verdict_detail=entry.get("verdict_detail", "") +
                             f" Not confirmed by the native engine ({n.verdict}).")
        elif proved_by and not refuted:
            entry["proved_by"] = sorted(proved_by)
            entry["evidence_level"] = level(proved_by)
            if entry["evidence_level"] == "L2":
                entry.update(verdict="PROVEN", engine=" + ".join(sorted(proved_by)),
                             verdict_detail=f"Proven by {len(proved_by)} engines ({', '.join(sorted(proved_by))}).")
            else:
                entry.update(verdict="HOLDS_BOUNDED", verdict_detail=entry.get("verdict_detail", "") +
                             f" Proven by {', '.join(sorted(proved_by))} only (evidence level L1).")
        if entry["verdict"] == sby_v and "+ native" not in entry.get("engine", "") and n.verdict == sby_v:
            entry["engine"] = f"{entry.get('engine', '')} + {n.engine}".strip(" +")
        entry["status"] = LEGACY_STATUS[entry["verdict"]]
        out.append(entry)
    return out


def _since(start: float) -> float:
    return round(time.monotonic() - start, 2)
