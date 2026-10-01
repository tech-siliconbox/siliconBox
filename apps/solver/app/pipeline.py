"""One job from properties to result: lower the SVA, check each statement on its own, report.

Runs inside the sandbox (app.job_runner). Ported from formal-verify-backend
(FormalService.run_formal and _run_isolated_assertions) with these changes:
- work folders are made by the server inside `work_dir`; no request value names a path (finding 1)
- .sby files come from the checked template (finding 2)
- the time budget is for the whole job and the server sets it; process groups are killed (finding 3)
- results carry no server paths (finding 9); file-reading constructs are refused (finding 10)
"""

import re
import time
from dataclasses import dataclass
from pathlib import Path

from app.engine.sby_generator import (
    SbyConfig,
    SbyProject,
    SbyResult,
    generate_sby_project,
    generate_standalone_project_from_monitor,
    parse_sby_output,
)
from app.engine.sby_template import SbyTemplateError
from app.engine.sv_preprocessor import preprocess
from app.engine.sva_lowering import SVALoweringEngine
from app.engine.sva_parser import ParsedSVA, parse_sva
from app.engine.vcd import read_counterexample_vcd
from app.limits import MAX_LOG_CHARS, MAX_TRACES
from app.models import CheckResult, JobResult, JobSpec, RunSettings, error_result
from app.tools import SbyTool
from app.workspace import check_folder

DESIGN_FILE = "design.sv"
WRAPPER_TOP = "formal_wrapper"

# System tasks and directives that read or write files. A Drill never needs them, and in
# the runner they could read files outside the job (hardening finding 10).
FILE_ACCESS = re.compile(
    r"`\s*include\b|\$(?:readmem[hb]|writemem[hb]|fopen|fread|fgets|fgetc|fscanf|"
    r"fwrite|fdisplay|fstrobe|fmonitor|sformat|system|dumpfile|dumpvars)\b"
)
CHECK_LINE = re.compile(r"^\s*(\w+):\s*(assert|cover)\s*\(", re.MULTILINE)
DISABLE_LINE = re.compile(r"^(\s*)(\w+):\s*(assert|cover)\s*\(")
MODULE_NAME = re.compile(r"\bmodule\s+(\w+)")


@dataclass(frozen=True)
class Check:
    label: str
    kind: str  # "assert" or "cover"


@dataclass(frozen=True)
class Plan:
    """Everything needed to stage one check, worked out once per job."""

    settings: RunSettings
    parsed: ParsedSVA
    lowered: str
    design: str
    top_module: str
    work_dir: Path
    sby: SbyTool


def run_pipeline(spec: JobSpec, work_dir: Path, sby: SbyTool) -> JobResult:
    started = time.monotonic()
    if FILE_ACCESS.search(spec.design) or FILE_ACCESS.search(spec.properties):
        return error_result("File access (`include, $readmem, $fopen and similar) is not allowed.")
    try:
        parsed = parse_sva(spec.properties)
        lowered = SVALoweringEngine().lower(parsed)
    except Exception:  # noqa: BLE001  Any parser failure is the learner's syntax, reported plainly.
        return error_result("Your properties could not be read. Check the SVA syntax.")
    checks = [Check(label, kind) for label, kind in CHECK_LINE.findall(lowered)]
    if not checks:
        return error_result("No assert or cover statements were found in your properties.")

    design = preprocess(spec.design, DESIGN_FILE) if spec.design.strip() else ""
    plan = Plan(
        settings=spec.settings,
        parsed=parsed,
        lowered=lowered,
        design=design,
        top_module=_top_module(spec.settings, design, parsed),
        work_dir=work_dir,
        sby=sby,
    )
    deadline = started + spec.settings.timeout_seconds
    results = [_run_check(plan, index, check, deadline) for index, check in enumerate(checks, 1)]
    return _summarise(results, time.monotonic() - started, work_dir)


def _top_module(settings: RunSettings, design: str, parsed: ParsedSVA) -> str:
    if not design:
        return parsed.module_name
    if settings.top_module:
        return settings.top_module
    match = MODULE_NAME.search(design)
    return match.group(1) if match else ""


def _only(lowered: str, active: str) -> str:
    """The lowered monitor with every assert and cover except `active` turned off."""
    lines = []
    for line in lowered.splitlines():
        match = DISABLE_LINE.match(line)
        if match and match.group(2) != active:
            lines.append(f"{match.group(1)}begin end // disabled {match.group(3)} {match.group(2)}")
        else:
            lines.append(line)
    return "\n".join(lines)


def _mode_for(check: Check, mode: str) -> str:
    # Covers always run in cover mode. Asserts are skipped in cover mode, so they use bmc.
    if check.kind == "cover":
        return "cover"
    return "bmc" if mode == "cover" else mode


def _stage(plan: Plan, check: Check, run_dir: Path, timeout: int) -> SbyProject:
    monitor = _only(plan.lowered, check.label)
    settings = plan.settings
    mode = _mode_for(check, settings.mode)
    if not plan.design:
        return generate_standalone_project_from_monitor(
            monitor,
            plan.top_module,
            mode=mode,
            depth=settings.depth,
            solver=settings.solver,
            timeout=timeout,
            project_name="check",
            work_dir=str(run_dir),
        )
    config = SbyConfig(
        project_name="check",
        mode=mode,
        depth=settings.depth,
        engine="smtbmc",
        solver=settings.solver,
        timeout=timeout,
        top_module=plan.top_module,
        monitor_module=plan.parsed.module_name,
    )
    return generate_sby_project(config, {DESIGN_FILE: plan.design}, monitor, str(run_dir))


@dataclass(frozen=True)
class CheckRun:
    check: Check
    result: SbyResult
    run_dir: Path
    found: dict


def _run_check(plan: Plan, index: int, check: Check, deadline: float) -> CheckRun:
    run_dir = check_folder(plan.work_dir, index)
    remaining = int(deadline - time.monotonic())
    if remaining < 1:
        return _not_run(check, run_dir, "TIMEOUT", "The run's time limit was reached first.")
    try:
        project = _stage(plan, check, run_dir, remaining)
    except SbyTemplateError as error:
        return _not_run(check, run_dir, "ERROR", str(error))
    outcome = plan.sby.run(Path(project.sby_file), remaining)
    if outcome.timed_out:
        return _not_run(check, run_dir, "TIMEOUT", "The solver ran out of time.")
    result = parse_sby_output(outcome.stdout, outcome.stderr, outcome.returncode, str(run_dir))
    found = next(
        (
            row
            for row in result.assertion_results
            if row["name"] == check.label or row["name"].endswith(f".{check.label}")
        ),
        {"status": result.status, "step": 0, "message": result.error_message},
    )
    return CheckRun(check, result, run_dir, found)


def _not_run(check: Check, run_dir: Path, status: str, message: str) -> CheckRun:
    result = SbyResult(status=status, error_message=message)
    return CheckRun(check, result, run_dir, {"status": status, "step": 0, "message": message})


def _trace(run: CheckRun) -> dict | None:
    """The run's VCD, only if it sits inside this check's own folder."""
    root = run.run_dir.resolve()
    task_dir = run.result.log_paths.get("task_dir", "")
    tracefile = run.found.get("tracefile") or ""
    candidates = [Path(task_dir) / tracefile] if task_dir and tracefile else []
    if run.result.counterexample_vcd:
        candidates.append(Path(run.result.counterexample_vcd))
    for candidate in candidates:
        path = candidate.resolve()
        if path.is_relative_to(root) and path.is_file():
            trace = read_counterexample_vcd(path)
            return None if "error" in trace else trace
    return None


def _wants_trace(run: CheckRun, status: str) -> bool:
    # Failing asserts carry a counterexample; reached covers carry a witness.
    return (run.check.kind == "assert" and status == "FAIL") or (
        run.check.kind == "cover" and status == "PASS"
    )


def _check_result(run: CheckRun, traces_left: int, work_dir: Path) -> CheckResult:
    status = run.found.get("status", "ERROR")
    if status not in {"PASS", "FAIL", "TIMEOUT", "ERROR", "SKIPPED"}:
        status = "ERROR"
    trace = _trace(run) if traces_left > 0 and _wants_trace(run, status) else None
    step = run.found.get("step") or None
    return CheckResult(
        name=run.check.label,
        kind="cover" if run.check.kind == "cover" else "assert",
        status=status,
        step=step,
        message=_clean(str(run.found.get("message") or ""), work_dir)[:2000],
        trace=trace,
    )


def _overall(runs: list[CheckRun], checks: list[CheckResult]) -> str:
    if any(run.result.status == "FAIL" for run in runs):
        return "FAIL"
    for status in ("ERROR", "TIMEOUT"):
        if any(check.status == status for check in checks):
            return status
    return "PASS"


def _summarise(runs: list[CheckRun], elapsed: float, work_dir: Path) -> JobResult:
    checks: list[CheckResult] = []
    for run in runs:
        traces_left = MAX_TRACES - sum(1 for check in checks if check.trace is not None)
        checks.append(_check_result(run, traces_left, work_dir))
    first_fail = next((c for c in checks if c.kind == "assert" and c.status == "FAIL"), None)
    errors = [f"{c.name}: {c.message}" for c in checks if c.status == "ERROR" and c.message]
    log = "\n\n".join(f"=== {run.check.label} ===\n{run.result.engine_output}" for run in runs)
    return JobResult(
        status=_overall(runs, checks),
        elapsed_seconds=round(elapsed, 3),
        depth_reached=max((run.result.depth_reached for run in runs), default=0),
        checks=checks,
        failed_check=first_fail.name if first_fail else None,
        failure_cycle=first_fail.step if first_fail else None,
        message=_clean("\n".join(errors), work_dir)[:4000],
        log=_clean(log, work_dir)[-MAX_LOG_CHARS:],
    )


def _clean(text: str, work_dir: Path) -> str:
    """Removes the server's folder names from tool output (hardening finding 9)."""
    for prefix in {str(work_dir.resolve()), str(work_dir)}:
        text = text.replace(prefix + "/", "").replace(prefix, ".")
    return text
