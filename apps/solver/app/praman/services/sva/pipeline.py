"""
Prepare a design for formal checking with the slang front end and the SVA
compiler (ADR-001).

Given DUT and SVA sources, produce:
- one monitor module per checked module (compiler.py), plus markers for
  assertions that cannot be checked;
- the Yosys copy of the design: every SVA construct removed (they are all
  compiled into the monitors), each monitor instantiated just before its
  target module's `endmodule` (bind semantics), and a small harness in the
  top module (reset sequence and the optional sanity cover).

Edits are located through slang's syntax tree, never by text matching,
and blanked text keeps its newlines so Yosys messages keep line numbers.
"""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from pyslang import DiagnosticEngine, SourceManager, TextDiagnosticClient, ast, syntax

from app.praman.services.sby_generator import SANITY_COVER_LABEL
from app.praman.services.sva.clocks import ClockInfo, design_clocks
from app.praman.services.sva.compiler import (
    GLOBAL_CLOCK_NET, IN_RESET_NET, RESET_CYCLES, CompiledProperty, Monitor, compile_monitor,
)

HARNESS_MODULE = "__va_harness_core"
from app.praman.services.sva.frontend import FrontendError, elaborate
from app.praman.services.sva.hints import hint_for
from app.praman.services.sva.ir import AssertionKind, AssertionRecord, Unsupported
from app.praman.services.sva.ports import through_bind
from app.praman.services.yosys_reader import (
    HARNESS_FILE, MONITOR_FILE, MONITOR_INSTANCE, SLANG, VERILOG, preferred_reader, read_commands,
)

logger = logging.getLogger("veriassist.sva.pipeline")

UNSUPPORTED_MARKER = "VA_UNSUPPORTED"

_KIND_BY_NAME = {k.value: k for k in AssertionKind}

# Module-level SVA constructs removed from the Yosys copy.
_STRIP_MEMBERS = {
    syntax.SyntaxKind.ConcurrentAssertionMember,
    syntax.SyntaxKind.PropertyDeclaration,
    syntax.SyntaxKind.SequenceDeclaration,
    syntax.SyntaxKind.DefaultDisableDeclaration,
    syntax.SyntaxKind.ClockingDeclaration,
    syntax.SyntaxKind.DefaultClockingReference,
    syntax.SyntaxKind.BindDirective,
    syntax.SyntaxKind.LetDeclaration,
    syntax.SyntaxKind.CheckerDeclaration,
    syntax.SyntaxKind.CovergroupDeclaration,
}

# Immediate assertions in the design: removed from the Yosys copy and
# reported, so they can never fail a run that checks another property.
_IMMEDIATE = {
    syntax.SyntaxKind.ImmediateAssertStatement: "assert",
    syntax.SyntaxKind.ImmediateAssumeStatement: "assume",
    syntax.SyntaxKind.ImmediateCoverStatement: "cover",
}

# Concurrent assertion statements inside procedural code become `;`.
_STRIP_STATEMENTS = {
    syntax.SyntaxKind.AssertPropertyStatement,
    syntax.SyntaxKind.AssumePropertyStatement,
    syntax.SyntaxKind.CoverPropertyStatement,
    syntax.SyntaxKind.CoverSequenceStatement,
    syntax.SyntaxKind.RestrictPropertyStatement,
    syntax.SyntaxKind.ExpectPropertyStatement,
}


@dataclass
class PreparedDesign:
    top: str
    monitors: list[Monitor]
    properties: list[CompiledProperty]
    monitor_text: str                       # all monitors + unsupported markers
    summary: str
    reset: Optional[tuple[str, bool]] = None  # (port, active_low)
    reset_source: str = "none"                # user | sva | name | none
    reader: str = VERILOG                     # Yosys front end (yosys_reader)
    clocks: ClockInfo = field(default_factory=ClockInfo)
    script: list[str] = field(default_factory=list)   # Yosys commands between reading and prep
    _files: dict[str, str] = field(default_factory=dict)
    _edits: dict[str, list[tuple[int, int, str]]] = field(default_factory=dict)
    _harness_at: Optional[tuple[str, int]] = None

    def sources(self, sanity_cycles: int = 0) -> dict[str, str]:
        """Yosys sources; with sanity_cycles > 0 the top also gets the
        sanity cover (design can run that many cycles after reset)."""
        out = {}
        for name, text in self._files.items():
            edits = list(self._edits.get(name, []))
            if self._harness_at and self._harness_at[0] == name:
                edits.append((self._harness_at[1], self._harness_at[1], self.harness(sanity_cycles)))
            # slang's offsets count bytes: apply them to the UTF-8 text, so a non-ASCII character
            # before an edit (a licence header's curly quotes) does not shift it
            data = text.encode()
            for start, end, replacement in sorted(edits, key=lambda e: (e[0], e[1]), reverse=True):
                data = data[:start] + replacement.encode() + data[end:]
            out[name] = data.decode()
        out[HARNESS_FILE] = self.harness_module(sanity_cycles)
        return out

    @property
    def multiclock(self) -> bool:
        return self.clocks.multiclock

    def harness_info(self) -> dict:
        """Reset and clocks the run uses, as reported to the client."""
        return {
            "signal": self.reset[0] if self.reset else "",
            "active_low": self.reset[1] if self.reset else None,
            "source": self.reset_source,
            "clocks": [n.split(".", 1)[-1] for n in self.clocks.nets],
            "multiclock": self.multiclock,
        }

    @property
    def steps_per_cycle(self) -> int:
        """Solver steps per clock cycle: with several free clocks a cycle
        (one low and one high phase) takes at least two."""
        return 2 if self.multiclock else 1

    def harness(self, sanity_cycles: int) -> str:
        """Text inserted into the top module: the harness instance.  The
        harness itself is a separate module (harness_module) read by Yosys's
        own reader, which supports the gclk attribute and liveness cells."""
        conns = [f".in_reset({IN_RESET_NET})"]
        if self.reset is not None:
            conns.append(f".rst({self.reset[0]})")
        conns += [f".c{i}({clk})" for i, clk in enumerate(self.harness_clocks)]
        return ("\n    // ---- formal harness (generated) ----\n"
                f"    wire {IN_RESET_NET};\n"
                f"    {HARNESS_MODULE} __va_harness ({', '.join(conns)});\n")

    @property
    def harness_clocks(self) -> list[str]:
        return self.clocks.top_inputs if self.multiclock else []

    def harness_module(self, sanity_cycles: int) -> str:
        """Reset sequence, sanity cover and (several clocks) clock fairness."""
        return harness_module_text(self.reset, self.harness_clocks, self.steps_per_cycle, sanity_cycles)


def harness_module_text(reset: Optional[tuple[str, bool]], clocks: list[str], steps_per_cycle: int,
                        sanity_cycles: int) -> str:
    """The harness module (HARNESS_MODULE): reset asserted for RESET_CYCLES
    cycles then held inactive (`in_reset` output), the sanity cover, and
    with several free clocks the edge-counted reset and clock fairness."""
    g = GLOBAL_CLOCK_NET
    ports = ["    output wire in_reset"]
    if reset is not None:
        ports.append("    input wire rst")
    ports += [f"    input wire c{i}" for i in range(len(clocks))]
    lines = ["`ifdef FORMAL", f"module {HARNESS_MODULE} (", ",\n".join(ports), ");",
             f"    (* gclk *) wire {g};"]
    if clocks:
        # Several clocks: each is a free input; reset is held until every
        # input clock has had RESET_CYCLES rising edges.
        lines.append("    reg started = 0;")
        lines.append(f"    always @(posedge {g}) started <= 1;")
        for i in range(len(clocks)):
            lines.append(f"    reg prev{i} = 0;")
            lines.append(f"    reg [1:0] edges{i} = 0;")
            lines.append(f"    always @(posedge {g}) begin")
            lines.append(f"        prev{i} <= c{i};")
            lines.append(f"        if (started && c{i} && !prev{i} && edges{i} != 2'd{RESET_CYCLES})")
            lines.append(f"            edges{i} <= edges{i} + 2'd1;")
            lines.append("    end")
        done = " && ".join(f"(edges{i} == 2'd{RESET_CYCLES})" for i in range(len(clocks)))
        lines.append("    reg in_reset_r = 1;")
        lines.append(f"    always @(posedge {g}) in_reset_r <= !({done});")
        lines.append("    assign in_reset = in_reset_r;")
        # Liveness: every clock keeps toggling
        lines.append(f"    always @(posedge {g}) begin")
        for i in range(len(clocks)):
            lines.append(f"        __va_clock_rises{i}: assume property (s_eventually c{i});")
            lines.append(f"        __va_clock_falls{i}: assume property (s_eventually !c{i});")
        lines.append("    end")
    else:
        lines.append("    reg [1:0] reset_cycles = 0;")
        lines.append(f"    always @(posedge {g})")
        lines.append(f"        if (reset_cycles != {RESET_CYCLES}) reset_cycles <= reset_cycles + 1;")
        lines.append(f"    assign in_reset = reset_cycles != {RESET_CYCLES};")
    if reset is not None:
        asserted = "!rst" if reset[1] else "rst"
        # Reset asserted during the reset sequence, inactive afterwards
        lines.append("    always @(*)")
        lines.append(f"        if (in_reset) assume({asserted}); else assume(!({asserted}));")
    if sanity_cycles > 0 and clocks:
        # in solver steps, leaving room for the edge-counted reset
        sanity_cycles = max(1, steps_per_cycle * sanity_cycles - 8)
    if sanity_cycles > 0:
        lines.append("    reg [15:0] cycles = 0;")
        lines.append(f"    always @(posedge {g}) begin")
        lines.append("        if (!in_reset && cycles != 16'hffff) cycles <= cycles + 1;")
        lines.append(f"        if (cycles == {sanity_cycles}) {SANITY_COVER_LABEL}: cover(1);")
        lines.append("    end")
    lines += ["endmodule", "`endif", ""]
    return "\n".join(lines)


def prepare(
    dut_files: dict[str, str],
    sva_files: dict[str, str],
    dut_top: str = "",
    reset_signal: str = "",
    reset_polarity: str = "auto",
    reader: str = "",
    clock_signal: str = "",
    auto_checks: bool = False,
    witness_covers: bool = False,
) -> PreparedDesign:
    """Elaborate, compile and lay out a design.  Raises FrontendError.

    reset_signal / reset_polarity ("auto", "low", "high", "none") override
    the reset the harness drives; see _choose_reset.  clock_signal: input of
    the top module that clocks assertions written without a clock.  reader: the Yosys
    front end ("" = the best available).  With yosys-slang the SVA files
    are part of the Yosys copy too (bound checkers keep their helper logic)
    and monitors may read signals anywhere below the checked module.
    """
    reader = reader or preferred_reader()
    hierarchical = reader == SLANG
    design = elaborate({**dut_files, **sva_files}, top=dut_top, hierarchical=hierarchical,
                       auto_checks=auto_checks)
    root = design.compilation.getRoot()
    sm = design.compilation.sourceManager

    instances: dict[str, Any] = {}

    def collect(obj):
        if isinstance(obj, ast.InstanceSymbol):
            instances[obj.hierarchicalPath] = obj
        return True
    root.visit(collect)

    design_files = dut_files if dut_files else sva_files
    top = dut_top or _pick_top(root, sm, design_files)
    yosys_files = {**dut_files, **sva_files} if hierarchical else dict(design_files)
    top_inst = instances.get(top)
    if top_inst is None:
        raise FrontendError(f"Top module '{top}' was not found in the design.")

    records = _retarget_unbound_checkers(design.records, top, top_inst, instances)
    reset, reset_source = _choose_reset(top_inst, top, records, reset_signal, reset_polarity)
    if reset is not None:
        # Branch checks are made after the reset sequence: reset branches
        # (if (!rst_n) ... / its else) are reset logic, not dead code.
        records = [r for r in records if f"{top}.{reset[0]}" not in r.drivers]
    clocks = design_clocks(instances, top, records, reset[0] if reset else "")
    if clock_signal:
        inputs = [m.name for m in top_inst.body
                  if m.kind == ast.SymbolKind.Port and m.direction == ast.ArgumentDirection.In]
        if clock_signal not in inputs:
            raise FrontendError(f"Clock signal '{clock_signal}' is not an input of top module '{top}' "
                                f"(inputs: {', '.join(inputs) or 'none'}).")

    # Group by the module definition each assertion checks; a bind into a
    # module type elaborates once per instance, so keep the first instance.
    by_definition: dict[str, tuple[str, list[AssertionRecord]]] = {}
    unplaced: list[AssertionRecord] = []
    for record in records:
        inst = instances.get(record.target)
        if inst is None:
            unplaced.append(record)
            continue
        definition = inst.definition.name
        path, group = by_definition.setdefault(definition, (record.target, []))
        if record.target == path:
            group.append(record)
    checkers = {} if hierarchical else _place_checkers(by_definition, instances, sm, sva_files)
    yosys_files.update({c.file: sva_files[c.file] for c in checkers.values()})

    monitors, properties, marker_lines, script = [], [], [], []
    seen_labels: set[str] = set()
    for definition, (path, group) in by_definition.items():
        for record in group:
            # the same checker bound into several modules repeats its labels
            label, n = record.label, 2
            if label in seen_labels:
                label = f"{record.label}__{definition}"
            while label in seen_labels:
                label = f"{record.label}__{definition}_{n}"
                n += 1
            record.label = label
            seen_labels.add(label)
        # Paths from the checked module to top-level signals: direct in the
        # top, an upward reference (module name) with yosys-slang
        def from_target(name: str) -> str:
            if path == top:
                return name
            return f"{top}.{name}" if hierarchical else ""
        default_clock = ("posedge", from_target(clock_signal)) if clock_signal and from_target(clock_signal) else None
        monitor = compile_monitor(f"__va_mon_{definition}", path, group, default_clock=default_clock,
                                  reset_cycles=RESET_CYCLES if reset is not None else 0,
                                  in_reset_path=from_target(IN_RESET_NET), witness_covers=witness_covers)
        monitors.append(monitor)
        properties.extend(monitor.properties)
        if not hierarchical:
            # read -sv has no hierarchical references: signals below the
            # checked module (sub-instances, bound checkers) are connected
            # once the design is flattened, in every instance of the module
            below = [(MONITOR_INSTANCE, port, conn) for port, conn in monitor.connections.items() if "." in conn]
            below += [(c.name, port, conn) for c in checkers.values() if c.target == definition
                      for port, conn in c.late.items()]
            for inst_path, inst in instances.items() if below else ():
                if inst.definition.name == definition:
                    prefix = "" if inst_path == top else inst_path[len(top) + 1:] + "."
                    script += [f"connect -nounset -set {prefix}{owner}.{port} {prefix}{conn}" for owner, port, conn in below]
    for record in unplaced:
        reason = "; ".join(p.reason for p in record.problems) or "not inside the design"
        properties.append(CompiledProperty(record.label, record.kind, problems=[reason],
                                           location=str(record.location)))
    for prop in properties:
        if not prop.supported:
            reason = " ".join(prop.problems[0].split())
            marker_lines.append(f"// {UNSUPPORTED_MARKER} {prop.label} {prop.kind.value}: {reason}")

    prepared = PreparedDesign(
        top=top,
        monitors=monitors,
        properties=properties,
        monitor_text="\n".join([m.text for m in monitors] + marker_lines) + "\n",
        summary=_summary(top, records, properties, reset, reset_source, reader, clocks),
        reset=reset,
        reset_source=reset_source,
        reader=reader,
        clocks=clocks,
        # before prep, whose opt_clean would remove what nothing reads yet
        script=[f"hierarchy -top {top}", "proc", "flatten", *script] if script else [],
        _files=yosys_files,
    )
    immediate, placed = _plan_edits(prepared, yosys_files, {m.module_name: m for m in monitors},
                                    keep_binds=hierarchical, checkers=list(checkers.values()))
    for monitor in monitors:
        if monitor.module_name not in placed:
            # The checked module is not part of what Yosys reads: never
            # report its properties as passing.
            definition = monitor.module_name[len("__va_mon_"):]
            prepared.monitor_text = prepared.monitor_text.replace(monitor.text, "")
            for prop in monitor.properties:
                if prop.supported:
                    prop.problems = [f"the checked module '{definition}' is not part of the design "
                                     f"read for formal checking (only the design files are)"]
                    prepared.monitor_text += (f"// {UNSUPPORTED_MARKER} {prop.label} {prop.kind.value}: "
                                              f"{prop.problems[0]}\n")
            prepared.summary = _summary(top, records, properties, reset, reset_source, reader, clocks)
    # Immediate assertions in procedures became monitor properties (frontend);
    # the rest (tasks, functions, modules outside the design) are reported.
    converted = {str(r.location) for r in records}
    for label, kind, where in immediate:
        if where in converted:
            continue
        reason = (f"immediate {kind} at {where} is never executed: it is in a task or function that is "
                  f"never called from an always/initial block of the design")
        prop = CompiledProperty(label, _KIND_BY_NAME[kind], problems=[reason], location=where)
        prepared.properties.append(prop)
        prepared.monitor_text += f"// {UNSUPPORTED_MARKER} {label} {kind}: {reason}\n"
    return prepared


READERS = {SLANG: "yosys-slang (hierarchical references supported)",
           VERILOG: "Yosys read -sv (signals below the checked module connected after flattening)"}


def prepare_checked(dut_files: dict[str, str], sva_files: dict[str, str], dut_top: str = "",
                    reset_signal: str = "", reset_polarity: str = "auto",
                    clock_signal: str = "", auto_checks: bool = False,
                    witness_covers: bool = False) -> PreparedDesign:
    """prepare() + check_readable() with the best reader; if yosys-slang
    cannot read the design, retry with read -sv."""
    args = (dut_files, sva_files, dut_top, reset_signal, reset_polarity)
    prepared = prepare(*args, clock_signal=clock_signal, auto_checks=auto_checks, witness_covers=witness_covers)
    try:
        check_readable(prepared)
        return prepared
    except FrontendError as first:
        if prepared.reader != SLANG:
            raise
        fallback = prepare(*args, reader=VERILOG, clock_signal=clock_signal, auto_checks=auto_checks,
                           witness_covers=witness_covers)
        try:
            check_readable(fallback)
        except FrontendError:
            raise first
        reason = " ".join(str(first).split())
        logger.warning(f"yosys-slang could not read the design, using read -sv: {reason}")
        fallback.summary += f"\nyosys-slang could not read the design ({reason}); read -sv was used."
        return fallback


class DesignReadError(FrontendError):
    """Yosys could not read the prepared design (after slang accepted it)."""

    def __init__(self, message: str, file: str = "", line: int = 0):
        self.message, self.file, self.line = message, file, line
        self.hint = hint_for(message, file)
        self._parts = (message, file, line)
        where = f"{file}:{line}: " if file else ""
        super().__init__(f"The design cannot be read for formal checking: {where}{message}"
                         + (f" {self.hint}" if self.hint else ""))

    def __reduce__(self):
        # rebuilt from its parts when passed back from a compile worker
        return DesignReadError, self._parts


def check_readable(prepared: PreparedDesign, timeout: int = 120) -> None:
    """Fail early, with Yosys's own message, if the design cannot be read
    for formal checking (e.g. testbench code with delays or `forever`)."""
    if shutil.which("yosys") is None:
        return
    files = prepared.sources(0)
    files[MONITOR_FILE] = prepared.monitor_text
    with tempfile.TemporaryDirectory(prefix="va_read_") as tmp:
        for name, text in files.items():
            (Path(tmp) / name).write_text(text)
        script = "; ".join(read_commands(list(files), prepared.top, prepared.reader)
                           + [*prepared.script, f"prep -top {prepared.top}"])
        try:
            result = subprocess.run(["yosys", "-q", "-p", script], cwd=tmp,
                                    capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            raise DesignReadError(f"Yosys timed out after {timeout}s while reading the design.")
    if result.returncode != 0:
        lines = (result.stdout + result.stderr).splitlines()
        error = next((l.strip() for l in lines if "ERROR" in l), lines[-1] if lines else "unknown error")
        # "file.sv:12: ERROR: message" (the position may be file.sv:12.3-12.9)
        located = re.match(r"([^:\s]+):(\d+)[\d.-]*: ERROR: (.*)", error)
        if located:
            raise DesignReadError(located.group(3), located.group(1), int(located.group(2)))
        raise DesignReadError(error)


def syntax_preview(sva_code: str, reason: str) -> dict:
    """Syntax check and assertion list for SVA given without its design."""
    sm = SourceManager()
    tree = syntax.SyntaxTree.fromText(sva_code, sm, "sva.sv")
    errors = []
    engine = DiagnosticEngine(sm)
    for diag in tree.diagnostics:
        if diag.isError():
            client = TextDiagnosticClient()
            engine.addClient(client)
            engine.issue(diag)
            engine.clearClients()
            errors.append(client.getString().strip())
    if errors:
        raise FrontendError("\n".join(errors))

    labels: list[str] = []
    kinds = {syntax.SyntaxKind.AssertPropertyStatement: "assert",
             syntax.SyntaxKind.AssumePropertyStatement: "assume",
             syntax.SyntaxKind.CoverPropertyStatement: "cover",
             syntax.SyntaxKind.CoverSequenceStatement: "cover",
             syntax.SyntaxKind.RestrictPropertyStatement: "restrict"}

    def visit(node):
        kind = getattr(node, "kind", None)
        if kind in kinds:
            line = sm.getLineNumber(sm.getFullyOriginalLoc(node.sourceRange.start))
            name = node.label.name.valueText if node.label is not None else f"(line {line})"
            labels.append(f"  - {kinds[kind]} {name}")
        return True
    tree.root.visit(visit)

    first = reason.strip().splitlines()[0] if reason.strip() else ""
    summary = "\n".join([
        "Syntax OK. Full compilation needs the design files (upload them to see the monitors).",
        f"Elaboration without the design: {first}",
        f"Concurrent assertions found: {len(labels)}",
        *labels,
    ])
    return {"parsed_summary": summary, "lowered_rtl": "", "properties": 0, "assertions": len(labels)}


def _pick_top(root, sm, design_files: dict[str, str]) -> str:
    """The single top-level module defined in the design files."""
    tops = []
    for inst in root.topInstances:
        loc = inst.definition.location
        if sm.getFileName(sm.getFullyOriginalLoc(loc)) in design_files:
            tops.append(inst.name)
    if len(tops) == 1:
        return tops[0]
    if not tops:
        raise FrontendError("No top-level module found in the design files.")
    raise FrontendError(
        f"The design has several top-level modules ({', '.join(tops)}); "
        f"choose one with the Top Module setting.")


def _retarget_unbound_checkers(records, top: str, top_inst, instances) -> list[AssertionRecord]:
    """A checker module given as a separate top (not bound) is connected to
    the DUT top by signal name, as the previous flow did."""
    top_signals = {m.name for m in top_inst.body
                   if m.kind in (ast.SymbolKind.Net, ast.SymbolKind.Variable, ast.SymbolKind.Port)}
    out = []
    for record in records:
        if record.target and record.target != top and "." not in record.target \
                and record.target in instances and record.target != top:
            missing = [p for p in record.signals if p not in top_signals]
            if missing:
                record.problems.append(Unsupported(
                    f"checker '{record.target}' is not bound to '{top}' and its signals "
                    f"{', '.join(missing)} are not in '{top}'; add `bind {top} {record.target} ...`",
                    record.location))
            else:
                record.target = top
        out.append(record)
    return out


# A reset-like name: rst / reset / clr / clear (optionally a/s-prefixed),
# as a whole word between underscores: rst_n, i_rst, areset_n, sys_reset, clrn;
# or an AMBA bus reset: presetn (APB), hresetn (AHB), aresetn (AXI).
_RESET_NAME = re.compile(r'(^|_)(n_?|[as])?(rst|reset|clr|clear)(n|_|$)|^[ahp]reset_?n$', re.IGNORECASE)


def _active_low(name: str) -> bool:
    """rst_n, rstn, reset_ni, rst_b, rst_l, nrst... are active low."""
    return bool(re.search(r'(_n|_ni|_b|_l|_bar)$|(rst|reset|clr|clear)n$|^n_?(rst|reset)', name, re.IGNORECASE))


RESET_SOURCES = {
    "user": "set in the settings",
    "sva": "from the SVA's disable iff",
    "name": "guessed from the port name",
    "none": "no reset",
}


def _choose_reset(top_inst, top: str, records: list[AssertionRecord],
                  reset_signal: str, polarity: str) -> tuple[Optional[tuple[str, bool]], str]:
    """The reset the harness asserts for two cycles, then holds inactive.

    Order: the user's setting; the reset the SVA declares with
    `disable iff (!x)` on a top-level input; a reset-like port name; none.
    """
    polarity = (polarity or "auto").lower()
    inputs = [m.name for m in top_inst.body
              if m.kind == ast.SymbolKind.Port and m.direction == ast.ArgumentDirection.In]
    if polarity == "none":
        return None, "none"
    if reset_signal:
        if reset_signal not in inputs:
            raise FrontendError(
                f"Reset signal '{reset_signal}' is not an input of top module '{top}' "
                f"(inputs: {', '.join(inputs) or 'none'}).")
        low = polarity == "low" if polarity in ("low", "high") else _active_low(reset_signal)
        return (reset_signal, low), "user"

    votes: dict[tuple[str, bool], int] = {}
    for record in records:
        found = _disable_port(record.disable, top)
        if found is not None and found[0] in inputs:
            votes[found] = votes.get(found, 0) + 1
    if votes:
        port, low = max(votes, key=lambda k: votes[k])
        if polarity in ("low", "high"):
            low = polarity == "low"
        return (port, low), "sva"

    for name in inputs:
        if _RESET_NAME.search(name):
            low = polarity == "low" if polarity in ("low", "high") else _active_low(name)
            return (name, low), "name"
    return None, "none"


def _disable_port(expr, top: str) -> Optional[tuple[str, bool]]:
    """(port, active_low) for `disable iff (x)` / `(!x)` / `(~x)` on a port of top."""
    if expr is None:
        return None
    low = False
    e = expr
    # default disable iff is bound as |(E): unwrap the reduction
    while isinstance(e, ast.UnaryExpression) and e.op in (
            ast.UnaryOperator.BitwiseOr, ast.UnaryOperator.LogicalNot, ast.UnaryOperator.BitwiseNot):
        if e.op != ast.UnaryOperator.BitwiseOr:
            low = not low
        e = e.operand
    while isinstance(e, ast.ConversionExpression):
        e = e.operand
    # x == 0 / x != 1 (active low), x == 1 / x != 0 (active high)
    if isinstance(e, ast.BinaryExpression) and e.op in (
            ast.BinaryOperator.Equality, ast.BinaryOperator.Inequality,
            ast.BinaryOperator.CaseEquality, ast.BinaryOperator.CaseInequality):
        sides = [(e.left, e.right), (e.right, e.left)]
        for value, const in sides:
            cv = const.constant
            if cv is not None and cv.value is not None:
                try:
                    one = int(cv.value) != 0  # type: ignore[arg-type]  # SVInt supports int()
                except (TypeError, ValueError):
                    return None
                equal = e.op in (ast.BinaryOperator.Equality, ast.BinaryOperator.CaseEquality)
                low = low ^ (equal != one)      # (x == 0) or (x != 1) -> active low
                e = value
                while isinstance(e, ast.ConversionExpression):
                    e = e.operand
                break
        else:
            return None
    if isinstance(e, (ast.NamedValueExpression, ast.HierarchicalValueExpression)):
        # a port of a bound checker stands for the bound module's signal
        sym = through_bind(e.symbol)
        scope = sym.parentScope
        body = scope.containingInstance if scope is not None else None
        inst = body.parentInstance if body is not None else None
        if inst is not None and inst.hierarchicalPath == top:
            return sym.name, low
    return None


def _plan_edits(prepared: PreparedDesign, files: dict[str, str],
                monitors: dict[str, Monitor], keep_binds: bool = False, checkers: Optional[list[_Checker]] = None,
                ) -> tuple[list[tuple[str, str, str]], set[str]]:
    """Strip SVA constructs; instantiate monitors and the harness.
    keep_binds: leave `bind` directives (yosys-slang instantiates bound
    checkers, keeping their helper logic).  checkers: bound checkers to
    instantiate by hand instead (read -sv).  Returns the immediate
    assertions removed, (label, kind, file:line), and the monitors
    instantiated."""
    checkers = checkers or []
    immediate: list[tuple[str, str, str]] = []
    placed: set[str] = set()
    strip = _STRIP_MEMBERS - {syntax.SyntaxKind.BindDirective} if keep_binds else _STRIP_MEMBERS
    for name, text in files.items():
        sm = SourceManager()
        tree = syntax.SyntaxTree.fromText(text, sm, name)
        data = text.encode()
        edits: list[tuple[int, int, str]] = []
        rewrites: list[tuple[int, int, dict[str, str]]] = []   # checker module span, its references -> ports
        done: list[tuple[int, int]] = []        # spans already edited (the visit still enters them)

        def span(node) -> tuple[int, int]:
            rng = sm.getFullyOriginalRange(node.sourceRange)
            return rng.start.offset, rng.end.offset

        def blank(node, replacement: str = "") -> None:
            rng = sm.getFullyOriginalRange(node.sourceRange)
            start, end = rng.start.offset, rng.end.offset
            if sm.getFileName(rng.start) != name or end <= start:
                return
            original = data[start:end]                  # offsets count bytes (see sources())
            filler = replacement + "".join("\n" if b == 0x0A else " " for b in original[len(replacement.encode()):])
            edits.append((start, end, filler))
            done.append((start, end))

        def visit(node):
            kind = getattr(node, "kind", None)
            if kind in strip:
                blank(node)
                return False
            if kind in _STRIP_STATEMENTS:
                parent = node.parent
                if parent is not None and parent.kind == syntax.SyntaxKind.ConcurrentAssertionMember:
                    return True     # removed with its member
                blank(node, ";")
                return False
            if kind in _IMMEDIATE:
                line = sm.getLineNumber(sm.getFullyOriginalLoc(node.sourceRange.start))
                label = node.label.name.valueText if node.label is not None else \
                    f"_auto_immediate_{_IMMEDIATE[kind]}_line{line}"
                immediate.append((label, _IMMEDIATE[kind], f"{name}:{line}"))
                parent = node.parent
                if parent is not None and parent.kind == syntax.SyntaxKind.ImmediateAssertionMember:
                    blank(parent)
                else:
                    blank(node, ";")
                return False
            if kind == syntax.SyntaxKind.ScopedName and rewrites:
                start, end = span(node)
                refs = next((r for a, b, r in rewrites if a <= start and end <= b), {})
                port = refs.get("".join(str(node).split()))
                if port and not any(a <= start and end <= b for a, b in done):
                    edits.append((start, end, port))
                    done.append((start, end))
                    return False
            if kind == syntax.SyntaxKind.ModuleDeclaration:
                module = node.header.name.valueText
                end_offset = node.endmodule.location.offset
                inserts = [c.instantiation for c in checkers if c.target == module]
                for c in checkers:
                    if c.module == module:
                        edits.append(_add_ports(node.header, c.ports, sm))
                        rewrites.append((*span(node), c.refs))
                monitor = monitors.get(f"__va_mon_{module}")
                if monitor is not None:
                    # (signals of sub-instances: connected by prepared.script with read -sv)
                    conns = ", ".join(f".{port}({path})" for port, path in monitor.connections.items()
                                      if keep_binds or "." not in path)
                    inserts.append(f"\n    {monitor.module_name} {MONITOR_INSTANCE} ({conns});\n")
                    placed.add(monitor.module_name)
                if inserts:
                    edits.append((end_offset, end_offset, "".join(inserts)))
                if module == prepared.top:
                    prepared._harness_at = (name, end_offset)
            return True
        tree.root.visit(visit)
        prepared._edits[name] = edits

    if prepared._harness_at is None:
        raise FrontendError(f"Could not locate module '{prepared.top}' in the design files.")
    return immediate, placed


@dataclass
class _Checker:
    """A checker module bound into a checked module, instantiated there by
    hand for read -sv (which has neither bind nor hierarchical references):
    its references to the module (`pipe.in`) become input ports."""
    file: str                    # SVA file declaring the checker module
    module: str                  # checker module
    target: str                  # module it is bound into
    name: str                    # instance name (from the bind)
    instantiation: str           # inserted at the end of the target module
    ports: str                   # port declarations added to the checker
    refs: dict[str, str]         # reference as written -> port
    late: dict[str, str]         # port -> signal below the target (connected after flattening)


def _place_checkers(by_definition: dict, instances: dict, sm, sva_files: dict[str, str]) -> dict[str, _Checker]:
    """Bound checkers whose own signals assertions read ({instance name:
    checker}).  Assertions reading one that cannot be placed are reported."""
    placed: dict[str, _Checker | str] = {}
    for definition, (path, group) in by_definition.items():
        for record in group:
            for name in {rel.split(".", 1)[0] for rel in record.signals if "." in rel}:
                inst = instances.get(f"{path}.{name}")
                bind = _bind_of(inst) if inst is not None else None
                if bind is None:
                    continue                          # a sub-instance of the design
                key = f"{definition}.{name}"
                if key not in placed:
                    placed[key] = _checker(inst, bind, definition, path, instances, sm, sva_files)
                if isinstance(placed[key], str):
                    record.problems.append(Unsupported(
                        f"'{name}' is a bound checker whose own signals are read; it cannot be instantiated "
                        f"for read -sv ({placed[key]}), and the yosys-slang plugin (part of the OSS CAD "
                        f"Suite) is not available", record.location))
    return {k: c for k, c in placed.items() if not isinstance(c, str)}


def _bind_of(inst):
    s = inst.syntax
    bind = s.parent.parent if s is not None and s.parent is not None else None
    return bind if bind is not None and bind.kind == syntax.SyntaxKind.BindDirective else None


def _checker(inst, bind, target: str, target_path: str, instances: dict, sm, sva_files) -> _Checker | str:
    """The checker instance `inst`, bound by `bind` into `target_path`, as a
    _Checker, or why it cannot be one."""
    module = inst.definition.name
    if str(bind.target).strip() != target:
        return "it is bound to an instance, not to a module"
    others = [_bind_of(i) for i in instances.values() if i.definition.name == module and i is not inst]
    if any(b is not None and str(b.target).strip() != target for b in others):
        return "it is bound into several modules"
    decl = inst.definition.syntax
    file = sm.getFileName(decl.sourceRange.start)
    ports = decl.header.ports
    if file not in sva_files:
        return "its module is not in the SVA files"
    if ports is not None and ports.kind != syntax.SyntaxKind.AnsiPortList:
        return "its ports are not declared in the module header"
    refs: dict[str, str] = {}
    decls, conns, late = [], [], {}
    problem = []

    def visit(obj):
        if isinstance(obj, ast.HierarchicalValueExpression):
            sym = obj.symbol
            rel = sym.hierarchicalPath[len(target_path) + 1:]
            if not sym.hierarchicalPath.startswith(target_path + ".") or sym.type.isUnpackedArray:
                problem.append(f"it reads '{sym.hierarchicalPath}'")
                return True
            port = "__va_up_" + rel.replace(".", "__")
            if port not in refs.values():
                t = sym.type
                decls.append(f"input wire {'signed ' if t.isSigned else ''}"
                             f"{f'[{t.bitWidth - 1}:0] ' if t.bitWidth > 1 else ''}{port}")
                if "." in rel:
                    late[port] = rel
                else:
                    conns.append(f".{port}({rel})")
            refs["".join(str(obj.syntax).split())] = port
        return True
    inst.body.visit(visit)
    if problem:
        return problem[0]
    hi, s = bind.instantiation, inst.syntax
    text = str(s).strip()
    written = text[text.index("(") + 1:text.rindex(")")].strip()
    params = f" {str(hi.parameters).strip()}" if hi.parameters is not None else ""
    instantiation = f"\n    {module}{params} {inst.name} ({', '.join(([written] if written else []) + conns)});\n"
    return _Checker(file, module, target, inst.name, instantiation, ", ".join(decls), refs, late)


def _add_ports(header, ports: str, sm) -> tuple[int, int, str]:
    """Edit adding port declarations to a module header (ANSI or none)."""
    if not ports:
        at = sm.getFullyOriginalRange(header.sourceRange).end.offset
        return at, at, ""
    if header.ports is None:
        after = header.parameters if header.parameters is not None else None
        at = (sm.getFullyOriginalRange(after.sourceRange).end.offset if after is not None
              else header.name.location.offset + len(header.name.rawText))
        return at, at, f" ({ports})"
    at = header.ports.closeParen.location.offset
    empty = "".join(str(header.ports).split()) == "()"
    return at, at, ports if empty else f", {ports}"


def _clock_text(clocks: Optional[ClockInfo]) -> str:
    if clocks is None or not clocks.nets:
        return "none found (assertions without a clock are checked at every solver step)"
    names = ", ".join(n.split(".", 1)[-1] for n in clocks.nets)
    if clocks.multiclock:
        return f"{names} (several clock nets: checked in multiclock mode, clocks are independent)"
    return f"{names} (single clock)"


def _summary(top: str, records: list[AssertionRecord], properties: list[CompiledProperty],
             reset: Optional[tuple[str, bool]] = None, reset_source: str = "none",
             reader: str = VERILOG, clocks: Optional[ClockInfo] = None) -> str:
    supported = sum(1 for p in properties if p.supported)
    kinds: dict[str, int] = {}
    for r in records:
        kinds[r.kind.value] = kinds.get(r.kind.value, 0) + 1
    parts = ", ".join(f"{n} {k}" for k, n in sorted(kinds.items()))
    reset_text = (f"{reset[0]} (active {'low' if reset[1] else 'high'}, {RESET_SOURCES[reset_source]})"
                  if reset else "none (no reset input found or chosen)")
    lines = [f"Top module: {top}",
             f"Reset: {reset_text}",
             f"Design reader: {READERS[reader]}",
             f"Clocks: {_clock_text(clocks)}",
             f"Concurrent assertions: {len(records)} ({parts})",
             f"Compiled: {supported}; not checkable: {len(properties) - supported}"]
    for p in properties:
        if not p.supported:
            lines.append(f"  - {p.label}: {p.problems[0]}")
    return "\n".join(lines)
