"""
Counterexample and cover traces of a finished job: which trace file belongs
to a property, and what it means for the property (sva/debug.explain_trace).
Shared by the waveform/debug endpoints and the verification report.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from app.praman.services.formal_service import FormalJob, format_counterexample_for_llm, read_counterexample_vcd
from app.praman.services.sva.debug import explain_trace

logger = logging.getLogger("veriassist.counterexample")


def resolve_trace(job: FormalJob, assertion_name: str = "") -> tuple[Optional[dict], str]:
    """Resolve the most relevant VCD path for a job or a specific assertion."""
    if not job.result:
        return None, ""

    target_name = (assertion_name or "").strip()
    assertion_results = job.result.assertion_results or []
    selected_assertion = None

    if target_name:
        selected_assertion = next(
            (assertion for assertion in assertion_results if assertion.get("name") == target_name),
            None,
        )
        if not selected_assertion:
            return None, ""

    candidates = []
    if selected_assertion:
        candidates.extend(_candidate_paths(job, selected_assertion))
    else:
        if job.result.counterexample_vcd:
            candidates.append(job.result.counterexample_vcd)
        for assertion in assertion_results:
            assertion_candidates = _candidate_paths(job, assertion)
            if not assertion_candidates:
                continue
            candidates.extend(assertion_candidates)
            selected_assertion = assertion
            if any(candidate and os.path.exists(candidate) for candidate in assertion_candidates):
                break

    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return selected_assertion, candidate

    return selected_assertion, ""


def _candidate_paths(job: FormalJob, assertion: dict) -> list[str]:
    """Build possible absolute trace paths from assertion metadata."""
    candidates: list[str] = []
    direct_path = (assertion.get("counterexample_vcd") or "").strip()
    if direct_path:
        candidates.append(direct_path)

    tracefile = (assertion.get("tracefile") or "").strip()
    if not tracefile:
        return candidates

    if os.path.isabs(tracefile):
        candidates.append(tracefile)
        return candidates

    base_dirs = [
        assertion.get("project_dir") or "",
        assertion.get("log_paths", {}).get("task_dir", ""),
        job.result.log_paths.get("task_dir", "") if job.result else "",
        job.sby_project_dir or "",
    ]
    for base_dir in base_dirs:
        if base_dir:
            candidates.append(os.path.join(base_dir, tracefile))

    return candidates


def explain(job: FormalJob, assertion: Optional[dict], vcd_path: str) -> Optional[dict]:
    """The property's conditions and signals per cycle with a short
    explanation (None when the trace cannot be explained)."""
    selected = assertion or {}
    name = selected.get("name", "")
    if name in job.debug_info:
        try:
            return explain_trace(vcd_path, job.debug_info[name], name,
                                 selected.get("trace_kind") or selected.get("type", "ASSERT"),
                                 live_index=selected.get("live_index", 0))
        except Exception as e:  # never block the waveform on the explanation
            logger.warning(f"Could not explain trace for {name}: {e}")
    if selected.get("trace_kind") == "EQUIV":
        # equivalence: inputs and both versions' outputs, and what differs
        return {"explanation": selected.get("explanation", []),
                "event_cycle": selected.get("difference_cycle"),
                "signal_paths": selected.get("signals", []),
                "cycles": [], "conditions": [], "signals": [], "locals": []}
    return None


TRACE_SIGNALS = 2000          # signals of a trace sent to the waveform view (all of most designs)


def viewer_trace(vcd_path: str, prefer: list[str]) -> dict:
    """The trace for the waveform view: every signal (up to TRACE_SIGNALS, the
    property's first), each value change as {time, value}."""
    data = read_counterexample_vcd(vcd_path, max_signals=TRACE_SIGNALS, prefer=prefer,
                                   per_signal=1_000_000, max_timepoints=1_000_000)
    if "error" in data:
        return data
    for sig in data["signal_details"]:
        sig["transitions"] = [{"time": t["time"], "value": t["value"]} for t in sig["transitions"]]
    data.pop("timeline", None)
    data.pop("transitions", None)
    return data


def trace_payload(job: FormalJob, assertion_name: str = "") -> Optional[dict]:
    """What the waveform view shows for a property of a finished job: the
    trace, the explanation of the property on it, and a text summary.
    None if the job has no trace for it."""
    selected, vcd_path = resolve_trace(job, assertion_name)
    if not vcd_path or job.result is None:
        return None
    debug = explain(job, selected, vcd_path)
    prefer = (debug or {}).get("signal_paths", [])
    summary = format_counterexample_for_llm(read_counterexample_vcd(vcd_path, prefer=prefer))
    if debug and debug.get("explanation"):
        summary = "\n".join(debug["explanation"]) + "\n\n" + summary
    return {
        "job_id": job.job_id,
        "assertion": selected,
        "vcd_path": vcd_path,
        "vcd_data": viewer_trace(vcd_path, prefer),
        "debug": debug,
        "llm_summary": summary,
        "failed_assertions": job.result.failed_assertions,
    }


def drivers_payload(job: FormalJob, signal: str, cycle: int, assertion: str = "") -> dict:
    """Statements driving `signal` (hierarchical path, as in the trace), with
    the values they read on the property's trace: at `cycle` for combinational
    logic, at cycle-1 for clocked assignments (their value at `cycle` was
    computed then).  {"error": ...} when they cannot be traced."""
    from app.praman.services.compile_worker import run_isolated
    from app.praman.services.sv_preprocessor import preprocess
    from app.praman.services.sva.debug import _fmt, _read_steps
    from app.praman.services.sva.drivers import find_drivers, find_drivers_on_trace
    files = {}
    if job.dut_code:
        files[job.dut_filename or "design.sv"] = preprocess(job.dut_code, job.dut_filename)
    if job.sva_code.strip():
        files["sva.sv"] = job.sva_code
    _, vcd_path = resolve_trace(job, assertion)
    try:
        traced = run_isolated(find_drivers, files, job.dut_top, signal)
    except Exception as e:
        return {"error": f"Could not trace drivers: {e}"}
    if not vcd_path:
        return traced
    wanted = {signal} | {r for d in traced["drivers"] for r in d["reads"]}
    trace = _read_steps(vcd_path, wanted)
    steps = trace["steps"]

    def value(path: str, at: int) -> str:
        series = trace["values"].get(path)
        v = series[at] if series is not None and 0 <= at < len(steps) else None
        return "?" if v is None else _fmt(v, trace["widths"].get(path, 1))

    # again, now evaluating each driver's branch conditions on the trace
    traced = run_isolated(find_drivers_on_trace, files, job.dut_top, signal, trace["values"], cycle)
    traced["cycle"] = cycle
    traced["value"] = value(signal, cycle)
    for d in traced["drivers"]:
        at = cycle - 1 if d["clocked"] else cycle
        d["values_at"] = at
        d["values"] = {r: value(r, at) for r in d["reads"]}
    return traced
