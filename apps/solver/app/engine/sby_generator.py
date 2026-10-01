"""
VeriAssist v2.0 — SymbiYosys Project Generator

Creates complete SymbiYosys (.sby) project directories containing:
- DUT source files
- Lowered formal monitor (from sva_lowering.py)
- .sby configuration file
- Ready to run: sby -f project.sby

The generator never modifies the user's source tree — everything
is staged into a clean working directory.
"""

import contextlib
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

from defusedxml import ElementTree as ET

from app.engine.sby_template import SbySettings, render_sby

logger = logging.getLogger("veriassist.sby_gen")

# Fixed file names: nothing from a request becomes a file or folder name.
MONITOR_FILE = "monitor.sv"
SBY_FILE = "run.sby"


@dataclass
class SbyConfig:
    """Configuration for a SymbiYosys project."""

    project_name: str = "formal_check"
    mode: str = "bmc"  # bmc | prove | cover
    depth: int = 20  # BMC depth (number of cycles)
    engine: str = "smtbmc"  # smtbmc | abc | aiger
    solver: str = ""  # yices | z3 | boolector (empty = default)
    timeout: int = 300  # seconds
    top_module: str = ""  # DUT top module name
    monitor_module: str = ""  # lowered formal monitor module name
    dut_files: list[str] = field(default_factory=list)
    monitor_file: str = ""  # lowered monitor .sv file
    multiclock: bool = False


@dataclass
class SbyProject:
    """A staged SymbiYosys project ready to run."""

    work_dir: str
    sby_file: str
    dut_files: list[str]
    monitor_file: str
    config: SbyConfig


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent space and special character syntax errors in .sby configs."""
    if not filename:
        return "dut.sv"
    base = os.path.basename(filename)
    name, ext = os.path.splitext(base)
    if not ext:
        ext = ".sv"
    clean_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", name)
    clean_name = re.sub(r"_+", "_", clean_name).strip("_")
    if not clean_name:
        clean_name = "dut"
    return f"{clean_name}{ext}"


def generate_sby_project(
    config: SbyConfig,
    dut_contents: dict[str, str],  # {filename: content}
    monitor_content: str,  # lowered RTL from sva_lowering
    work_dir: str,
) -> SbyProject:
    """
    Generate a complete SymbiYosys project.

    Args:
        config: SbyConfig with project settings
        dut_contents: dict mapping filenames to their SystemVerilog content
        monitor_content: lowered formal monitor code (from sva_lowering.py)
        work_dir: optional custom work directory path

    Returns:
        SbyProject with paths to all generated files
    """
    # Sanitize DUT filenames to prevent spaces/special chars from breaking .sby syntax
    dut_contents = {sanitize_filename(fname): content for fname, content in dut_contents.items()}

    # The caller passes a fresh folder inside its own work root; nothing is deleted here
    # (hardening finding 1).
    project_dir = Path(work_dir)
    project_dir.mkdir(exist_ok=False)
    src_dir = project_dir / "src"
    src_dir.mkdir()

    logger.info(f"Staging SymbiYosys project in {project_dir}")

    # Write DUT files
    staged_dut_files = []
    for filename, content in dut_contents.items():
        filepath = src_dir / filename
        filepath.write_text(content)
        staged_dut_files.append(f"src/{filename}")
        logger.info(f"  Staged DUT: {filename}")

    # Write monitor file
    monitor_filename = MONITOR_FILE
    monitor_path = src_dir / monitor_filename
    monitor_path.write_text(monitor_content)
    staged_monitor = f"src/{monitor_filename}"
    logger.info(f"  Staged monitor: {monitor_filename}")

    # Generate .sby file
    # Generate wrapper that instantiates DUT + monitor together
    wrapper_content = _generate_wrapper(config, dut_contents, monitor_content)
    has_wrapper = bool(wrapper_content)
    if wrapper_content:
        wrapper_path = src_dir / "formal_wrapper.sv"
        wrapper_path.write_text(wrapper_content)
        logger.info("  Generated: formal_wrapper.sv")

    # Generate .sby file
    sby_content = _generate_sby_config(
        config, staged_dut_files, staged_monitor, has_wrapper=has_wrapper
    )
    sby_path = project_dir / SBY_FILE
    sby_path.write_text(sby_content)
    logger.info("  Generated: run.sby")

    project = SbyProject(
        work_dir=str(project_dir),
        sby_file=str(sby_path),
        dut_files=staged_dut_files,
        monitor_file=staged_monitor,
        config=config,
    )

    logger.info(f"SymbiYosys project ready: {sby_path}")
    return project


def _generate_sby_config(
    config: SbyConfig,
    dut_files: list[str],
    monitor_file: str,
    has_wrapper: bool = False,
) -> str:
    """Generate the .sby configuration file content from the checked template."""
    has_wrapper = bool(has_wrapper and config.top_module and config.monitor_module)
    sources = [*dut_files, monitor_file]
    if has_wrapper:
        sources.append("src/formal_wrapper.sv")
    files = [(source.split("/")[-1], source) for source in sources]
    return render_sby(
        SbySettings(
            mode=config.mode,
            solver=config.solver,
            depth=config.depth,
            timeout_seconds=config.timeout,
            top_module="formal_wrapper" if has_wrapper else config.top_module,
        ),
        files,
    )


def _generate_wrapper(
    config: SbyConfig,
    dut_contents: dict[str, str],
    monitor_content: str,
) -> str | None:
    """
    Generate a wrapper module that instantiates both the DUT and the
    formal monitor, connecting them with matching signals.

    This is needed because the lowered monitor is a separate module
    that needs to observe the DUT's signals.
    """
    if not config.top_module or not config.monitor_module:
        return None

    # Extract DUT ports by parsing the first DUT file
    dut_code = list(dut_contents.values())[0]
    dut_ports = _extract_module_ports(dut_code, config.top_module)
    if not dut_ports:
        logger.warning(f"Could not extract ports from DUT module '{config.top_module}'")
        return None

    # Extract parameter defaults so the wrapper can emit localparams,
    # making parameterized width expressions (e.g. [DWIDTH-1:0]) evaluable.
    dut_params = _extract_module_params(dut_code, config.top_module)

    dut_port_names = {port["name"] for port in dut_ports}
    actual_clock, actual_reset = _pick_clock_reset_ports(dut_ports)

    lines = []
    lines.append("`ifdef FORMAL")
    lines.append("module formal_wrapper (")
    lines.append("    input wire clk,")
    lines.append("    input wire rst_n")
    lines.append(");")
    lines.append("")

    # Emit localparams for every DUT parameter so parameterized width
    # expressions like [DWIDTH-1:0] are evaluable by yosys in this wrapper.
    if dut_params:
        for pname, pval in dut_params.items():
            lines.append(f"    localparam {pname} = {pval};")
        lines.append("")

    # Alias wrapper ports to DUT's actual clock/reset names so .* connects them
    if actual_clock and actual_clock != "clk":
        lines.append(f"    wire {actual_clock} = clk;")
    if actual_reset and actual_reset != "rst_n":
        lines.append(f"    wire {actual_reset} = rst_n;")
    if actual_clock or actual_reset:
        lines.append("")

    # Declare wires for all non-clock/non-reset DUT ports so .* can bind them.
    # Keep parameterized widths as-is — the localparams above make them valid.
    declared_wires: set[str] = {actual_clock or "clk", actual_reset or "rst_n", "clk", "rst_n"}
    for port in dut_ports:
        if port["name"] in declared_wires:
            continue
        declared_wires.add(port["name"])
        width = port.get("width", "")
        width_str = f"{width} " if width else ""
        if port["direction"] == "output":
            lines.append(f"    wire {width_str}{port['name']};")
        else:
            lines.append(f"    (* anyseq *) wire {width_str}{port['name']};")

    lines.append("")

    # Instantiate DUT using .* — robust against multi-port declarations and
    # parameterised widths that the regex parser may miss.
    lines.append(f"    {config.top_module} u_dut (")
    lines.append("        .*")
    lines.append("    );")
    lines.append("")

    # Instantiate monitor — connect each port explicitly via signal resolution
    monitor_ports = _extract_module_ports(monitor_content, config.monitor_module)
    extra_monitor_decls = []
    mon_connections = []

    if monitor_ports:
        for port in monitor_ports:
            resolved_name = _resolve_monitor_signal(
                port["name"], dut_port_names, actual_clock, actual_reset
            )
            if resolved_name is None:
                # Signal not in DUT — declare a free anyseq wire for it
                if port["name"] not in declared_wires:
                    declared_wires.add(port["name"])
                    width = port.get("width", "")
                    if width and not re.match(r"^\[\s*\d+\s*:\s*\d+\s*\]$", width):
                        width = "[7:0]"
                    width_str = f"{width} " if width else ""
                    extra_monitor_decls.append(f"    (* anyseq *) wire {width_str}{port['name']};")
                resolved_name = port["name"]
            mon_connections.append(f"        .{port['name']}({resolved_name})")

        if extra_monitor_decls:
            lines.extend(extra_monitor_decls)
            lines.append("")

        lines.append(f"    {config.monitor_module} u_monitor (")
        lines.append(",\n".join(mon_connections))
    else:
        lines.append(f"    {config.monitor_module} u_monitor (")
        lines.append("        .*")

    lines.append("    );")
    lines.append("")

    # Assume reset is active for at least the first cycle so DUT registers
    # initialise before assertions fire.  Target the DUT's actual reset name.
    reset_port = actual_reset or "rst_n"
    lines.append("    // Assume reset is active for at least the first cycle")
    lines.append("    reg _va_past_valid;")
    lines.append("    always @(posedge clk) begin")
    lines.append("        if (!_va_past_valid)")
    lines.append("            _va_past_valid <= 1;")
    lines.append("    end")
    lines.append("    initial _va_past_valid = 0;")
    lines.append("    always @(*) begin")
    lines.append("        if (!_va_past_valid)")
    lines.append(f"            assume(!{reset_port});")
    lines.append("    end")
    lines.append("")

    lines.append("endmodule")
    lines.append("`endif")

    return "\n".join(lines)


def _extract_module_ports(code: str, module_name: str) -> list[dict]:
    """Extract port list from a module declaration.
    Handles parameterized modules: module name #(params)(ports);
    """

    # Try with specific module name — with optional #(params)
    pattern = re.compile(
        rf"module\s+{re.escape(module_name)}\s*"
        r"(?:#\s*\([\s\S]*?\)\s*)?"  # optional #(parameter list)
        r"\(([\s\S]*?)\)\s*;",
        re.MULTILINE,
    )
    m = pattern.search(code)
    if not m:
        # Try without specific module name — with optional #(params)
        m = re.search(r"module\s+\w+\s*(?:#\s*\([\s\S]*?\)\s*)?\(([\s\S]*?)\)\s*;", code)
        if not m:
            return []

    port_text = m.group(1)
    # Strip // line comments and /* block comments */ before tokenising
    port_text_clean = re.sub(r"//[^\n]*", "", port_text)
    port_text_clean = re.sub(r"/\*[\s\S]*?\*/", "", port_text_clean)
    ports = []

    # Token-stream parser for ANSI-style port lists.
    # Handles all of:
    #   input rstn, clk, wr_en, rd_en,
    #   input [DWIDTH-1:0] din,
    #   output reg [DWIDTH-1:0] dout,
    #   output empty, full
    #
    # Algorithm: scan tokens left-to-right, tracking the "current direction"
    # and "current width".  A direction keyword resets both.  Every identifier
    # token that follows a direction (directly or after a width) is a port name.
    KEYWORDS = {"input", "output", "inout", "wire", "logic", "reg", "signed", "unsigned"}
    DIRECTIONS = {"input", "output", "inout"}

    # Tokenise: direction/type keywords, [width] brackets, identifiers, commas
    token_re = re.compile(
        r"\[([^\]]*)\]"  # bracket width group (group 1)
        r"|(input|output|inout|wire|logic|reg|signed|unsigned)"  # keyword (group 2)
        r"|(\b\w+\b)"  # identifier (group 3)
        r"|([,;])",  # punctuation (group 4)
        re.IGNORECASE,
    )

    cur_dir = None
    cur_type = "wire"
    cur_width = ""
    seen_names: set[str] = set()

    for tok in token_re.finditer(port_text_clean):
        bracket, keyword, ident, punct = tok.groups()

        if bracket is not None:
            cur_width = f"[{bracket}]"
            continue

        if keyword is not None:
            kw = keyword.lower()
            if kw in DIRECTIONS:
                cur_dir = kw
                cur_type = "wire"
                cur_width = ""
            elif kw in {"wire", "logic", "reg"}:
                cur_type = kw
            # signed/unsigned: ignore, leave width as-is
            continue

        if ident is not None:
            if cur_dir and ident not in KEYWORDS and ident not in seen_names:
                seen_names.add(ident)
                ports.append(
                    {
                        "direction": cur_dir,
                        "type": cur_type,
                        "width": cur_width,
                        "name": ident,
                    }
                )
            # After seeing a name, the width does NOT reset — same width applies
            # to sibling names.  But direction stays too.
            continue

        if punct == ";" or punct == ",":
            # comma: next ident gets same dir/type/width
            # semicolon: end of declaration
            if punct == ";":
                cur_dir = None
                cur_width = ""
            continue

    if ports:
        return ports

    header_names = _extract_header_port_names(port_text)
    if not header_names:
        return []

    return _extract_non_ansi_port_decls(code, header_names)


def _extract_module_params(code: str, module_name: str) -> dict[str, str]:
    """Extract parameter names and their default values from a module's #() block.

    For:  module fifo #(parameter DEPTH=8, DWIDTH=16) (...)
    Returns: {"DEPTH": "8", "DWIDTH": "16"}
    """
    # Match the #(…) parameter block
    pat = re.compile(rf"module\s+{re.escape(module_name)}\s*#\s*\(([^)]+)\)", re.MULTILINE)
    m = pat.search(code)
    if not m:
        return {}

    param_text = m.group(1)
    # Strip comments
    param_text = re.sub(r"//[^\n]*", "", param_text)
    param_text = re.sub(r"/\*[\s\S]*?\*/", "", param_text)

    params: dict[str, str] = {}
    # Match:  [parameter] NAME = VALUE
    for pm in re.finditer(r"(?:parameter\s+)?(\w+)\s*=\s*([^,\s]+)", param_text):
        pname = pm.group(1)
        pval = pm.group(2).strip()
        if pname.lower() != "parameter":
            params[pname] = pval
    return params


def _extract_header_port_names(port_text: str) -> list[str]:
    """Extract ordered port names from a classic non-ANSI module header."""
    cleaned = re.sub(r"/\*[\s\S]*?\*/", "", port_text)
    cleaned = re.sub(r"//.*$", "", cleaned, flags=re.MULTILINE)
    names = []
    for item in cleaned.split(","):
        name = item.strip()
        if not name:
            continue
        m = re.search(r"(\w+)$", name)
        if m:
            names.append(m.group(1))
    return names


def _extract_non_ansi_port_decls(code: str, header_names: list[str]) -> list[dict]:
    """Extract classic Verilog port declarations from the module body."""
    header_set = set(header_names)
    decl_pattern = re.compile(
        r"\b(input|output|inout)\b\s+"
        r"(?:(wire|logic|reg)\s+)?"
        r"(\[[^\]]+\]\s+)?"
        r"([^;]+);"
    )

    ports_by_name: dict[str, dict] = {}
    for match in decl_pattern.finditer(code):
        direction = match.group(1)
        sig_type = match.group(2) or "wire"
        width = match.group(3).strip() if match.group(3) else ""
        names_blob = match.group(4)
        for raw_name in names_blob.split(","):
            name = raw_name.strip()
            if not name:
                continue
            name_match = re.search(r"(\w+)$", name)
            if not name_match:
                continue
            final_name = name_match.group(1)
            if final_name in header_set:
                ports_by_name[final_name] = {
                    "direction": direction,
                    "type": sig_type,
                    "width": width,
                    "name": final_name,
                }

    return [ports_by_name[name] for name in header_names if name in ports_by_name]


def _pick_clock_reset_ports(dut_ports: list[dict]) -> tuple[str, str]:
    """Best-effort detection of DUT clock/reset port names."""
    names = [port["name"] for port in dut_ports]

    def pick(candidates: list[str], default: str) -> str:
        for candidate in candidates:
            if candidate in names:
                return candidate
        return default

    clock_name = pick(["clk", "clock", "clk_in", "clk_i"], "clk")
    reset_name = pick(["rst_n", "rstn", "reset_n", "rst", "reset", "rst_n_in"], "rst_n")
    return clock_name, reset_name


def _resolve_monitor_signal(
    monitor_name: str,
    dut_port_names: set[str],
    actual_clock: str,
    actual_reset: str,
) -> str | None:
    """Map lowered monitor signal names back to DUT or wrapper signals."""
    # 1. Exact match
    if monitor_name in dut_port_names:
        return monitor_name

    # 2. Always map clock/reset names to the wrapper's fixed ports — never anyseq
    _CLOCK_NAMES = {"clk", "clock", "clk_in", "clk_i", "clk_out"}
    _RESET_NAMES = {"rst_n", "rstn", "rst", "reset", "reset_n", "rst_n_in"}
    if monitor_name == actual_clock or monitor_name in _CLOCK_NAMES:
        return actual_clock or "clk"
    if monitor_name == actual_reset or monitor_name in _RESET_NAMES:
        return actual_reset or "rst_n"

    # 3. Strip _in / _out suffix and retry exact match
    #    e.g. gen_in → gen
    for suffix in ("_in", "_out"):
        if monitor_name.endswith(suffix):
            candidate = monitor_name[: -len(suffix)]
            if candidate in dut_port_names:
                return candidate

    # 4. Underscore-normalized match: data_in → datain, data_out → dataout
    #    Build a lookup from normalized DUT name → original DUT name
    normalized_dut = {name.replace("_", "").lower(): name for name in dut_port_names}
    monitor_normalized = monitor_name.replace("_", "").lower()
    if monitor_normalized in normalized_dut:
        return normalized_dut[monitor_normalized]

    # 5. Strip _in / _out then normalize
    for suffix in ("_in", "_out"):
        if monitor_name.endswith(suffix):
            candidate_normalized = monitor_name[: -len(suffix)].replace("_", "").lower()
            if candidate_normalized in normalized_dut:
                return normalized_dut[candidate_normalized]

    return None


def generate_standalone_project_from_monitor(
    monitor_rtl: str,
    top_module: str,
    *,
    mode: str,
    depth: int,
    solver: str,
    timeout: int,
    project_name: str,
    work_dir: str,
) -> SbyProject:
    """
    Stage a standalone SymbiYosys project from already-lowered monitor RTL.
    """
    config = SbyConfig(
        project_name=project_name,
        mode=mode,
        depth=depth,
        engine="smtbmc",
        solver=solver,
        timeout=timeout,
        top_module=top_module,
        monitor_module="",
    )

    project_dir = Path(work_dir)
    project_dir.mkdir(exist_ok=False)
    (project_dir / MONITOR_FILE).write_text(monitor_rtl)

    sby_content = render_sby(
        SbySettings(
            mode=mode,
            solver=solver,
            depth=depth,
            timeout_seconds=timeout,
            top_module=top_module,
        ),
        [(MONITOR_FILE, MONITOR_FILE)],
    )
    sby_path = project_dir / SBY_FILE
    sby_path.write_text(sby_content)

    return SbyProject(
        work_dir=str(project_dir),
        sby_file=str(sby_path),
        dut_files=[],
        monitor_file=MONITOR_FILE,
        config=config,
    )


# ═══════════════════════════════════════════════════════════════
# RESULT PARSING
# ═══════════════════════════════════════════════════════════════


@dataclass
class SbyResult:
    """Parsed result from a SymbiYosys run."""

    status: str = "unknown"  # PASS | FAIL | TIMEOUT | ERROR
    return_code: int = -1
    elapsed_seconds: float = 0.0
    depth_reached: int = 0
    failed_assertions: list[dict] = field(default_factory=list)  # [{name, file, line, step}]
    counterexample_vcd: str = ""  # path to VCD file if FAIL
    engine_output: str = ""  # raw sby stdout
    stderr_output: str = ""  # raw sby stderr
    error_message: str = ""
    detailed_logs: dict[str, str] = field(default_factory=dict)
    log_paths: dict[str, str] = field(default_factory=dict)
    assertion_results: list[dict] = field(
        default_factory=list
    )  # [{name, status, type, location, message, tracefile}]


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

    # Determine status from return code and output
    if returncode == 0:
        result.status = "PASS"
    elif returncode == 2:
        result.status = "FAIL"
    elif returncode == 4:
        result.status = "TIMEOUT"
    else:
        result.status = "ERROR"
        result.error_message = stderr or stdout

    if not result.error_message and result.status == "ERROR":
        result.error_message = (
            detailed_logs.get("sby_log") or detailed_logs.get("engine_log") or stderr or stdout
        )

    # Extract elapsed time
    time_match = re.search(r"Elapsed clock time.*?:\s*([\d:.]+)\s*\((\d+)\)", stdout)
    if time_match:
        result.elapsed_seconds = float(time_match.group(2))

    # Extract depth reached
    step_matches = re.findall(r"Checking assertions in step (\d+)", stdout)
    if step_matches:
        result.depth_reached = max(int(s) for s in step_matches) + 1

    # Extract failed assertions
    # Locations look like "monitor.sv:141.17-141.60", so allow anything after the line number.
    fail_pattern = re.compile(r"failed assertion (\S+) at ([^\s:]+):(\d+)\S*\s+step (\d+)")
    for m in fail_pattern.finditer(stdout):
        result.failed_assertions.append(
            {
                "name": m.group(1),
                "file": m.group(2),
                "line": int(m.group(3)),
                "step": int(m.group(4)),
            }
        )

    # Find counterexample VCD
    vcd_match = re.search(r"counterexample trace:\s*(\S+)", stdout)
    if vcd_match:
        vcd_path = os.path.join(work_dir, vcd_match.group(1))
        if os.path.exists(vcd_path):
            result.counterexample_vcd = vcd_path

    # Extract engine status
    status_match = re.search(r"engine_\d+.*?returned (\w+)", stdout)
    if status_match:
        engine_status = status_match.group(1).upper()
        if engine_status == "PASS":
            result.status = "PASS"
        elif engine_status in ("FAIL", "FAILED"):
            result.status = "FAIL"

    result.assertion_results = _parse_assertion_results_from_junit(
        detailed_logs.get("junit_xml", "")
    )
    # The JUnit XML has no step for a failure; sby's summary line does.
    steps = {failed["name"]: failed["step"] for failed in result.failed_assertions}
    for row in result.assertion_results:
        if row["status"] == "FAIL" and not row.get("step"):
            row["step"] = next(
                (step for name, step in steps.items() if name.endswith(row["name"])), 0
            )

    # Don't trust PASS entries from JUnit XML when sby itself errored —
    # sby may emit empty testcase elements (parsed as PASS) for assertions
    # that were never reached because prep/elaboration failed.
    if result.status == "ERROR" and result.assertion_results:
        for a in result.assertion_results:
            if a.get("status") == "PASS":
                a["status"] = "ERROR"

    # Fallback: extract per-property rows from engine/sby logs when no JUnit XML.
    if not result.assertion_results:
        result.assertion_results = _parse_assertion_results_from_logs(
            detailed_logs.get("engine_log", "") or detailed_logs.get("sby_log", "") or stdout
        )

    # Keep failed_assertions aligned with parsed assertion results when possible.
    if result.assertion_results:
        xml_failed = []
        for assertion in result.assertion_results:
            if assertion["status"] != "FAIL":
                continue
            xml_failed.append(
                {
                    "name": assertion["name"],
                    "file": assertion.get("file", ""),
                    "line": assertion.get("line", 0),
                    "step": assertion.get("step", 0),
                    "message": assertion.get("message", ""),
                }
            )
        if xml_failed:
            result.failed_assertions = xml_failed

    return result


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
                with contextlib.suppress(OSError):
                    logs["marker_contents"] = Path(marker_path).read_text(
                        encoding="utf-8", errors="replace"
                    )
                break

        xml_files = [
            name
            for name in os.listdir(task_dir)
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
        with open(full_path, encoding="utf-8", errors="replace") as f:
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
        results.append(
            {
                "name": name,
                "status": status,
                "type": typ,
                "location": "",
                "file": "",
                "line": 0,
                "step": step,
                "message": "",
                "tracefile": "",
            }
        )

    # smtbmc: "assert <name> passed" / "assert <name> failed at step N"
    for m in re.finditer(
        r"\bassert\s+([\w.:/]+)\s+(passed|failed)(?:\s+at\s+step\s+(\d+))?", log_text, re.IGNORECASE
    ):
        status = "PASS" if m.group(2).lower() == "passed" else "FAIL"
        add(m.group(1), "ASSERT", status, int(m.group(3) or 0))

    # smtbmc: "cover <name> reached" / "cover <name> unreachable"
    for m in re.finditer(r"\bcover\s+([\w.:/]+)\s+(reached|unreachable)", log_text, re.IGNORECASE):
        status = "PASS" if m.group(2).lower() == "reached" else "SKIPPED"
        add(m.group(1), "COVER", status)

    # smtbmc: "Assert failed in <hierarchy.name>"
    for m in re.finditer(r"Assert failed in ([\w.:/]+)", log_text):
        add(m.group(1), "ASSERT", "FAIL")

    # smtbmc: "Reached cover point <name>"
    for m in re.finditer(r"Reached cover point ([\w.:/]+)", log_text):
        add(m.group(1), "COVER", "PASS")

    # sby: "Assert cover property <name>" then "Status: PASSED/FAILED"
    # Collect block-level pass/fail
    for m in re.finditer(
        r"checking\s+(?:property|assertion)\s+([\w.:/]+)[^\n]*\n(?:.*\n)*?.*?status[:\s]+(pass|fail)",
        log_text,
        re.IGNORECASE,
    ):
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

        assertions.append(
            {
                "name": assertion_id,
                "status": status,
                "type": assertion_type,
                "location": location,
                "file": file_name,
                "line": line,
                "step": step,
                "message": message,
                "tracefile": tracefile,
            }
        )

    return assertions
