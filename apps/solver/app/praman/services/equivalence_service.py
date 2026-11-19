"""
Sequential equivalence of two versions of a design (like Jasper SEC).

Both versions are read and flattened separately (their sub-modules may
share names), Yosys `miter` compares the outputs, and a generated top
drives both with the same inputs and the usual reset sequence:

    after reset, every output both versions have is equal

Ports are matched by name.  An output only one version has is not compared;
an input only one version has is left free (any value).  A port whose
direction or width changed cannot be compared and is an error.  Registers
that no reset assigns start from arbitrary values in each version; they are
listed, because they are the usual cause of a difference that is not a bug.

is proven (PDR raced against k-induction) or refuted with the shortest
input sequence that makes an output differ.  The result is an ordinary
formal job with one property, `equivalence`, so the results table and the
waveform viewer work unchanged.
"""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from pyslang import ast

from app.praman.services.compile_worker import run_isolated
from app.praman.services.sby_generator import FORMAL_WORK_DIR, SbyResult, sanitize_filename, _steps_from_log
from app.praman.services.sva.clocks import design_clocks
from app.praman.services.sva.compiler import GLOBAL_CLOCK_NET
from app.praman.services.sva.debug import _fmt, _read_steps
from app.praman.services.sva.frontend import FrontendError, elaborate
from app.praman.services.sva.pipeline import HARNESS_MODULE, _choose_reset, _pick_top, harness_module_text
from app.praman.services.yosys_reader import SLANG, preferred_reader, read_commands

logger = logging.getLogger("veriassist.equivalence")

WRAPPER = "__va_eq_top"
LABEL = "equivalence"


def run_equivalence(service, gold: dict[str, str], gate: dict[str, str], top: str = "",
                    mode: str = "prove", depth: int = 20, timeout: int = 300,
                    reset_signal: str = "", reset_polarity: str = "auto",
                    project_name: str = "", job=None):
    """Check that `gate` (revised) behaves like `gold` (original); returns
    a FormalJob (registered in the job list)."""
    from app.praman.services.formal_service import (
        LEGACY_STATUS, PROOF_ENGINE_LABEL, PROOF_ENGINES, FormalJob, remember_job,
    )
    job_id = project_name or f"equiv_{uuid.uuid4().hex[:8]}"
    if job is None:
        job = FormalJob(job_id=job_id, status="running", created_at=datetime.now().isoformat(),
                        mode=mode, depth=depth, dut_top=top)
        remember_job(job)
    t0 = time.time()
    try:
        plan = run_isolated(_plan, gold, gate, top, reset_signal, reset_polarity)
        plan["unreset"] = {"original": _unreset_registers(gold, plan["top"]),
                           "revised": _unreset_registers(gate, plan["top"])}
        job.parse_summary = plan["summary"] + "".join(
            f"\nRegisters without reset ({side}, arbitrary at power-up): {', '.join(regs)}"
            for side, regs in plan["unreset"].items() if regs)
        work = FORMAL_WORK_DIR / job_id
        shutil.rmtree(work, ignore_errors=True)
        sby = _stage(work, plan, gold, gate, mode, depth, timeout, PROOF_ENGINES)
        result = service._run_sby(str(sby), str(work), timeout)
        entry = _entry(result, plan, depth, mode, PROOF_ENGINE_LABEL)
        entry["status"] = LEGACY_STATUS[entry["verdict"]]
        out = SbyResult(status="FAIL" if entry["verdict"] == "FAIL" else
                        "ERROR" if entry["verdict"] in ("ERROR", "TIMEOUT") else "PASS")
        out.assertion_results = [entry]
        out.counterexample_vcd = entry.get("counterexample_vcd", "")
        out.depth_reached = depth
        out.engine_output = result.engine_output
        out.harness = {"signal": plan["reset"][0] if plan["reset"] else "",
                       "active_low": plan["reset"][1] if plan["reset"] else None,
                       "source": plan["reset_source"], "clocks": plan["clock_names"],
                       "multiclock": plan["multiclock"]}
        if entry["verdict"] == "FAIL":
            out.failed_assertions = [{"name": LABEL, "file": "", "line": 0, "step": entry["step"],
                                      "message": entry["verdict_detail"]}]
        out.elapsed_seconds = time.time() - t0
        job.result = out
        job.status = "complete"
    except FrontendError as e:
        job.status, job.error_message = "failed", str(e)
    except Exception as e:
        logger.exception(f"[{job_id}] equivalence check failed")
        job.status, job.error_message = "failed", f"Equivalence check failed: {e}"
    job.total_time = time.time() - t0
    return job


def _plan(gold: dict[str, str], gate: dict[str, str], top: str, reset_signal: str,
          reset_polarity: str) -> dict[str, Any]:
    """Elaborate both versions, check their interfaces match, pick reset and clocks."""
    sides = {}
    for name, files in (("original", gold), ("revised", gate)):
        if not files:
            raise FrontendError(f"No {name} design files.")
        design = elaborate(files, top=top)
        root = design.compilation.getRoot()
        # the revised version is checked against the original's top
        name_top = top or _pick_top(root, design.compilation.sourceManager, files)
        top = top or name_top
        inst = next((i for i in root.topInstances if i.name == name_top), None)
        if inst is None:
            raise FrontendError(f"Top module '{name_top}' not found in the {name} design.")
        ports = {p.name: (p.direction, p.type.bitWidth) for p in inst.body.portList}
        sides[name] = (design, inst, name_top, ports)

    (g_design, g_inst, g_top, g_ports), (_, _, r_top, r_ports) = sides["original"], sides["revised"]
    if g_top != r_top:
        raise FrontendError(f"The top modules differ: '{g_top}' (original) and '{r_top}' (revised); "
                            f"set the Top Module.")
    inouts = [n for ports in (g_ports, r_ports) for n, (d, _) in ports.items()
              if d not in (ast.ArgumentDirection.In, ast.ArgumentDirection.Out)]
    if inouts:
        raise FrontendError(f"inout ports are not supported in equivalence checks: {', '.join(sorted(set(inouts)))}")
    changed = [n for n in g_ports.keys() & r_ports.keys() if g_ports[n] != r_ports[n]]
    if changed:
        def show(d, w):
            return f"{'input' if d == ast.ArgumentDirection.In else 'output'} {w} bit{'s' if w > 1 else ''}"
        raise FrontendError("These ports changed direction or width, so the versions cannot be compared: "
                            + "; ".join(f"{n} (original {show(*g_ports[n])}, revised {show(*r_ports[n])})"
                                        for n in sorted(changed)) + ".")

    def named(ports, direction):
        return {n: w for n, (d, w) in ports.items() if d == direction}
    g_in, r_in = named(g_ports, ast.ArgumentDirection.In), named(r_ports, ast.ArgumentDirection.In)
    g_out, r_out = named(g_ports, ast.ArgumentDirection.Out), named(r_ports, ast.ArgumentDirection.Out)
    # every input drives both versions (one missing it gets it as an unused port)
    inputs = list(g_in.items()) + [(n, w) for n, w in r_in.items() if n not in g_in]
    outputs = [(n, w) for n, w in g_out.items() if n in r_out]
    if not outputs:
        raise FrontendError(f"The two versions of '{g_top}' have no output in common to compare.")
    only = {"original": {"inputs": [n for n in g_in if n not in r_in], "outputs": [n for n in g_out if n not in r_out]},
            "revised": {"inputs": [n for n in r_in if n not in g_in], "outputs": [n for n in r_out if n not in g_out]}}

    reset, reset_source = _choose_reset(g_inst, g_top, [], reset_signal, reset_polarity)
    instances: dict[str, Any] = {}
    def collect(obj):
        if isinstance(obj, ast.InstanceSymbol):
            instances[obj.hierarchicalPath] = obj
        return True
    g_design.compilation.getRoot().visit(collect)
    clocks = design_clocks(instances, g_top, [], reset[0] if reset else "")
    reset_text = (f"{reset[0]} (active {'low' if reset[1] else 'high'})" if reset else "none")
    summary = "\n".join([
        f"Equivalence check of '{g_top}': original vs revised",
        f"Outputs compared: {', '.join(n for n, _ in outputs)}",
        *[f"Outputs only in the {side} design (not compared): {', '.join(p['outputs'])}"
          for side, p in only.items() if p["outputs"]],
        *[f"Inputs only in the {side} design (left free, any value): {', '.join(p['inputs'])}"
          for side, p in only.items() if p["inputs"]],
        f"Reset: {reset_text}",
        f"Clocks: {', '.join(n.split('.', 1)[-1] for n in clocks.nets) or 'none found'}"
        + (" (independent, multiclock)" if clocks.multiclock else ""),
    ])
    return {"top": g_top, "inputs": inputs, "outputs": outputs, "only": only, "reset": reset,
            "reset_source": reset_source, "multiclock": clocks.multiclock,
            "clocks": clocks.top_inputs if clocks.multiclock else [],
            "clock_names": [n.split(".", 1)[-1] for n in clocks.nets], "summary": summary}


def _wrapper(plan: dict[str, Any]) -> str:
    def decl(n: str, w: int) -> str:
        return f"[{w - 1}:0] {n}" if w > 1 else n
    ports = ",\n".join(f"    input wire {decl(n, w)}" for n, w in plan["inputs"])
    conns = [f".in_{n}({n})" for n, _ in plan["inputs"]] + [".trigger(trigger)"]
    lines = ["`ifdef FORMAL", f"module {WRAPPER} (", ports, ");",
             "    wire trigger;"]
    for n, w in plan["outputs"]:
        lines.append(f"    wire {decl(f'gold_{n}', w)};")
        lines.append(f"    wire {decl(f'gate_{n}', w)};")
        conns += [f".gold_{n}(gold_{n})", f".gate_{n}(gate_{n})"]
    lines.append(f"    miter __va_miter ({', '.join(conns)});")
    harness = [".in_reset(in_reset)"]
    if plan["reset"] is not None:
        harness.append(f".rst({plan['reset'][0]})")
    harness += [f".c{i}({c})" for i, c in enumerate(plan["clocks"])]
    lines += ["    wire in_reset;",
              f"    {HARNESS_MODULE} __va_harness ({', '.join(harness)});",
              f"    (* gclk *) wire {GLOBAL_CLOCK_NET};",
              f"    always @(posedge {GLOBAL_CLOCK_NET})",
              f"        if (!in_reset) {LABEL}: assert(!trigger);",
              "endmodule", "`endif", ""]
    return "\n".join(lines)


def _stage(work: Path, plan: dict[str, Any], gold: dict[str, str], gate: dict[str, str],
           mode: str, depth: int, timeout: int, proof_engines: str) -> Path:
    src = work / "src"
    src.mkdir(parents=True)
    reader = preferred_reader()
    script = []
    names: list[str] = []
    for side, files in (("gold", gold), ("gate", gate)):
        side_names = []
        for name, text in files.items():
            clean = f"{side}__{sanitize_filename(name)}"
            (src / clean).write_text(text)
            side_names.append(clean)
        names += side_names
        if reader == SLANG:
            script += ["plugin -i slang", f"read_slang -D FORMAL {' '.join(side_names)} --top {plan['top']}"]
        else:
            script += [f"read -sv -formal {n}" for n in side_names]
        widths = dict(plan["inputs"])
        other = plan["only"]["revised" if side == "gold" else "original"]
        own = plan["only"]["original" if side == "gold" else "revised"]
        script += [f"prep -top {plan['top']}", "flatten", f"rename {plan['top']} {side}",
                   # same ports on both sides for miter: missing inputs added,
                   # outputs the other version lacks dropped from the comparison
                   *[f"add -input {n} {widths[n]} {side}" for n in other["inputs"]],
                   *[f"delete -port {side}/{n}" for n in own["outputs"]],
                   f"design -stash {side}"]
    harness = harness_module_text(plan["reset"], plan["clocks"], 2 if plan["multiclock"] else 1, 0)
    (src / "va_harness.sv").write_text(harness)
    (src / "va_eq_top.sv").write_text(_wrapper(plan))
    names += ["va_harness.sv", "va_eq_top.sv"]
    script += ["design -copy-from gold -as gold gold", "design -copy-from gate -as gate gate",
               "miter -equiv -flatten -make_outputs -ignore_gold_x gold gate miter",
               "read_verilog -sv -formal va_harness.sv", "read_verilog -sv -formal va_eq_top.sv",
               f"hierarchy -top {WRAPPER}", f"prep -top {WRAPPER}"]
    steps = depth * (2 if plan["multiclock"] else 1)
    run_mode = "prove" if mode == "prove" else "bmc"
    engines = proof_engines.split("\n") if run_mode == "prove" else ["smtbmc"]
    lines = ["[tasks]", run_mode, "", "[options]", f"{run_mode}: mode {run_mode}",
             f"{run_mode}: depth {steps}", f"{run_mode}: timeout {timeout}",
             *([f"{run_mode}: multiclock on"] if plan["multiclock"] else []), "",
             "[engines]", *engines, "", "[script]", *script, "", "[files]",
             *[f"{n} src/{n}" for n in names], ""]
    sby = work / f"{work.name}.sby"
    sby.write_text("\n".join(lines))
    return sby


def _entry(result: SbyResult, plan: dict[str, Any], depth: int, mode: str, engine_label: str) -> dict:
    entry: dict[str, Any] = {
        "name": LABEL, "type": "ASSERT", "location": "", "file": "", "line": 0, "bound": 0,
        "step": 0, "message": "", "tracefile": "", "counterexample_vcd": "", "precondition": None,
        "description": f"every output both versions of '{plan['top']}' have is equal after reset",
        "engine": engine_label if mode == "prove" else "smtbmc",
    }
    if result.status == "PASS":
        if mode == "prove":
            entry.update(verdict="PROVEN", verdict_detail="The two versions are equivalent (full proof).")
        else:
            entry.update(verdict="HOLDS_BOUNDED", bound=depth,
                         verdict_detail=f"No difference within {depth} cycles (bounded check only).")
        return entry
    if result.status != "FAIL":
        why = (result.error_message or result.status or "").strip()[-400:]
        entry.update(verdict="TIMEOUT" if result.status == "TIMEOUT" else "ERROR",
                     verdict_detail=why, message=why)
        return entry
    vcd = result.counterexample_vcd or _find_trace(result)
    entry["counterexample_vcd"] = vcd
    step = _steps_from_log(result.engine_output or "").get(LABEL, 0)
    diffs, at, inputs = _differences(vcd, plan) if vcd else ([], step, [])
    entry["step"] = step
    entry["differences"] = diffs
    entry["trace_kind"] = "EQUIV"
    entry["signals"] = ([f"{WRAPPER}.{n}" for n, _ in plan["inputs"]]
                        + [f"{WRAPPER}.{side}_{n}" for n, _ in plan["outputs"] for side in ("gold", "gate")])
    explanation = [f"The revised design differs from the original at cycle {at}."]
    explanation += [f"`{d['output']}`: original {d['original']}, revised {d['revised']}." for d in diffs]
    if inputs:
        explanation.append(f"Inputs at cycles {at - 1} and {at}: "
                           + ", ".join(f"{n} = {a} / {b}" for n, a, b in inputs) + ".")
    unreset = {side: regs for side, regs in plan.get("unreset", {}).items() if regs}
    if unreset:
        explanation.append("Registers without a reset start from arbitrary values in each version ("
                           + "; ".join(f"{side}: {', '.join(regs)}" for side, regs in unreset.items())
                           + "); the difference may come from their power-up values rather than a bug.")
    entry["explanation"] = explanation
    entry["difference_cycle"] = at
    shown = "; ".join(f"{d['output']}: original {d['original']}, revised {d['revised']}" for d in diffs[:4])
    entry.update(verdict="FAIL", verdict_detail=(
        f"The versions differ at cycle {at}" + (f": {shown}." if shown else ".")))
    return entry


def _find_trace(result: SbyResult) -> str:
    task_dir = result.log_paths.get("task_dir", "")
    if task_dir:
        traces = sorted(Path(task_dir).rglob("*.vcd"))
        if traces:
            return str(traces[0])
    return ""


def _differences(vcd: str, plan: dict[str, Any]) -> tuple[list[dict], int, list[tuple[str, str, str]]]:
    """Outputs that differ at the first cycle (after reset) where any does,
    that cycle, and the inputs (name, value one cycle before, value then)."""
    wanted = {f"{WRAPPER}.{side}_{n}" for n, _ in plan["outputs"] for side in ("gold", "gate")}
    wanted |= {f"{WRAPPER}.{n}" for n, _ in plan["inputs"]}
    wanted.add(f"{WRAPPER}.in_reset")
    trace = _read_steps(vcd, wanted)
    values, widths = trace["values"], trace["widths"]
    in_reset = values.get(f"{WRAPPER}.in_reset", [])
    for t in range(len(trace["steps"])):
        if in_reset and in_reset[t] == "1":
            continue
        diffs = []
        for n, w in plan["outputs"]:
            g = values.get(f"{WRAPPER}.gold_{n}", [])
            r = values.get(f"{WRAPPER}.gate_{n}", [])
            if t < len(g) and t < len(r) and g[t] != r[t]:
                diffs.append({"output": n, "original": _fmt(g[t], w), "revised": _fmt(r[t], w)})
        if diffs:
            inputs = []
            for n, w in plan["inputs"]:
                if n in plan["clock_names"]:
                    continue
                series = values.get(f"{WRAPPER}.{n}", [])
                if t < len(series):
                    before = _fmt(series[t - 1], w) if t > 0 else "?"
                    inputs.append((n, before, _fmt(series[t], w)))
            return diffs, t, inputs
    return [], 0, []


def _unreset_registers(files: dict[str, str], top: str) -> list[str]:
    """Registers no reset assigns: plain flip-flops ($dff/$dffe) once Yosys
    has folded synchronous resets into the flip-flops (opt_dff)."""
    if shutil.which("yosys") is None:
        return []
    with tempfile.TemporaryDirectory(prefix="va_eq_") as tmp:
        names = []
        for name, text in files.items():
            clean = sanitize_filename(name)
            (Path(tmp) / clean).write_text(text)
            names.append(clean)
        script = [*read_commands(names, top, preferred_reader()), f"prep -top {top}", "flatten", "opt_dff",
                  "tee -q -o regs.txt dump t:$dff t:$dffe"]
        try:
            subprocess.run(["yosys", "-q", "-p", "; ".join(script)], cwd=tmp, capture_output=True,
                           text=True, timeout=120)
            dump = (Path(tmp) / "regs.txt").read_text()
        except (OSError, subprocess.TimeoutExpired):
            return []
    regs = set()
    for line in dump.splitlines():
        if line.strip().startswith("connect \\Q "):
            regs.update(re.findall(r"\\([^\s\[\]{}]+)", line.split("connect \\Q ", 1)[1]))
    return sorted(r for r in regs if not r.startswith("$"))
