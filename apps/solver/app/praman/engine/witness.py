"""
Traces of the native engine (docs/agent/PRD.md §9.3-9.4, M3.3).

A solver model is written as a Yosys witness (.yw, as yosys-smtbmc writes
it), then replayed with `yosys sim` on the prep model - the same step sby
uses to make its VCDs, so the waveform viewer, explain_trace and the
driver analysis read native traces unchanged.  The replay also confirms a
counterexample: the simulator must see the assertion fail.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


def write_yw(session, steps: int, path: Path, allregs: bool = False) -> None:
    """Witness of the current model for steps 0..steps-1."""
    _, ywio = __import__("app.praman.engine.smt", fromlist=["load_smtio"]).load_smtio()
    smt, top = session.smt, session.top
    with open(path, "w") as f:
        inits, seqs, clocks, mems = smt.hierwitness(top, allregs)
        yw = ywio.WriteWitness(f, "native")
        for clock in clocks:
            yw.add_clock(clock["path"], clock["offset"], clock["type"])
        for seq in seqs:
            seq["sig"] = yw.add_sig(seq["path"], seq["offset"], seq["width"])
        for init in inits:
            init["sig"] = yw.add_sig(init["path"], init["offset"], init["width"], True)
        exprs, plan = [], []
        for k in range(steps):
            sigs = (seqs + inits) if k == 0 else seqs
            exprs.extend(smt.witness_net_expr(top, f"s{k}", sig) for sig in sigs)
            plan.append(sigs)
        values = iter(smt.get_list(exprs)) if exprs else iter(())
        for sigs in plan:
            step_values = ywio.WitnessValues()
            for sig in sigs:
                step_values[sig["sig"]] = smt.bv2bin(next(values))
            yw.step(step_values)
        yw.end_trace()


def replay(prep_il: Path, yw: Path, vcd: Path, timeout: int = 120, inductive: bool = False) -> dict:
    """Simulate the witness; returns sim's summary (steps, assertions that
    failed, covers reached), or {"error": ...}."""
    summary = vcd.with_suffix(".json")
    args = "-noinitstate " if inductive else ""
    script = (f"read_rtlil {prep_il.name}; "
              f"sim -hdlname -summary {summary.resolve()} -append 0 {args}-r {yw.resolve()} -vcd {vcd.resolve()}")
    try:
        r = subprocess.run(["yosys", "-q", "-p", script], cwd=prep_il.parent, capture_output=True, text=True,
                           timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"error": f"trace replay did not finish within {timeout} s"}
    if r.returncode != 0 or not summary.exists():
        return {"error": (r.stderr or r.stdout).strip()[-400:]}
    if vcd.exists():
        add_step_signal(vcd)
    return json.loads(summary.read_text())


SIM_STEP_WIDTH = 10        # `yosys sim` time units per step (its default -width)


def add_step_signal(vcd: Path, width: int = SIM_STEP_WIDTH) -> None:
    """Add yosys-smtbmc's top-level `smt_step` counter to a VCD written by
    `yosys sim`, so the trace readers (sva/debug, the waveform viewer) find
    each solver step as in sby's traces."""
    lines = vcd.read_text(errors="replace").splitlines()
    if any(" smt_step " in line for line in lines[:2000]):
        return
    out, inserted = [], False
    for line in lines:
        if not inserted and line.startswith("$scope"):
            out.append("$var integer 32 smt_step_id smt_step $end")
            inserted = True
        out.append(line)
        if line.startswith("#") and line[1:].strip().isdigit() and int(line[1:]) % width == 0:
            out.append(f"b{int(line[1:]) // width:b} smt_step_id")
    vcd.write_text("\n".join(out) + "\n")
