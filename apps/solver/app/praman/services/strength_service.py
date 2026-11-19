"""
Assertion strength by mutation analysis (like Jasper's coverage / MCY).

A completed job's design is mutated many times with Yosys `mutate` (a bit
inverted, stuck at 0/1, or inverted under a condition, one place at a
time); each mutant is checked against the assertions that passed on the
original design.  A mutant no assertion catches marks design logic the
assertions do not check.  Score = mutants detected / mutants checked; a survivor that
changes none of the design's outputs (a miter, _equivalent) is 'equivalent' and not checked.
"""

from __future__ import annotations

import logging
import re
import subprocess
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from app.praman import ceilings
from app.praman.services.proc import run_tree, sby_environment
from app.praman.services.compile_worker import run_isolated
from app.praman.services.sby_generator import FORMAL_WORK_DIR, generate_files_project
from app.praman.services.sva.pipeline import PreparedDesign, prepare_checked
from app.praman.services.yosys_reader import MONITOR_FILE, read_commands
from app.workspace import clear_inside

logger = logging.getLogger("veriassist.strength")

PASSING = {"PROVEN", "HOLDS_BOUNDED"}
_MODES = {
    "inv": "inverted",
    "const0": "stuck at 0",
    "const1": "stuck at 1",
    "cnot0": "inverted when another bit is 0",
    "cnot1": "inverted when another bit is 1",
}


@dataclass
class StrengthRun:
    job_id: str
    status: str = "running"          # running | complete | failed
    message: str = ""
    total: int = 0
    done: int = 0
    mutants: list[dict] = field(default_factory=list)
    assertions: list[str] = field(default_factory=list)
    elapsed_seconds: float = 0.0
    unmutable_lines: list[int] = field(default_factory=list)   # asked-for lines with no cell to mutate
    limits: list[int] = field(default_factory=list)            # seconds a mutant gets: first pass, then the undecided again
    calibration_seconds: Optional[float] = None                # the bounded check of the unchanged design

    def to_dict(self) -> dict[str, Any]:
        checked = [m for m in self.mutants if m["status"] in ("detected", "survived")]
        detected = [m for m in checked if m["status"] == "detected"]
        per_assertion = {a: sum(1 for m in detected if a in m["detected_by"]) for a in self.assertions}
        return {
            "job_id": self.job_id, "status": self.status, "message": self.message,
            "total": self.total, "done": self.done,
            "detected": len(detected), "checked": len(checked),
            "equivalent": sum(1 for m in self.mutants if m["status"] == "equivalent"),
            "score": round(100 * len(detected) / len(checked), 1) if checked else None,
            "per_assertion": per_assertion, "mutants": self.mutants,
            "elapsed_seconds": round(self.elapsed_seconds, 1),
            "unmutable_lines": self.unmutable_lines,
            "timed_out": sum(1 for m in self.mutants if m["status"] == "timeout"),
            "errors": sum(1 for m in self.mutants if m["status"] == "error"),
            "limits": self.limits, "calibration_seconds": self.calibration_seconds,
        }


_runs: dict[str, StrengthRun] = {}


def get_strength(job_id: str) -> Optional[StrengthRun]:
    return _runs.get(job_id)


def new_run(job_id: str) -> StrengthRun:
    """Register a run (visible to pollers before it starts)."""
    run = StrengthRun(job_id)
    _runs[job_id] = run
    return run


def run_strength(job, service, count: int = 20, workers: int = 4, timeout: int = 120,
                 run: Optional[StrengthRun] = None, lines: Optional[set[int]] = None,
                 observed: Optional[dict[str, tuple[set[int], list[str]]]] = None,
                 budget: Optional[float] = None) -> StrengthRun:
    """Mutation analysis of a completed slang-front-end job (blocking).
    `lines`: design lines to mutate first (the agent passes the lines its
    proofs rely on, so each requirement gets mutants of its own).  `budget`
    (seconds, FORMAL_MUTATION_BUDGET, default 1800): a mutant not started by
    then is not run ("not_run"), so it counts neither way.

    `timeout` is the longest a mutant may take.  The time a mutant gets is
    sized to the design: the bounded check of the unchanged design is timed
    first (T), every mutant gets max(30 s, 3 T + 10 s) (at most `timeout`), and
    only those still undecided get `timeout` in a second pass.  Most mutants are
    caught in seconds; the time goes where it is needed.  One undecided even
    then is "timeout": not measured, neither caught nor survived."""
    run = run or new_run(job.job_id)
    t0 = time.time()
    try:
        _analyse(run, job, service, count, workers, timeout, lines, observed,
                 ceilings.seconds(budget if budget is not None
                                  else float(os.environ.get("FORMAL_MUTATION_BUDGET", "") or 1800)))
        run.status = "complete"
    except Exception as e:      # reported to the UI, never raised into the thread pool
        logger.exception(f"[{job.job_id}] mutation analysis failed")
        run.status, run.message = "failed", str(e)
    run.elapsed_seconds = time.time() - t0
    return run


def _analyse(run: StrengthRun, job, service, count: int, workers: int, timeout: int,
             lines: Optional[set[int]] = None,
             observed: Optional[dict[str, tuple[set[int], list[str]]]] = None, budget: float = 1800) -> None:
    if job.result is None:
        raise ValueError("the job has no results yet")
    run.assertions = [a["name"] for a in job.result.assertion_results
                      if a.get("type") == "ASSERT" and a.get("verdict") in PASSING]
    if not run.assertions:
        raise ValueError("no assertion passed on the original design, so there is nothing to measure")

    files = {}
    if job.dut_code:
        files[job.dut_filename or "design.sv"] = job.dut_code
    sva = {"sva.sv": job.sva_code} if job.sva_code.strip() else {}
    prepared = run_isolated(prepare_checked, files, sva, job.dut_top, job.reset_signal, job.reset_polarity,
                            clock_signal=job.clock_signal, auto_checks=job.auto_checks)
    monitor = service._isolate(prepared.monitor_text, set(run.assertions))
    mutations, unmutable = _list_mutations(prepared, monitor, count, prefer_lines=lines, design_files=set(files))
    run.unmutable_lines = sorted(unmutable)
    if not mutations:
        raise ValueError("Yosys found nothing to mutate in the design")
    run.total = len(mutations)
    sources = {**files, **sva}
    run.mutants = [{"index": i, **_describe(m, sources), "command": m, "status": "pending",
                    "detected_by": []} for i, m in enumerate(mutations)]

    base = FORMAL_WORK_DIR / f"{job.job_id}__strength"
    clear_inside(base, FORMAL_WORK_DIR)
    deadline = time.monotonic() + budget
    from app.praman.services.formal_service import design_edits

    def bounded(name: str, command: Optional[str], limit: int):
        """The bounded check of the assertions, on the design with `command` (a mutation) or unchanged."""
        run_dir = base / name
        sources = prepared.sources(0)
        sources[MONITOR_FILE] = monitor
        prep, extra = _with_mutation(prepared.script, command) if command else (prepared.script, None)
        # stopat and assumptions left out, as in the proof (after the mutation: it names unflattened cells)
        extra = [*(extra or []), *design_edits(prepared.top, getattr(service, "cut", []),
                                               getattr(service, "without", []))] or None
        project = generate_files_project(
            str(run_dir), run_dir.name, sources, prepared.top, mode="bmc",
            depth=job.depth * prepared.steps_per_cycle, engine="smtbmc --keep-going",
            solver=job.solver, timeout=limit, reader=prepared.reader, multiclock=prepared.multiclock,
            prep_script=prep, extra_script=extra)
        try:
            return service._run_sby(project.sby_file, project.work_dir, limit)
        finally:
            clear_inside(run_dir, FORMAL_WORK_DIR)

    # how long a mutant should take: the unchanged design's check, timed
    started = time.monotonic()
    calibration = bounded("calibration", None, timeout)
    run.calibration_seconds = round(time.monotonic() - started, 1)
    first = timeout if calibration.status not in ("PASS", "FAIL") \
        else int(min(timeout, max(30, 3 * run.calibration_seconds + 10)))
    run.limits = [first] if first >= timeout else [first, timeout]

    def check(mutant: dict, limit: int) -> None:
        if time.monotonic() > deadline:
            mutant.update(status="not_run", message=f"the mutation budget ({budget:.0f} s) ran out")
            run.done += 1
            return
        result = bounded(f"m{mutant['index']:03d}", mutant["command"], limit)
        failed = {a["name"].split(".")[-1] for a in result.assertion_results if a.get("status") == "FAIL"}
        detected = sorted(failed & set(run.assertions))
        if detected:
            mutant.update(status="detected", detected_by=detected, message="")
        elif result.status in ("PASS", "FAIL"):
            mutant.update(status="survived", message="")
        elif result.status == "TIMEOUT":
            mutant.update(status="timeout", message=f"not decided in {limit} s")
        else:
            mutant.update(status="error", message=(result.error_message or result.status)[-300:])
        run.done += 1

    with ThreadPoolExecutor(max_workers=max(1, workers), thread_name_prefix="mutant") as pool:
        list(pool.map(lambda m: check(m, run.limits[0]), run.mutants))
        undecided = [m for m in run.mutants if m["status"] == "timeout"]
        if len(run.limits) > 1 and undecided:          # the undecided again, with the longest limit
            run.done -= len(undecided)
            list(pool.map(lambda m: check(m, run.limits[1]), undecided))
        # a survivor may change nothing a design's outputs show (`remaining != 0` with a bit of a
        # nonzero `remaining` flipped): no property could catch it, so it does not count
        survivors = [m for m in run.mutants if m["status"] == "survived"]
        full = {**prepared.sources(0), MONITOR_FILE: monitor}
        steps = job.depth * prepared.steps_per_cycle
        for mutant, same in zip(survivors, pool.map(
                lambda m: _equivalent(prepared, full, m["command"], steps, base / f"eq{m['index']:03d}", timeout),
                survivors)):
            if same:
                mutant["status"] = "equivalent"
        # a survivor on a requirement's lines that changes none of the signals that requirement's
        # properties read is invisible to it (a module used twice: its other instance is another
        # requirement's, or out of scope) and does not count against it
        checks = [(m, req, sigs) for m in run.mutants if m["status"] == "survived"
                  for req, (req_lines, sigs) in (observed or {}).items()
                  if sigs and _on_lines(m["command"], req_lines)]
        for (mutant, req, _), same in zip(checks, pool.map(
                lambda c: _equivalent(prepared, full, c[0]["command"], steps,
                                      base / f"inv{c[0]['index']:03d}_{c[1]}", timeout, observe=c[2]), checks)):
            if same:
                mutant.setdefault("invisible_to", []).append(req)
    clear_inside(base, FORMAL_WORK_DIR)


_ALL = 1_000_000          # more mutations than any design has: Yosys then lists every candidate
_LOCATED_LINES = 2        # a mutation spanning more lines cannot be placed on one line


def _on_lines(command: str, lines: set[int]) -> bool:
    first, last = source_lines(command)
    return first >= 0 and any(first <= n <= last for n in lines)


def _equivalent(prepared: PreparedDesign, sources: dict[str, str], command: str, depth: int, work: Path,
                timeout: int, observe: Optional[list[str]] = None) -> bool:
    """Whether a mutant shows no difference on the design's outputs (or, with `observe`, on
    those signals only) within `depth` steps: the
    design and the mutant side by side on the same inputs (a Yosys miter), both from the same
    initial state (every flip-flop 0) and the harness's reset, the property monitors' assertions
    removed (their assumptions, the environment, kept).  BMC finds no output that differs ->
    equivalent (within the depth).  Any tool problem -> False: the mutant keeps counting as a survivor."""
    work.mkdir(parents=True, exist_ok=True)
    files = dict(sources)
    for name, text in files.items():
        (work / name).write_text(text)
    at = mutation_point(prepared.script)
    top = prepared.top
    before = [*prepared.script[:at]] if at is not None else [*prepared.script, f"prep -top {top}"]
    after = [*prepared.script[at:], f"prep -top {top}"] if at is not None else []
    # observe: compare only these signals (made outputs; every other output stops being one)
    look = [] if not observe else [f"expose {' '.join('w:' + s for s in observe)}",
                                    f"delete -port o:* {' '.join('w:' + s for s in observe)} %d"]
    finish = [*after, "flatten", "chformal -assert -cover -live -fair -remove", "setundef -undriven -zero",
              "setundef -init -zero", "opt_clean", *look]
    script = (read_commands(list(files), top, prepared.reader) + before + ["design -save base"]
              + finish + [f"rename {top} gold", "design -stash gold", "design -load base", command]
              + finish + [f"rename {top} gate", "design -stash gate",
                          "design -copy-from gold -as gold gold", "design -copy-from gate -as gate gate",
                          "miter -equiv -flatten -make_assert -ignore_gold_x gold gate miter",
                          "hierarchy -top miter", "write_rtlil miter.il"])
    try:
        built = subprocess.run(["yosys", "-q", "-p", "; ".join(script)], cwd=work, capture_output=True,
                               text=True, timeout=300)
        if built.returncode != 0 or not (work / "miter.il").exists():
            return False
        (work / "eq.sby").write_text(f"[options]\nmode bmc\ndepth {depth}\n\n[engines]\nsmtbmc yices\n\n"
                                     f"[script]\nread_rtlil miter.il\nprep -top miter\n\n[files]\nmiter.il\n")
        env = sby_environment()[0]
        run = run_tree(["sby", "-f", "eq.sby"], cwd=work, timeout=timeout, **({"env": env} if env else {}))
        return run.returncode == 0 and "DONE (PASS" in run.stdout
    except (OSError, subprocess.TimeoutExpired):
        return False


def mutation_point(script: list[str]) -> Optional[int]:
    """Where in the prep script mutations are listed and applied when the script flattens the
    design with the property monitors (it does when a checker has helper wires): just before the
    flatten.  After it, Yosys merges a design expression with the identical expression of a property
    (`!start && running` in both), and a mutant of the shared cell changes the property too - it can
    never be caught.  Before it, the design's cells are its own.  None: the script does not flatten,
    the monitors stay modules of their own, and mutations go after `prep` as before."""
    return next((i for i, cmd in enumerate(script) if cmd.split()[:1] == ["flatten"]), None)


def _with_mutation(script: list[str], command: str) -> tuple[list[str], list[str]]:
    """(prep script, extra script) that apply one mutation at the mutation point."""
    at = mutation_point(script)
    if at is None:
        return list(script), [command]
    return [*script[:at], command, *script[at:]], []


def source_lines(command: str) -> tuple[int, int]:
    """The narrowest source range (first, last line) a mutation names; (-1, -1) if none."""
    ranges = [(int(a), int(b or a)) for a, b in re.findall(r"-src \S+?:(\d+)(?:\.\d+)?(?:-(\d+)(?:\.\d+)?)?", command)]
    return min(ranges, key=lambda r: r[1] - r[0]) if ranges else (-1, -1)


def _list_mutations(prepared: PreparedDesign, monitor: str, count: int,
                    prefer_lines: Optional[set[int]] = None,
                    design_files: Optional[set[str]] = None) -> tuple[list[str], set[int]]:
    """`mutate` commands for the design (not the monitors or the harness),
    listed in the same Yosys state the checks will apply them in.  With
    `prefer_lines`, every candidate is listed, those on the lines come first
    (spread over them), and the lines with no candidate at all are returned:
    a plain connection or a constant (`assign o = r;`) has no cell to mutate."""
    files = prepared.sources(0)
    files[MONITOR_FILE] = monitor
    with tempfile.TemporaryDirectory(prefix="va_mut_") as tmp:
        for name, text in files.items():
            (Path(tmp) / name).write_text(text)
        script = "; ".join(read_commands(list(files), prepared.top, prepared.reader)
                           + ([*prepared.script[:at]] if (at := mutation_point(prepared.script)) is not None
                              else [*prepared.script, f"prep -top {prepared.top}"])
                           + [f"mutate -list {_ALL if prefer_lines else count * 4} -seed 1 -o mutations.ys"])
        result = subprocess.run(["yosys", "-q", "-p", script], cwd=tmp,
                                capture_output=True, text=True, timeout=300)
        out = Path(tmp) / "mutations.ys"
        if result.returncode != 0 or not out.exists():
            raise ValueError("Yosys could not list mutations: "
                             + (result.stderr or result.stdout).strip()[-300:])
        lines = [l.strip() for l in out.read_text().splitlines() if l.startswith("mutate ")]
    # only the design: not the monitors, the harness or their connections, and not the property
    # file's own logic (a checker's helper wire, `__next_x = x - 1`): every source a mutation names
    # must be a design file, else a "surviving mutant" is a changed property, not untested RTL
    # the design's own files (the caller knows them); else every source but the monitors, the
    # harness and the property file
    design_files = {Path(n).name for n in design_files} if design_files else \
        {Path(n).name for n in files if n != MONITOR_FILE and not Path(n).name.startswith("va_") and n != "sva.sv"}
    design = [l for l in lines if "__va" not in l
              and _sources(l) and all(s.rsplit(":", 1)[0] in design_files for s in _sources(l))]
    chosen, seen = [], set()
    unmutable: set[int] = set()
    if prefer_lines:
        # one per preferred line in turn, so every relied-on line gets a mutant before any gets two
        by_line: dict[int, list[str]] = {}
        for line in design:
            first, last = source_lines(line)
            if last - first >= _LOCATED_LINES:
                continue                             # not placeable on a line: no use to a requirement
            hit = sorted(n for n in prefer_lines if first <= n <= last)
            if hit:
                by_line.setdefault(hit[0], []).append(line)
        if len(lines) < _ALL:                        # Yosys listed every candidate there is
            ranges = [source_lines(l) for l in design]
            unmutable = {n for n in prefer_lines if not any(a <= n <= b for a, b in ranges)}
        while len(chosen) < count and any(by_line.values()):
            for n in sorted(by_line):
                if by_line[n] and len(chosen) < count:
                    chosen.append(by_line[n].pop(0))
    # spread over the design: distinct source locations first
    for line in design:
        src = _sources(line)[:1]
        if len(chosen) >= count:
            break
        if line not in chosen and tuple(src) not in seen:
            seen.add(tuple(src))
            chosen.append(line)
    for line in design:
        if len(chosen) >= count:
            break
        if line not in chosen:
            chosen.append(line)
    return chosen[:count], unmutable


def _sources(line: str) -> list[str]:
    return re.findall(r"-src (\S+)", line)


_CELLS = [  # (cell name pattern, what it is)
    (r"_CMP\d*$", "case comparison"), (r"^\$procmux", "if/case result"), (r"^\$procdff", "register"),
    (r"^\$(lt|le|gt|ge|eq|ne|eqx|nex)\$", "comparison"), (r"^\$(add|sub|mul|neg)\$", "arithmetic"),
    (r"^\$(and|or|xor|xnor|not|logic_\w+|reduce_\w+)\$", "logic"), (r"^\$(shl|shr|sshl|sshr)\$", "shift"),
    (r"^\$(mux|pmux)\$", "multiplexer"), (r"^\$", "logic"),
]
_PORTS = {"A": "input", "B": "input", "S": "select", "Y": "output", "D": "next value", "Q": "value",
          "WR_DATA": "write data", "WR_ADDR": "write address", "RD_ADDR": "read address",
          "RD_DATA": "read data", "WR_EN": "write enable"}


def _describe(line: str, files: Optional[dict[str, str]] = None) -> dict[str, str]:
    def opt(name: str) -> str:
        m = re.search(rf"-{name} (\S+)", line)
        return m.group(1) if m else ""
    srcs = _sources(line)
    # declaration, expression, enclosing statement: the expression is the
    # most specific place
    where = srcs[-2] if len(srcs) >= 2 else (srcs[0] if srcs else "")
    loc = re.match(r"(.+?):(\d+)", where)
    mode = _MODES.get(opt("mode"), opt("mode"))
    if opt("wire"):
        what = f"{opt('wire').lstrip(chr(92))}[{opt('wirebit')}]"
    else:
        cell = opt("cell").lstrip(chr(92))
        kind = next((k for pattern, k in _CELLS if re.search(pattern, cell)), f"memory {cell}")
        article = "an" if kind[0] in "aeiou" else "a"
        what = f"bit {opt('portbit')} of {article} {kind} {_PORTS.get(opt('port'), opt('port'))}"
    code = ""
    if loc and files and loc.group(1) in files:
        lines = files[loc.group(1)].splitlines()
        n = int(loc.group(2))
        code = " ".join(lines[n - 1].split()) if 0 < n <= len(lines) else ""
    return {
        "location": f"{loc.group(1)}:{loc.group(2)}" if loc else where,
        "mutation": f"{what} {mode}",
        "code": code,
    }
