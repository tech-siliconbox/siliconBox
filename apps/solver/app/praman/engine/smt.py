"""
Solver sessions for the native engine (docs/agent/PRD.md §9.3, M3.2).

Solver I/O goes through Yosys's own `smtio` (it ships with Yosys, next to
yosys-smtbmc), so the model is read exactly as smtbmc reads it.  Importing
smtio installs signal handlers and an exception hook for the whole process,
so it is only ever imported inside the engine's worker process
(app/engine/worker.py), never in the server.

A Session holds one model and one solver.  `frame(step)` adds a time step
the way smtbmc does: design assumptions and hierarchy, then the initial
state (step 0, unless `init` is off for induction) or the transition from
the previous step.  Properties are addressed by label; their SMT functions
are found through the module hierarchy (`|mod_h cell|`).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

SOLVERS = ("yices", "z3", "bitwuzla", "boolector")
_SOLVER_BIN = {"yices": "yices-smt2", "z3": "z3", "bitwuzla": "bitwuzla", "boolector": "boolector"}


@lru_cache(maxsize=1)
def yosys_python_dir() -> str:
    """Where smtio.py and ywio.py are (Homebrew and the OSS CAD Suite differ)."""
    try:
        datdir = subprocess.run(["yosys-config", "--datdir"], capture_output=True, text=True,
                                timeout=30).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        datdir = ""
    candidates = [os.path.join(datdir, "python3")] if datdir else []
    exe = shutil.which("yosys-smtbmc")
    if exe:
        root = os.path.dirname(os.path.dirname(os.path.realpath(exe)))
        candidates.append(os.path.join(root, "share", "yosys", "python3"))
    for c in candidates:
        if os.path.exists(os.path.join(c, "smtio.py")):
            return c
    raise RuntimeError("Yosys's smtio.py was not found (is Yosys installed with yosys-smtbmc?)")


def available_solvers() -> list[str]:
    return [s for s in SOLVERS if shutil.which(_SOLVER_BIN[s])]


def load_smtio():
    """Import smtio and ywio (worker process only)."""
    path = yosys_python_dir()
    if path not in sys.path:
        sys.path.insert(0, path)
    import smtio
    import ywio
    return smtio, ywio


@dataclass(frozen=True)
class Prop:
    label: str
    kind: str          # assert | cover
    fun: str           # SMT function name, e.g. "top_a 3"
    path: tuple        # cells from the top to the module that holds it

    def expr(self, top: str, modinfo, state: str) -> str:
        base, mod = state, top
        for cell in self.path:
            base = f"(|{mod}_h {cell}| {base})"
            mod = modinfo[mod].cells[cell]
        return f"(|{self.fun}| {base})"


class Session:
    def __init__(self, smt2_path: str, solver: str = "yices", timeout: int = 0):
        smtio, _ = load_smtio()
        opts = smtio.SmtOpts()
        opts.solver = solver
        opts.timeinfo = False
        opts.timeout = timeout
        self.smt = smtio.SmtIo(opts=opts)
        with open(smt2_path) as f:
            for line in f:
                self.smt.write(line)
        self.top = self.smt.topmod
        self.steps = 0
        self.props = self._collect()

    def _collect(self) -> dict[str, Prop]:
        from app.praman.engine.export import label_of
        out: dict[str, Prop] = {}

        def walk(mod: str, path: tuple):
            info = self.smt.modinfo[mod]
            for kind, table in (("assert", info.asserts), ("cover", info.covers)):
                for fun, desc in table.items():
                    out.setdefault(label_of(desc.split()[0] if desc else fun), Prop(
                        label_of(desc.split()[0] if desc else fun), kind, fun, path))
            for cell, sub in info.cells.items():
                walk(sub, path + (cell,))
        walk(self.top, ())
        return out

    def expr(self, label: str, step: int) -> str:
        return self.props[label].expr(self.top, self.smt.modinfo, f"s{step}")

    def registers(self) -> list[list]:
        """Every register of the design as an smtio path (cells..., register name)."""
        out: list[list] = []

        def walk(mod: str, path: list):
            info = self.smt.modinfo[mod]
            out.extend(path + [r] for r in sorted(info.registers))
            for cell, sub in info.cells.items():
                walk(sub, path + [cell])
        walk(self.top, [])
        return out

    def same_state(self, i: int, j: int) -> str:
        """States i and j hold the same value in every register."""
        regs = self.registers()
        if not regs:
            return "true"
        eqs = [f"(= {self.smt.net_expr(self.top, f's{i}', r)} {self.smt.net_expr(self.top, f's{j}', r)})"
               for r in regs]
        return eqs[0] if len(eqs) == 1 else f"(and {' '.join(eqs)})"

    # ── unrolling ──
    def frame(self, step: int, init: bool = True) -> None:
        t = self.top
        w = self.smt.write
        w(f"(declare-fun s{step} () |{t}_s|)")
        w(f"(assert (|{t}_u| s{step}))")
        w(f"(assert (|{t}_h| s{step}))")
        if step == 0 and init:
            w(f"(assert (|{t}_i| s0))")
            w(f"(assert (|{t}_is| s0))")
        else:
            if step > 0:
                w(f"(assert (|{t}_t| s{step - 1} s{step}))")
            w(f"(assert (not (|{t}_is| s{step})))")
        self.steps = max(self.steps, step + 1)

    def check(self, *exprs: str) -> str:
        """sat | unsat | unknown | timeout under the extra assertions (scoped)."""
        self.smt.write("(push 1)")
        for e in exprs:
            self.smt.write(f"(assert {e})")
        return self.smt.check_sat(["sat", "unsat", "unknown", "timeout", "interrupted"])

    def pop(self) -> None:
        self.smt.write("(pop 1)")

    def true_in_model(self, expr: str) -> bool:
        return self.smt.get(expr) in ("true", "#b1")

    def assume(self, expr: str) -> None:
        self.smt.write(f"(assert {expr})")

    def close(self) -> None:
        try:
            self.smt.p_close()
        except Exception:
            pass


def solver_name(preferred: Optional[str] = None) -> str:
    found = available_solvers()
    if preferred and preferred in found:
        return preferred
    if not found:
        raise RuntimeError("no SMT solver found (yices-smt2, z3, bitwuzla or boolector)")
    return found[0]
