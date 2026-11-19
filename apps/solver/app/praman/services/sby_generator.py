"""
SymbiYosys project staging and result parsing.

generate_files_project stages a project directory from ready-made sources
(the design with its monitors and harness, see sva/pipeline.py) and writes
the .sby file; parse_sby_output and the log readers turn a finished run into
per-property results.  Everything is staged into a clean working directory;
the user's sources are never modified.
"""

import os
import re
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field

# Tool output may carry names from learner code: parsed with defusedxml (hardening #2).
from defusedxml import ElementTree as ET

from app.praman.services.yosys_reader import VERILOG, read_commands
from app.workspace import remove_inside

# Label of the wrapper cover used by the assumption sanity check
SANITY_COVER_LABEL = "_va_sanity"

logger = logging.getLogger("veriassist.sby_gen")

# Base directory for all formal work
# FORMAL_WORK_DIR in the environment: the proof workers use the folder of the server that started them
FORMAL_WORK_DIR = Path(os.environ.get("FORMAL_WORK_DIR") or Path(__file__).parent.parent.parent / "data" / "formal_work")


@dataclass
class SbyProject:
    """A staged SymbiYosys project ready to run."""
    work_dir: str
    sby_file: str


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent space and special character syntax errors in .sby configs."""
    if not filename:
        return "dut.sv"
    base = os.path.basename(filename)
    name, ext = os.path.splitext(base)
    if not ext:
        ext = ".sv"
    clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', name)
    clean_name = re.sub(r'_+', '_', clean_name).strip('_')
    if not clean_name:
        clean_name = "dut"
    return f"{clean_name}{ext}"


def generate_files_project(
    work_dir: str,
    project_name: str,
    files: dict[str, str],
    top: str,
    mode: str = "bmc",
    depth: int = 20,
    engine: str = "smtbmc",
    solver: str = "",
    timeout: int = 0,
    reader: str = VERILOG,
    multiclock: bool = False,
    extra_script: Optional[list[str]] = None,
    prep_script: Optional[list[str]] = None,
) -> SbyProject:
    """Stage a project from ready-made sources (design with monitors
    already instantiated); `top` is the top module, `reader` the Yosys
    front end (see yosys_reader)."""
    project_dir = Path(work_dir)
    if project_dir.exists():
        remove_inside(project_dir, FORMAL_WORK_DIR)
    src_dir = project_dir / "src"
    src_dir.mkdir(parents=True)

    names = []
    for name, text in files.items():
        clean = sanitize_filename(name)
        (src_dir / clean).write_text(text)
        names.append(clean)

    lines = [
        "[tasks]", mode, "",
        "[options]",
        f"{mode}: mode {mode}",
        *([f"{mode}: depth {depth}"] if mode != "live" else []),   # live mode has no depth
        *([f"{mode}: timeout {timeout}"] if timeout else []),
        *([f"{mode}: multiclock on"] if multiclock else []),
        "",
        "[engines]",
        # several engines (one per line) race; the first conclusive one wins
        *(engine + (f" {solver}" if solver else "")).split("\n"),
        "",
        "[script]",
        *read_commands(names, top, reader),
        *(prep_script or []),         # e.g. connections after flattening (read -sv)
        f"prep -top {top}",
        *(extra_script or []),        # e.g. a design mutation
        "",
        "[files]",
        *[f"{n} src/{n}" for n in names],
        "",
    ]
    sby_path = project_dir / f"{project_name}.sby"
    sby_path.write_text("\n".join(lines))
    return SbyProject(work_dir=str(project_dir), sby_file=str(sby_path))


@dataclass
class SbyResult:
    """Parsed result from a SymbiYosys run."""
    status: str = "unknown"        # PASS | FAIL | VACUOUS | TIMEOUT | ERROR
    raw_status: str = ""           # sby's own: PASS | FAIL | UNKNOWN (the engines ended without deciding) | TIMEOUT | ERROR
    return_code: int = -1
    elapsed_seconds: float = 0.0
    depth_reached: int = 0
    failed_assertions: list[dict] = field(default_factory=list)  # [{name, file, line, step}]
    counterexample_vcd: str = ""   # path to VCD file if FAIL
    engine_output: str = ""        # raw sby stdout
    stderr_output: str = ""        # raw sby stderr
    error_message: str = ""
    detailed_logs: dict[str, str] = field(default_factory=dict)
    log_paths: dict[str, str] = field(default_factory=dict)
    assertion_results: list[dict] = field(default_factory=list)  # [{name, status, verdict, type, location, message, tracefile}]
    sanity: dict = field(default_factory=dict)   # assumption sanity check: {status, message}
    harness: dict = field(default_factory=dict)  # reset used by the harness: {signal, active_low, source}


def parse_sby_output(stdout: str, stderr: str, returncode: int, work_dir: str) -> SbyResult:
    """Parse SymbiYosys stdout/stderr into structured result."""
    import re

    detailed_logs, log_paths = _collect_sby_logs(work_dir)
    result = SbyResult(
        return_code=returncode,
        engine_output=stdout,
        stderr_output=stderr,
        detailed_logs=detailed_logs,
        log_paths=log_paths,
    )

    result.raw_status = {0: "PASS", 1: "PASS", 2: "FAIL", 4: "UNKNOWN", 8: "TIMEOUT", 16: "ERROR"}.get(returncode, "")
    # Determine status from return code and output
    if returncode == 0:
        result.status = "PASS"
    elif returncode == 2:
        result.status = "FAIL"
    elif returncode in (4, 8):          # 4: sby UNKNOWN (reported as before), 8: sby's own time limit
        result.status = "TIMEOUT"
    else:
        result.status = "ERROR"
        result.error_message = stderr or stdout

    if not result.error_message and result.status == "ERROR":
        result.error_message = (
            detailed_logs.get("sby_log")
            or detailed_logs.get("engine_log")
            or stderr
            or stdout
        )

    # Extract elapsed time
    time_match = re.search(r'Elapsed clock time.*?:\s*([\d:.]+)\s*\((\d+)\)', stdout)
    if time_match:
        result.elapsed_seconds = float(time_match.group(2))

    # Extract depth reached
    step_matches = re.findall(r'Checking assertions in step (\d+)', stdout)
    if step_matches:
        result.depth_reached = max(int(s) for s in step_matches) + 1

    # Extract failed assertions
    fail_pattern = re.compile(
        r'failed assertion (\S+) at (\S+):(\d+)(?:\.(\d+))?\s+step (\d+)'
    )
    for m in fail_pattern.finditer(stdout):
        result.failed_assertions.append({
            "name": m.group(1),
            "file": m.group(2),
            "line": int(m.group(3)),
            "step": int(m.group(5)),
        })

    # Find counterexample VCD
    vcd_match = re.search(r'counterexample trace:\s*(\S+)', stdout)
    if vcd_match:
        vcd_path = os.path.join(work_dir, vcd_match.group(1))
        if os.path.exists(vcd_path):
            result.counterexample_vcd = vcd_path

    # Extract engine status
    status_match = re.search(r'engine_\d+.*?returned (\w+)', stdout)
    if status_match:
        engine_status = status_match.group(1).upper()
        if engine_status == "PASS":
            result.status = "PASS"
        elif engine_status in ("FAIL", "FAILED"):
            result.status = "FAIL"

    result.assertion_results = _parse_assertion_results_from_junit(
        detailed_logs.get("junit_xml", "")
    )

    # Don't trust PASS entries from JUnit XML when sby itself errored —
    # sby may emit empty testcase elements (parsed as PASS) for assertions
    # that were never reached because prep/elaboration failed.  Its
    # "skipped" entries mean the same: never checked (e.g. a model pass
    # failed), and must not become a bounded pass later.
    # (Contradictory assumptions also end the run early - "Assumptions are
    # unsatisfiable" - but that is a result: the sanity check makes it VACUOUS.)
    log = stdout + detailed_logs.get("engine_log", "")
    preunsat = "Assumptions are unsatisfiable" in log or "Status: PREUNSAT" in log
    if result.status == "ERROR" and result.assertion_results:
        for a in result.assertion_results:
            if a.get("status") == "PASS" or (a.get("status") == "SKIPPED" and not preunsat):
                a["status"] = "ERROR"
                a["message"] = a.get("message") or (result.error_message or "").strip()[-300:]

    # Fallback: extract per-property rows from engine/sby logs when no JUnit XML.
    if not result.assertion_results:
        result.assertion_results = _parse_assertion_results_from_logs(
            detailed_logs.get("engine_log", "") or
            detailed_logs.get("sby_log", "") or
            stdout
        )

    # JUnit XML carries no step numbers; take them from the engine log.
    log_steps = _steps_from_log(stdout)
    for assertion in result.assertion_results:
        if not assertion.get("step"):
            label = assertion["name"].split(".")[-1]
            assertion["step"] = log_steps.get(label, 0)

    # Keep failed_assertions aligned with parsed assertion results when possible.
    if result.assertion_results:
        xml_failed = []
        for assertion in result.assertion_results:
            if assertion["status"] != "FAIL":
                continue
            xml_failed.append({
                "name": assertion["name"],
                "file": assertion.get("file", ""),
                "line": assertion.get("line", 0),
                "step": assertion.get("step", 0),
                "message": assertion.get("message", ""),
            })
        if xml_failed:
            result.failed_assertions = xml_failed

    return result


def _steps_from_log(log_text: str) -> dict[str, int]:
    """{label: step} for failed assertions and reached covers in an sby log.

    smtbmc prints "Reached cover statement in step N at <scope>: <label>" for
    covers, and "Assert failed in <scope>: <label>" after the
    "Checking assertions in step N.." line of the failing step.
    """
    steps: dict[str, int] = {}
    current_step = 0
    for line in log_text.splitlines():
        m = re.search(r'Checking assertions in step (\d+)', line)
        if m:
            current_step = int(m.group(1))
            continue
        # the scope may be an escaped identifier ("in top.\u.__va_mon : label")
        m = re.search(r'Assert failed in [^:]+:\s*(?:[\w.$\\]*\.)?(\w+)', line)
        if m:
            steps.setdefault(m.group(1), current_step)
            continue
        m = re.search(r'Reached cover statement in step (\d+) at [^:]+:\s*(?:[\w.$\\]*\.)?(\w+)', line)
        if m:
            steps.setdefault(m.group(2), int(m.group(1)))
    return steps


def _collect_sby_logs(work_dir: str) -> tuple[dict[str, str], dict[str, str]]:
    """
    Collect the most relevant staged SymbiYosys logs for API responses.

    We prefer the task directory (e.g. *_bmc) because it contains the
    user-actionable build/prover logs for PASS/FAIL/ERROR runs.
    """
    logs: dict[str, str] = {}
    paths: dict[str, str] = {}

    if not work_dir or not os.path.isdir(work_dir):
        return logs, paths

    task_dirs = []
    for entry in os.scandir(work_dir):
        if entry.is_dir() and os.path.isfile(os.path.join(entry.path, "logfile.txt")):
            task_dirs.append(entry.path)

    task_dir = str(max(task_dirs, key=os.path.getmtime)) if task_dirs else ""
    if task_dir:
        paths["task_dir"] = task_dir
        _read_log_file(task_dir, "logfile.txt", "sby_log", logs, paths)
        _read_log_file(task_dir, os.path.join("engine_0", "logfile.txt"), "engine_log", logs, paths)
        _read_log_file(task_dir, "status", "task_status", logs, paths)
        _read_log_file(task_dir, "status.path", "status_path", logs, paths)

        for marker in ("PASS", "FAIL", "ERROR", "TIMEOUT", "UNKNOWN"):
            marker_path = os.path.join(task_dir, marker)
            if os.path.isfile(marker_path):
                paths["marker_file"] = marker_path
                logs["marker_name"] = marker
                try:
                    logs["marker_contents"] = open(marker_path, "r", encoding="utf-8", errors="replace").read()
                except OSError:
                    pass
                break

        xml_files = [
            name for name in os.listdir(task_dir)
            if name.endswith(".xml") and os.path.isfile(os.path.join(task_dir, name))
        ]
        if xml_files:
            xml_name = sorted(xml_files)[0]
            _read_log_file(task_dir, xml_name, "junit_xml", logs, paths)

    return logs, paths


def _read_log_file(
    root_dir: str,
    relative_path: str,
    key: str,
    logs: dict[str, str],
    paths: dict[str, str],
) -> None:
    """Read a log file if present and store both content and absolute path."""
    full_path = os.path.join(root_dir, relative_path)
    if not os.path.isfile(full_path):
        return

    paths[f"{key}_path"] = full_path
    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            logs[key] = f.read()
    except OSError:
        return


def _parse_assertion_results_from_logs(log_text: str) -> list[dict]:
    """
    Fallback parser: extract per-property rows from sby/smtbmc log text
    when JUnit XML is not available.

    Handles patterns emitted by smtbmc and sby task logs:
      - "Assert cover property <name>"
      - "Assert failed in <name>"
      - "Reached cover point <name>"
      - "assert <name> passed" / "assert <name> failed at step N"
      - "cover <name> reached" / "cover <name> unreachable"
    """
    results: list[dict] = []
    seen: set[str] = set()

    def add(name: str, typ: str, status: str, step: int = 0):
        if name in seen:
            return
        seen.add(name)
        results.append({
            "name": name,
            "status": status,
            "type": typ,
            "location": "",
            "file": "",
            "line": 0,
            "step": step,
            "message": "",
            "tracefile": "",
        })

    # smtbmc: "assert <name> passed" / "assert <name> failed at step N"
    for m in re.finditer(r'\bassert\s+([\w.:/]+)\s+(passed|failed)(?:\s+at\s+step\s+(\d+))?', log_text, re.IGNORECASE):
        status = "PASS" if m.group(2).lower() == "passed" else "FAIL"
        add(m.group(1), "ASSERT", status, int(m.group(3) or 0))

    # smtbmc: "cover <name> reached" / "cover <name> unreachable"
    for m in re.finditer(r'\bcover\s+([\w.:/]+)\s+(reached|unreachable)', log_text, re.IGNORECASE):
        status = "PASS" if m.group(2).lower() == "reached" else "SKIPPED"
        add(m.group(1), "COVER", status)

    # smtbmc: "Assert failed in <hierarchy.name>"
    for m in re.finditer(r'Assert failed in ([\w.:/]+)', log_text):
        add(m.group(1), "ASSERT", "FAIL")

    # smtbmc: "Reached cover point <name>"
    for m in re.finditer(r'Reached cover point ([\w.:/]+)', log_text):
        add(m.group(1), "COVER", "PASS")

    # sby: "Assert cover property <name>" then "Status: PASSED/FAILED"
    # Collect block-level pass/fail
    for m in re.finditer(r'checking\s+(?:property|assertion)\s+([\w.:/]+)[^\n]*\n(?:.*\n)*?.*?status[:\s]+(pass|fail)', log_text, re.IGNORECASE):
        status = "PASS" if "pass" in m.group(2).lower() else "FAIL"
        add(m.group(1), "ASSERT", status)

    return results


def _parse_assertion_results_from_junit(junit_xml: str) -> list[dict]:
    """Parse per-assertion pass/fail/skipped results from SBY's JUnit XML."""
    if not junit_xml.strip():
        return []

    try:
        root = ET.fromstring(junit_xml)
    except ET.ParseError:
        return []

    assertions: list[dict] = []
    for testcase in root.findall(".//testcase"):
        assertion_id = testcase.attrib.get("id", "")
        assertion_type = testcase.attrib.get("type", "")
        if not assertion_id or assertion_type not in {"ASSERT", "ASSUME", "COVER"}:
            continue

        location = testcase.attrib.get("location", "")
        tracefile = testcase.attrib.get("tracefile", "")
        message = ""
        step = 0

        failure = testcase.find("failure")
        error = testcase.find("error")
        skipped = testcase.find("skipped")

        if failure is not None:
            status = "FAIL"
            message = failure.attrib.get("message", "") or (failure.text or "").strip()
        elif error is not None:
            status = "ERROR"
            message = error.attrib.get("message", "") or (error.text or "").strip()
        elif skipped is not None:
            status = "SKIPPED"
            message = skipped.attrib.get("message", "") or (skipped.text or "").strip()
        else:
            status = "PASS"

        step_match = re.search(r"step (\d+)", message)
        if step_match:
            step = int(step_match.group(1))

        file_name = ""
        line = 0
        if location:
            loc_match = re.match(r"([^:]+):(\d+)", location)
            if loc_match:
                file_name = loc_match.group(1)
                line = int(loc_match.group(2))

        assertions.append({
            "name": assertion_id,
            "status": status,
            "type": assertion_type,
            "location": location,
            "file": file_name,
            "line": line,
            "step": step,
            "message": message,
            "tracefile": tracefile,
        })

    return assertions
