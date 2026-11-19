"""
Model export for the native engine (docs/agent/PRD.md §9.2, M3.1).

The design with its monitors and harness (sva/pipeline.prepare_checked) is
read by Yosys with the same commands SymbiYosys uses, then passed through
the same model passes as sby's `prep` and `smt2_nomem` models, so both
engines check the same transition system:

  base   read, script, prep -top, hierarchy -smtcheck, rename -witness
  prep   async2sync, formalff, setundef -anyseq, ... -> design_prep.il
         (kept: witness traces are replayed on it with `yosys sim`)
  smt2   memory_map -formal (memories as registers), dffunmap,
         write_smt2 -wires -> design.smt2

Unlike sby's bmc/prove models, assertions *and* covers stay in one model:
the engine checks each property on its own function (`|top_a N|`,
`|top_c N|`).  Liveness and fairness properties are removed; they are not
checked by the native engine (PRD §9.3, E5).
"""

from __future__ import annotations

import re
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.praman.services.sby_generator import sanitize_filename
from app.praman.services.yosys_reader import read_commands
from app.praman.services import sby_generator
from app.workspace import remove_inside

_PROP = re.compile(r"^; yosys-smt2-(assert|cover|assume) (\S+) (\S+)", re.MULTILINE)


class ExportError(RuntimeError):
    def __init__(self, message: str, log: str = ""):
        super().__init__(message)
        self.log = log


@dataclass
class Model:
    workdir: Path
    top: str
    smt2: Path
    prep_il: Path
    # label -> kind ("assert" | "cover" | "assume"), from the model's own metadata
    properties: dict[str, str] = field(default_factory=dict)
    seconds: float = 0.0


def _base_script(names: list[str], top: str, reader: str, prep_script: list[str],
                 extra: Optional[list[str]] = None) -> list[str]:
    return [*read_commands(names, top, reader), *prep_script, f"prep -top {top}", *(extra or []),
            "hierarchy -smtcheck", "rename -witness", "write_rtlil design.il"]


PREP = ["read_rtlil design.il",
        "scc -select; simplemap; select -clear",
        "memory_nordff",
        "async2sync",
        "chformal -assume -early",
        "opt_clean",
        "formalff -setundef -clk2ff -ff2anyinit -hierarchy",
        "chformal -live -fair -remove",
        "opt_clean",
        "check",
        "setundef -undriven -anyseq",
        "opt -fast",
        "rename -witness",
        "opt_clean",
        "write_rtlil design_prep.il"]

SMT2 = ["read_rtlil design_prep.il",
        "hierarchy -smtcheck",
        "delete */t:$print",
        "formalff -assume",
        "memory_map -formal",
        "formalff -setundef -clk2ff -ff2anyinit",
        "dffunmap",
        "stat",
        "write_smt2 -wires design.smt2"]


def label_of(name: str) -> str:
    """`__va_mon.ap_req001_reset` -> `ap_req001_reset` (the property label)."""
    return name.rsplit(".", 1)[-1].lstrip("\\")


def export(files: dict[str, str], top: str, reader: str, prep_script: list[str], workdir: Path,
           timeout: int = 300, multiclock: bool = False, extra_script: Optional[list[str]] = None) -> Model:
    """extra_script: Yosys commands after `prep -top` (e.g. a cut point, app/engine/cores.py)."""
    """Stage `files` into workdir/src and build the model; raises ExportError."""
    import time
    if shutil.which("yosys") is None:
        raise ExportError("yosys is not installed")
    start = time.monotonic()
    workdir = Path(workdir)
    if workdir.exists():
        remove_inside(workdir, sby_generator.FORMAL_WORK_DIR)
    src, model = workdir / "src", workdir / "model"
    src.mkdir(parents=True)
    model.mkdir()
    names = []
    for name, text in files.items():
        clean = sanitize_filename(name)
        (src / clean).write_text(text)
        names.append(clean)
    base = _base_script(names, top, reader, prep_script, extra_script)
    base[-1] = "write_rtlil ../model/design.il"
    # several clocks: every flip-flop becomes logic on the global clock, as sby's multiclock mode
    prep = [line for line in PREP if line != "chformal -assume -early"] if multiclock else PREP
    prep = [("clk2fflogic" if line == "async2sync" else line) for line in prep] if multiclock else prep
    for stage, cwd, script in (("base", src, base), ("prep", model, prep), ("smt2", model, SMT2)):
        (model / f"{stage}.ys").write_text("\n".join(script) + "\n")
        try:
            result = subprocess.run(["yosys", "-ql", str(model / f"{stage}.log"), str(model / f"{stage}.ys")],
                                    cwd=cwd, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired as e:
            raise ExportError(f"model export ({stage}) did not finish within {timeout} s") from e
        if result.returncode != 0:
            log = (model / f"{stage}.log").read_text(errors="replace") if (model / f"{stage}.log").exists() else ""
            errors = [line for line in (log + result.stderr).splitlines() if "ERROR" in line]
            raise ExportError(f"model export ({stage}) failed: {errors[0] if errors else result.stderr.strip()[-300:]}",
                              log)
    smt2 = model / "design.smt2"
    props = {}
    for kind, _, name in _PROP.findall(smt2.read_text()):
        props.setdefault(label_of(name), kind)
    return Model(workdir, top, smt2, model / "design_prep.il", props, round(time.monotonic() - start, 2))
