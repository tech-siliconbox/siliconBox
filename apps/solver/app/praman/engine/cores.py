"""
Proof-core coverage (docs/agent/PRD.md §16.2, M4.6): which RTL lines the
proofs rely on.

For each line of the design that holds logic, the line is cut: every
value it assigns and every condition it tests is replaced by an undriven
wire, which the model export turns into a free input (setundef -anyseq),
and the assertions that were PROVEN are proven again.  If they all still hold, no
proof needed that line: it is listed as "not relied on by any proof" -
usually a missing requirement or a property that is too weak.  A proof that
breaks names the properties that rely on the line.

This is the cut-point form of an unsat core: coarser than a solver core
(one line at a time) but exact for what it reports, and it needs no
instrumented model.  (A Yosys `cutpoint` on the line's cells would miss
plain connections such as `assign out = r;`, which create no cell.)  Bounded results count as nothing here: only PROVEN
properties are re-proven.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Optional

from app.praman import ceilings
from app.praman.engine.api import EngineJob
from app.workspace import clear_inside


@dataclass
class LineCoverage:
    relied_on: dict[int, list[str]] = field(default_factory=dict)    # line -> properties whose proof needs it
    unused: list[int] = field(default_factory=list)                  # lines no proof relies on
    unknown: dict[int, str] = field(default_factory=dict)            # line -> why it could not be decided
    proven: list[str] = field(default_factory=list)
    outside_cone: list[int] = field(default_factory=list)            # unused without a proof: no assertion sees them

    @property
    def coverage(self) -> Optional[float]:
        decided = len(self.relied_on) + len(self.unused)
        return round(len(self.relied_on) / decided, 4) if decided else None

    def to_dict(self) -> dict:
        return {"coverage": self.coverage, "relied_on": self.relied_on, "unused": self.unused,
                "unknown": self.unknown, "proven": self.proven, "outside_cone": self.outside_cone}


def logic_lines(rtl: str) -> list[int]:
    """Lines that can hold logic: assignments and conditions (not declarations or comments)."""
    out = []
    for n, line in enumerate(rtl.splitlines(), 1):
        code = re.sub(r"//.*", "", line).strip()
        if not code or re.match(r"^((module|endmodule|input|output|inout|logic|wire|reg|localparam|parameter|"
                                r"end|begin|endcase|for)\b|default\s*:\s*$|\)|\);|`)", code):
            continue
        if re.search(r"<=|(?<![=!<>])=(?!=)|\bif\s*\(|\bcase\s*\(|\?", code):
            out.append(n)
    return out


_ASSIGN = re.compile(r"(?<![=!<>])(<=|=)(?!=)\s*([^;]+);")
_COND = re.compile(r"\b(if|case)\s*\(")
CUT = "__va_cut"


def _balanced(text: str, start: int) -> int:
    """Index just past the parenthesis matching the one at `start`."""
    depth = 0
    for i in range(start, len(text)):
        depth += {"(": 1, ")": -1}.get(text[i], 0)
        if depth == 0:
            return i + 1
    return len(text)


def cut_line(rtl: str, n: int, keep: tuple[str, ...] = ()) -> Optional[str]:
    """`rtl` with line n's assigned values and tested conditions made free, or
    None if the line has nothing to cut.  Conditions on a name in `keep`
    (the reset) stay: an asynchronous reset must remain an edge event."""
    lines = rtl.splitlines()
    line = lines[n - 1]
    code, comment = (line.split("//", 1) + [""])[:2]
    count = 0

    def fresh() -> str:
        nonlocal count
        count += 1
        return f"{CUT}{n}_{count}"
    for m in reversed(list(_COND.finditer(code))):
        open_at = code.index("(", m.end() - 1)
        close = _balanced(code, open_at)
        if any(re.search(rf"\b{re.escape(k)}\b", code[open_at:close]) for k in keep if k):
            continue
        code = code[:open_at] + f"({fresh()}[0])" + code[close:]
    code = _ASSIGN.sub(lambda m: f"{m.group(1)} {fresh()};", code)
    if not count:
        return None
    lines[n - 1] = code + (f"//{comment}" if comment else "")
    # the declarations go into the module holding line n (a file may hold several modules)
    start = next((i for i in range(n - 1, -1, -1) if re.match(r"\s*module\b", lines[i])), None)
    if start is None or any(re.match(r"\s*endmodule\b", x) for x in lines[start:n - 1]):
        return None                     # not inside a module (a package's function): nothing to cut into
    header_end = next((i for i in range(start, n - 1) if re.search(r"\);\s*(//.*)?$", lines[i])), None)
    if header_end is None:
        return None
    decls = [f"    logic [1023:0] {CUT}{n}_{i};" for i in range(1, count + 1)]
    return "\n".join(lines[:header_end + 1] + decls + lines[header_end + 1:]) + "\n"


_SRC = re.compile(r'attribute \\src "([^"]*)"')


def cone_lines(job: EngineJob, proven: list[str]) -> Optional[set[int]]:
    """The design lines in the cone of influence of the `proven` assertions: a line whose logic
    (its cells' source positions) or whose assigned signal (by name, for plain connections, which
    leave no cell) feeds an assertion, through any number of cells and flip-flops.  A line outside
    it cannot change what the assertions see, so cutting it never breaks a proof: it needs no
    re-proof.  None when the cone cannot be computed (then every line is checked)."""
    import subprocess
    import uuid
    from pathlib import Path

    from app.praman.services.compile_worker import run_isolated
    from app.praman.services.formal_service import FormalService, compile_design
    from app.praman.services.sby_generator import FORMAL_WORK_DIR, sanitize_filename
    from app.praman.services.yosys_reader import MONITOR_FILE, read_commands
    try:
        prepared = run_isolated(compile_design, job.sva, job.rtl, job.rtl_name, job.top, reset_signal=job.reset,
                                reset_polarity=job.reset_polarity, clock_signal=job.clock)
        files = prepared.sources(0)
        files[MONITOR_FILE] = FormalService()._isolate(prepared.monitor_text, set(proven))
        root = Path(FORMAL_WORK_DIR) / f"{job.name or 'cone'}_cone_{uuid.uuid4().hex[:6]}"
        root.mkdir(parents=True)
        names = []
        for name, body in files.items():
            (root / sanitize_filename(name)).write_text(body)
            names.append(sanitize_filename(name))
        # before any optimisation: opt would merge a design cell with an identical monitor cell and
        # keep only one source position.  The assertions and the assumptions: a line feeding an
        # assumption changes what is assumed.
        script = [*read_commands(names, prepared.top, prepared.reader), *prepared.script,
                  f"hierarchy -top {prepared.top}", "proc", "flatten",
                  "select -set props t:$assert t:$assume t:$check", "select @props %ci*",
                  "write_rtlil -selected cone.il"]
        (root / "cone.ys").write_text("\n".join(script) + "\n")
        subprocess.run(["yosys", "-q", "cone.ys"], cwd=root, capture_output=True, text=True,
                       timeout=job.timeout, check=True)
        text = (root / "cone.il").read_text(errors="replace")
    except Exception:                   # noqa: BLE001 - any failure: every line is checked
        return None
    finally:
        if "root" in locals():
            clear_inside(root, Path(FORMAL_WORK_DIR))
    rtl_file = sanitize_filename(job.rtl_name)
    rtl_lines = job.rtl.splitlines()
    # the module each line is in (a joined file holds many): a name matches only in its own module
    owner: list[Optional[int]] = [None] * (len(rtl_lines) + 2)
    top_start, current = None, None
    for n, line in enumerate(rtl_lines, 1):
        if m := re.match(r"\s*module\s+([A-Za-z_]\w*)", line):
            current = n
            if m.group(1) == job.top:
                top_start = n
        owner[n] = current
        if re.match(r"\s*endmodule\b", line):
            current = None

    def positions(src: str) -> list[tuple[int, int]]:
        out = []
        for part in src.split("|"):
            m = re.match(rf"(?:.*/)?{re.escape(rtl_file)}:(\d+)\.\d+-(\d+)\.\d+", part)
            if m:
                out.append((int(m.group(1)), int(m.group(2))))
        return out

    out: set[int] = set()
    names: dict[Optional[int], set[str]] = {}          # module (its first line) -> names in the cone
    module_of_wire: dict[str, Optional[int]] = {}
    pending: list[str] = []                             # the attributes before the next object
    aliases: list[str] = []
    for line in text.splitlines():
        s = line.strip()
        if m := _SRC.match(s):
            pending.append(m.group(1))
            continue
        if s.startswith("attribute "):
            continue
        if s.startswith("cell "):           # a cell's source position: the statement it came from
            for first, last in positions("|".join(pending)):
                out.update(range(first, last + 1))
        elif s.startswith("wire ") and (w := s.split()[-1].lstrip("\\")) and not w.startswith("$"):
            declared = positions("|".join(pending))
            key = owner[declared[0][0]] if declared else (top_start if "." not in w else None)
            module_of_wire[w] = key
            names.setdefault(key, set()).add(w.rsplit(".", 1)[-1])
        elif s.startswith("connect "):      # an alias Yosys merged (assign gpio_oe = reg_dir): both names
            aliases += [w.lstrip("\\") for w in re.findall(r"\\[^\s\[]+", s)]
        pending = []
    for w in aliases:
        key = module_of_wire.get(w, top_start if "." not in w else None)
        names.setdefault(key, set()).add(w.rsplit(".", 1)[-1])
    # and every name the properties read (in the module they are bound to): a signal tied to a
    # constant (assign pready = 1'b1) leaves no wire for the cone to reach
    names.setdefault(top_start, set()).update(re.findall(r"[A-Za-z_]\w*", re.sub(r"//.*", "", job.sva)))
    anywhere = names.get(None, set())                   # a name whose module is not known
    for n, line in enumerate(rtl_lines, 1):             # the names a line assigns
        targets = re.findall(r"([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*(?:<=|(?<![=!<>])=(?!=))", re.sub(r"//.*", "", line))
        if targets and (names.get(owner[n], set()) | anywhere).intersection(targets):
            out.add(n)
    return out


def _module_span(rtl: str, name: str) -> Optional[tuple[int, int]]:
    """First and last line of module `name` in a file."""
    lines = rtl.splitlines()
    start = next((n for n, l in enumerate(lines, 1) if re.match(rf"\s*module\s+{re.escape(name)}\b", l)), None)
    if start is None:
        return None
    end = next((n for n in range(start, len(lines) + 1) if re.match(r"\s*endmodule\b", lines[n - 1])), len(lines))
    return start, end


def line_coverage(job: EngineJob, proven: list[str], lines: Optional[list[int]] = None,
                  solver: str = "", workers: Optional[int] = None, cone: bool = True,
                  budget: Optional[float] = None) -> LineCoverage:
    """`job`: the design and properties; `proven`: the assertions to re-prove (they were PROVEN).
    Lines are checked `workers` at a time (FORMAL_COVERAGE_PARALLEL, default half the CPUs): each
    check is one native-engine job in its own process, a few tens of MB.  `budget` (seconds,
    FORMAL_COVERAGE_BUDGET, default 1800): a line not started by then is not checked, and is
    reported as such (unknown), never as unused."""
    import time
    from concurrent.futures import ThreadPoolExecutor

    from app.praman.engine.native import NativeEngine
    out = LineCoverage(proven=list(proven))
    if not proven:
        return out
    workers = workers or int(os.environ.get("FORMAL_COVERAGE_PARALLEL", "") or max(1, (os.cpu_count() or 2) // 2))

    budget = budget if budget is not None else float(os.environ.get("FORMAL_COVERAGE_BUDGET", "") or 1800)
    budget = ceilings.seconds(budget)                    # SiliconBox: one check within the ceiling (ADR 0031)
    deadline = time.monotonic() + budget

    def check(line: int):
        if time.monotonic() > deadline:
            return line, "budget"
        rtl = cut_line(job.rtl, line, keep=(job.reset,))
        if rtl is None:
            return line, None
        cut = EngineJob(**{**job.__dict__, "rtl": rtl, "mode": "prove", "name": f"core_l{line}"})
        result = NativeEngine(solver=solver).run(cut, only=set(proven))
        # bounded together is not yet broken: as the engine does, an assertion is tried on its own
        # before the line counts as one its proof needs (a FIFO's order closes only alone)
        if result.ok:
            for label in [p for p in proven if p in result.verdicts and result.verdicts[p].verdict == "HOLDS_BOUNDED"
                          and not result.verdicts[p].timed_out][:4]:
                alone = NativeEngine(solver=solver).run(EngineJob(**{**cut.__dict__, "name": f"core_l{line}_alone"}),
                                                       only={label})
                if alone.ok and label in alone.verdicts and alone.verdicts[label].verdict == "PROVEN":
                    result.verdicts[label] = alone.verdicts[label]
        return line, result

    todo = lines if lines is not None else logic_lines(job.rtl)
    inside = cone_lines(job, proven) if cone else None
    if inside is not None:              # outside the cone: no proof can rely on the line
        # (a line with nothing to cut is left out either way, as the check below leaves it)
        out.outside_cone = [n for n in todo if n not in inside and cut_line(job.rtl, n, keep=(job.reset,))]
        todo = [n for n in todo if n in inside]
    # the top module's lines first: they drive the outputs the requirements name, so a budget that
    # runs out on a large design (a joined IP with its primitives) cuts the primitives' lines
    top = _module_span(job.rtl, job.top)
    if top is not None:
        todo = sorted(todo, key=lambda n: not (top[0] <= n <= top[1]))
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="core") as pool:
        results = list(pool.map(check, todo))
    results += [(n, "outside") for n in out.outside_cone]
    results.sort(key=lambda r: r[0])
    for line, result in results:                    # in line order, whatever finished first
        if result == "outside":
            out.unused.append(line)
            continue
        if result == "budget":
            out.unknown[line] = f"not checked: the coverage budget ({budget:.0f} s) ran out"
            continue
        if result is None:
            continue
        if not result.ok:
            out.unknown[line] = result.error[:160]
            continue
        verdicts = {p: ("TIMEOUT" if result.verdicts[p].timed_out else result.verdicts[p].verdict)
                    for p in proven if p in result.verdicts}
        # FAIL: the cut breaks the property; HOLDS_BOUNDED: the proof loses its induction
        broken = [p for p in proven if verdicts.get(p) in ("FAIL", "HOLDS_BOUNDED")]
        undecided = sorted(p for p, v in verdicts.items() if v not in ("PROVEN", "FAIL", "HOLDS_BOUNDED"))
        if broken:
            out.relied_on[line] = broken
        elif undecided:
            # a timeout (e.g. under load) is no evidence that a proof needs the line
            out.unknown[line] = f"not decided ({', '.join(sorted({verdicts[p] for p in undecided}))}): " \
                                f"{', '.join(undecided[:3])}"
        else:
            out.unused.append(line)
    return out
