"""
Dead-end check of the assumptions (JasperGold: check_assumptions -dead_end).

A dead end is a state the design can reach, under the assumptions, in
which no input satisfies all the assumptions: a trace cannot go on from
there, so every property checks nothing beyond it - a vacuity no single
assertion shows.

It is a "there is a state such that for every input" question:

1. The design is flattened to one module (Yosys).  Every register (and the
   checker's own) becomes a free constant ($anyconst: the state, "there
   is"), every input and every cut signal a universal one ($allconst: "for
   every input"), and the assumptions are read on the cycle's own values
   (an assumption in a clocked block holds on the values before the
   edge).  `qbfsat` then looks for a state in which every input breaks an
   assumption.  None: there is no dead end at all, reachable or not - a
   proof.
2. A state it finds may be one the design never reaches.  A bounded cover
   from reset, under the assumptions, looks for a trace whose next state
   is it.  Found: a dead end, with the cycle it is reached in.  Not found
   within the depth: that state is ruled out and step 1 runs again, a few
   times.

Only what is proven is reported: a dead end comes with its trace; "none"
is said only when step 1 finds no state at all.
"""

from __future__ import annotations

import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from app.workspace import clear_inside
from typing import Optional

STATE_CELLS = {"$dff", "$ff", "$anyinit"}            # after async2sync; dffunmap; memory_map
MAX_CANDIDATES = 5


class DeadEndError(Exception):
    pass


@dataclass
class Cell:
    start: int                        # line of "cell" (attributes before it are kept with it)
    end: int                          # line of its "end"
    type: str
    name: str
    params: dict = field(default_factory=dict)
    conns: dict = field(default_factory=dict)


def _module(text: str, top: str) -> tuple[list[str], int, int]:
    lines = text.splitlines()
    start = next((i for i, l in enumerate(lines) if re.match(rf"^module \\{re.escape(top)}$", l)), None)
    if start is None:
        raise DeadEndError(f"the top module {top} is not in the model")
    end = next(i for i in range(start + 1, len(lines)) if lines[i] == "end")
    return lines, start, end


def _cells(lines: list[str], start: int, end: int) -> list[Cell]:
    out, i = [], start
    while i < end:
        m = re.match(r"^  cell (\S+) (\S+)$", lines[i])
        if not m:
            i += 1
            continue
        cell = Cell(start=i, end=i, type=m.group(1), name=m.group(2))
        j = i + 1
        while lines[j] != "  end":
            p = re.match(r"^    parameter (\S+) (.*)$", lines[j])
            c = re.match(r"^    connect (\S+) (.*)$", lines[j])
            if p:
                cell.params[p.group(1)] = p.group(2)
            elif c:
                cell.conns[c.group(1)] = c.group(2)
            j += 1
        cell.end = j
        out.append(cell)
        i = j + 1
    return out


def _flavor(cell: Cell) -> str:
    return cell.params.get("\\FLAVOR", "").strip('"') if cell.type == "$check" else \
        {"$assume": "assume", "$assert": "assert", "$cover": "cover"}.get(cell.type, "")


def _block(kind: str, name: str, params: dict, conns: dict) -> list[str]:
    return [f"  cell {kind} {name}", *(f"    parameter {k} {v}" for k, v in params.items()),
            *(f"    connect {k} {v}" for k, v in conns.items()), "  end"]


def _logic(kind: str, name: str, y: str, a: str, a_width: int = 1, b: Optional[str] = None,
           b_width: int = 1) -> list[str]:
    params = {"\\A_SIGNED": "0", "\\A_WIDTH": str(a_width)}
    conns = {"\\A": a}
    if b is not None:
        params.update({"\\B_SIGNED": "0", "\\B_WIDTH": str(b_width)})
        conns["\\B"] = b
    params["\\Y_WIDTH"] = "1"
    conns["\\Y"] = y
    return _block(kind, name, params, conns)


@dataclass
class Model:
    lines: list[str]
    start: int
    end: int
    cells: list[Cell]
    top: str

    def assumes(self) -> list[Cell]:
        return [c for c in self.cells if _flavor(c) == "assume"]


def qbf_model(model: Model, excluded: list[dict[str, str]]) -> tuple[str, dict[str, dict]]:
    """The exists-state / for-all-input problem, and the state it is over:
    {cell name: {q, d, width, kind}}."""
    out = model.lines[:model.start + 1]
    states: dict[str, dict] = {}
    skip: set[int] = set()
    replaced: list[str] = []
    for k, cell in enumerate(model.cells):
        if cell.type in STATE_CELLS:
            name = f"\\__pm_state_{k}"
            width = int(cell.params.get("\\WIDTH", "1"))
            states[name[1:]] = {"q": cell.conns["\\Q"], "d": cell.conns.get("\\D", cell.conns["\\Q"]),
                                "width": width, "kind": cell.type}
            replaced += _block("$anyconst", name, {"\\WIDTH": str(width)}, {"\\Y": cell.conns["\\Q"]})
        elif cell.type == "$anyconst":
            states[cell.name.lstrip("\\")] = {"q": cell.conns["\\Y"], "d": cell.conns["\\Y"],
                                              "width": int(cell.params.get("\\WIDTH", "1")), "kind": "$anyconst"}
            continue
        elif cell.type == "$initstate":
            name = f"\\__pm_state_{k}"
            states[name[1:]] = {"q": cell.conns["\\Y"], "d": "1'0", "width": 1, "kind": "$initstate"}
            replaced += _block("$anyconst", name, {"\\WIDTH": "1"}, {"\\Y": cell.conns["\\Y"]})
        elif cell.type == "$anyseq":
            replaced += _block("$allconst", cell.name, {"\\WIDTH": cell.params.get("\\WIDTH", "1")},
                               {"\\Y": cell.conns["\\Y"]})
        elif not _flavor(cell):
            continue
        skip.update(range(cell.start, cell.end + 1))
    for i in range(model.start + 1, model.end):
        line = model.lines[i]
        # the state is any state: the registers' initial values do not hold here
        if i in skip or line.startswith("  attribute \\init "):
            continue
        # no port is kept for its own sake: a register only the outputs read is left out of the state
        out.append(re.sub(r"^(  wire (?:width \d+ )?)(?:output|inout) \d+ ", r"\1", line))
    out += replaced
    # every input breaks one assumption: OR over the assumptions of (enabled and false)
    bad = []
    for j, cell in enumerate(model.assumes()):
        out += [f"  wire \\__pm_na_{j}", f"  wire \\__pm_bad_{j}"]
        out += _logic("$logic_not", f"\\__pm_not_{j}", f"\\__pm_na_{j}", cell.conns["\\A"])
        out += _logic("$logic_and", f"\\__pm_and_{j}", f"\\__pm_bad_{j}", cell.conns.get("\\EN", "1'1"),
                      b=f"\\__pm_na_{j}")
        bad.append(f"\\__pm_bad_{j}")
    terms = []
    if bad:
        out.append("  wire \\__pm_any_bad")
        out += _logic("$reduce_or", "\\__pm_or", "\\__pm_any_bad", "{ " + " ".join(reversed(bad)) + " }", len(bad))
        terms.append("\\__pm_any_bad")
    for e, values in enumerate(excluded):        # a state ruled out (not reachable): another one
        names = sorted(values)
        sig = "{ " + " ".join(states[n]["q"] for n in names) + " }"
        const = "{ " + " ".join(f"{states[n]['width']}'{values[n]}" for n in names) + " }"
        width = sum(states[n]["width"] for n in names)
        out.append(f"  wire \\__pm_other_{e}")
        out += _logic("$ne", f"\\__pm_ne_{e}", f"\\__pm_other_{e}", sig, width, const, width)
        terms.append(f"\\__pm_other_{e}")
    out.append("  wire \\__pm_goal")
    out += _logic("$reduce_and", "\\__pm_and_goal", "\\__pm_goal", "{ " + " ".join(terms) + " }", len(terms))
    # qbfsat: is there a constant (the state) such that, for every input, this holds
    out += _block("$assume", "\\__pm_dead", {}, {"\\A": "\\__pm_goal", "\\EN": "1'1"})
    out += model.lines[model.end:]
    return "\n".join(out) + "\n", states


def reach_model(model: Model, states: dict[str, dict], values: dict[str, str]) -> str:
    """The sequential design (assumptions on the cycle's own values) and a
    cover of "the next state is the dead end's"."""
    out = model.lines[:model.start + 1]
    skip: set[int] = set()
    for cell in model.cells:
        flavor = _flavor(cell)
        if flavor and flavor != "assume":
            skip.update(range(cell.start, cell.end + 1))
    for i in range(model.start + 1, model.end):
        if i in skip:
            continue
        out.append(model.lines[i])
    names = sorted(values)
    # the next state (D) is the dead end's; a constant keeps its value
    sig = "{ " + " ".join(states[n]["q"] if states[n]["kind"] == "$anyconst" else states[n]["d"] for n in names) + " }"
    const = "{ " + " ".join(f"{states[n]['width']}'{values[n]}" for n in names) + " }"
    width = sum(states[n]["width"] for n in names)
    out.append("  wire \\__pm_reach_hit")
    out += _logic("$eq", "\\__pm_reach_eq", "\\__pm_reach_hit", sig, width, const, width)
    out += _block("$cover", "\\__pm_reach", {}, {"\\A": "\\__pm_reach_hit", "\\EN": "1'1"})
    out += model.lines[model.end:]
    return "\n".join(out) + "\n"


def untriggered(text: str) -> str:
    """Every check without its clock trigger: evaluated on the cycle's own values."""
    out = []
    for line in text.splitlines():
        if re.match(r"^    parameter \\TRG_WIDTH ", line):
            line = "    parameter \\TRG_WIDTH 0"
        elif re.match(r"^    parameter \\TRG_ENABLE ", line):
            line = "    parameter \\TRG_ENABLE 0"
        elif re.match(r"^    parameter \\TRG_POLARITY ", line):
            line = "    parameter \\TRG_POLARITY 0'x"
        elif re.match(r"^    connect \\TRG ", line):
            line = "    connect \\TRG { }"
        out.append(line)
    return "\n".join(out) + "\n"


_VALUE = re.compile(r"Value for anyconst in \S+ \((\S+)\): (\S+)")


def _bits(value: str, width: int) -> str:
    if re.fullmatch(r"[01]+", value) and len(value) == width:
        return value
    return format(int(value), f"0{width}b")[-width:]


def check(prepared, cut: list[str], without: list[str], depth: int, timeout: int, run_tree,
          max_candidates: int = MAX_CANDIDATES) -> dict:
    """-> {status: none | found | not_found, message, cycle?, state?, candidates}
    none: no state at all is a dead end (proven); found: one is reached
    (cycle, the registers' values, the trace); not_found: the states found
    were not reached within `depth` cycles."""
    from app.praman.services.formal_service import design_edits
    from app.praman.services.sby_generator import sanitize_filename
    from app.praman.services.yosys_reader import MONITOR_FILE, read_commands
    top = prepared.top
    work = Path(tempfile.mkdtemp(prefix="pm_deadend_"))
    try:
        files = prepared.sources(0)
        files[MONITOR_FILE] = prepared.monitor_text
        names = []
        for name, body in files.items():
            (work / sanitize_filename(name)).write_text(body)
            names.append(sanitize_filename(name))
        edits = design_edits(top, list(cut), list(without)) or ["flatten"]
        script = [*read_commands(names, top, prepared.reader), *(prepared.script or []), f"prep -top {top}", *edits,
                  "flatten", "chformal -assert -cover -live -fair -remove", "opt_clean", "write_rtlil pre.il"]
        done = run_tree(["yosys", "-q", "-p", "; ".join(script)], timeout=timeout, cwd=str(work))
        if done.returncode != 0:
            raise DeadEndError(f"the design could not be prepared: {(done.stderr or done.stdout).strip()[-300:]}")
        # an assumption in a clocked block holds on the cycle's own values (before the edge): its
        # trigger goes before async2sync, which would otherwise check it a cycle late through registers
        (work / "pre2.il").write_text(untriggered((work / "pre.il").read_text()))
        done = run_tree(["yosys", "-q", "-p", f"read_rtlil pre2.il; hierarchy -top {top}; memory_map; async2sync; "
                                              "dffunmap; opt_clean; write_rtlil base.il"],
                        timeout=timeout, cwd=str(work))
        if done.returncode != 0:
            raise DeadEndError(f"the design could not be prepared: {(done.stderr or done.stdout).strip()[-300:]}")
        lines, start, end = _module((work / "base.il").read_text(), top)
        cells = _cells(lines, start, end)
        latches = [c for c in cells if c.type.startswith("$dlatch") or c.type.startswith("$sr")]
        if latches:
            raise DeadEndError("the design has latches; the dead-end check works on flip-flops only")
        model = Model(lines, start, end, cells, top)
        if not model.assumes():
            return {"status": "none", "message": "There is no assumption, so there is no dead end.", "candidates": 0}

        excluded: list[dict[str, str]] = []
        for attempt in range(max_candidates):
            text, states = qbf_model(model, excluded)
            (work / "qbf.il").write_text(text)
            done = run_tree(["yosys", "-p", f"read_rtlil qbf.il; hierarchy -top {top}; opt_clean; "
                                            f"qbfsat -show-smtbmc -solver yices -timeout {timeout}"],
                            timeout=timeout + 30, cwd=str(work))
            output = done.stdout + done.stderr
            if "Status: FAILED" in output:
                if attempt == 0:
                    return {"status": "none", "candidates": 0,
                            "message": "No dead end: in every state, some input satisfies all the assumptions."}
                return {"status": "not_found", "candidates": attempt,
                        "message": f"No dead end within {depth} cycles: the {attempt} candidate state"
                                   f"{'s' if attempt != 1 else ''} where no input satisfies the assumptions "
                                   f"{'are' if attempt != 1 else 'is'} not reached from reset, and there is no other."}
            if "Satisfiable model" not in output or done.returncode != 0:
                said = [l.split("smtbmc output:", 1)[-1].strip() for l in output.splitlines()
                        if "ERROR" in l or "not found" in l or "rror:" in l]
                raise DeadEndError("the solver gave no answer"
                                   + (f": {said[-1][-300:]}" if said else f" within {timeout} s"))
            values = {m.group(1): _bits(m.group(2), states[m.group(1)]["width"])
                      for m in _VALUE.finditer(output) if m.group(1) in states}
            if not values:
                # the assumptions break whatever the state: the very first cycle is a dead end
                return {"status": "found", "cycle": 0, "state": [], "candidates": attempt + 1,
                        "message": "Dead end: no input satisfies the assumptions in any state, so no trace "
                                   "can start; every property holds vacuously."}
            (work / "reach.il").write_text(reach_model(model, states, values))
            (work / "reach.sby").write_text(
                f"[options]\nmode cover\ndepth {depth}\n\n[engines]\nsmtbmc yices\n\n"
                f"[script]\nread_rtlil reach.il\nhierarchy -top {top}\n\n[files]\nreach.il\n")
            from app.praman.services.proc import sby_environment
            done = run_tree(["sby", "-f", "reach.sby"], timeout=timeout * 2 + 60, cwd=str(work),
                            env=sby_environment()[0])
            log = (work / "reach" / "logfile.txt")
            text = log.read_text() if log.exists() else done.stdout
            m = re.search(r"Reached cover statement (?:at \S+ )?in step (\d+)|Reached cover statement in step (\d+)", text)
            state = []
            for n in sorted(values):
                signal = states[n]["q"].replace("\\", "").strip()
                if states[n]["kind"] == "$initstate" or signal.startswith("__va_harness."):
                    continue                     # the reset sequence's own counter
                state.append({"signal": signal, "value": values[n],
                              "checker": signal.startswith("__va_mon") or ".__va_mon." in signal})
            if m:
                step = int(m.group(1) or m.group(2))
                return {"status": "found", "cycle": step + 1, "state": state, "candidates": attempt + 1,
                        "message": f"Dead end at cycle {step + 1}: the design reaches a state in which no input "
                                   f"satisfies all the assumptions, so no trace goes on from there."}
            excluded.append(values)
        return {"status": "not_found", "candidates": max_candidates,
                "message": f"No dead end found within {depth} cycles: the first {max_candidates} candidate states "
                           f"(states where no input satisfies the assumptions) are not reached from reset. "
                           f"This is not a proof that there is none."}
    finally:
        clear_inside(work, Path(tempfile.gettempdir()))
