"""
Compile AssertionRecords (ir.py) into a synthesizable monitor module.

For each assertion the monitor contains guard wires (the boolean atoms),
one occupancy register per automaton state, and an immediate statement:

    if (!disable && fail)  <label>: assert(0);     // assert / restrict
    if (!disable)          <label>: assume(!fail); // assume
    if (!disable && pass)  <label>: cover(1);      // cover
    if (!disable && pre)   <label>__pre: cover(1); // antecedent matched (vacuity)
    if (!disable && pass)  <label>__wit: cover(1); // antecedent matched and the consequent held
                                                   // (assertions, on request: witness_covers)

An attempt starts at every clock tick.  Top-level operators whose failures
decompose (implication, and, if/else, nexttime, always, accept/reject_on)
are compiled structurally; anything else goes through a per-attempt
deterministic automaton (automata.PDFA).  Attempts in the same automaton
state are merged, which keeps failure detection exact.

`disable iff` clears all attempt state and suppresses outcomes; sampled-value
registers ($past etc.) keep sampling, as IEEE 1800 requires.

Liveness (s_eventually, strong unbounded sequences, s_until): the safety
part is checked as above; the eventuality becomes an obligation tracked for
one attempt chosen nondeterministically ($anyseq), and

    <label>__live<i>: assert property (s_eventually !pending);  // SBY live mode
    if (age >= `VA_LIVE_WITNESS) <label>__lwit<i>: cover(1);   // waveform of a violation

A liveness violation exists iff some attempt can stay pending forever, and
the solver may pick any attempt, so this is exact.  In an assumption the
eventuality is a fairness constraint over all attempts:

    <label>__fair<i>: assume property (s_eventually !pending);

`s_eventually always p` is violated iff p fails infinitely often after the
attempt starts, which no "pending forever" flag can express.  It is checked
as "there is no infinite run on which p keeps failing", with a fairness
assumption that only this check uses:

    <label>__lfair<i>: assume property (s_eventually p_fails);
    <label>__live<i>:  assert property (s_eventually 1'b0);    // fails iff such a run exists

In an assumption the solver instead picks the tick from which p holds
(a safety assumption from then on, and fairness that the tick comes).
A property that switches clocks (`@(c1) a |-> @(c2) b`, `@(c1) a ##1
@(c2) b |-> c`) runs entirely on the global clock (one tick per solver
step): every clock's tick is an edge seen between two steps, signals are
read through registers holding their previous-step (sampled) value, attempt
state changes only at the ticks of its own clock, and each outcome is gated
by the tick of its clock, so the check runs at every step.  This makes a c2
tick at the same instant as a c1 match visible (|->, ##0), which separate
clock domains cannot do.
"""

from __future__ import annotations

import itertools
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from app.praman.services.sva import automata as A
from app.praman.services.sva.expr import ExprContext, ExprPrinter, ExprUnsupported, port_name
from app.praman.services.sva.ir import (
    AssertionKind, AssertionRecord, Bound, CaseCondition, InitialCycle, NegatedCondition, Prop, PropAbort,
    PropBinary, PropClocked, RangeCondition,
    PropFollowedBy,
    PropIf, PropImplication, PropNot, PropOp, PropSeq, PropTemporal, RepeatKind,
    Seq, SeqBinary, SeqBool, SeqConcat, SeqFirstMatch, SeqMatchItems, SeqOp,
    SeqRepeat, SeqSwitch, SeqThroughout, TemporalOp, Unsupported,
)

PRECONDITION_SUFFIX = "__pre"
# <label>__wit: cover of a non-vacuous pass of an assertion `a |-> b` (the
# antecedent matched and the consequent held): its witness.  `cover (a |-> b)`
# itself would also be hit whenever a is false.
WITNESS_SUFFIX = "__wit"
_FAIRNESS_ONLY = ("in an assumption, eventualities are supported as fairness constraints: "
                  "s_eventually <boolean or sequence>, s_eventually always <boolean> or "
                  "<boolean> s_until <boolean>")
LIVE_INFIX = "__live"           # <label>__live<i>: liveness assertion
LIVE_FAIR_INFIX = "__lfair"     # <label>__lfair<i>: fairness used only by <label>__live<i>
WITNESS_INFIX = "__lwit"        # <label>__lwit<i>: cover drawing a liveness violation
WITNESS_MACRO = "VA_LIVE_WITNESS"

# Local variables: an attempt lasting at most L ticks is checked by L+1
# replicas of the monitor (one per start tick modulo L+1), each with its own
# copy of the variables.  This bounds the replica count.
MAX_LOCAL_VAR_REPLICAS = 32


class CompileError(Exception):
    """A construct of one assertion cannot be compiled (reported per property)."""


@dataclass
class CompiledProperty:
    label: str
    kind: AssertionKind
    has_precondition: bool = False
    has_witness: bool = False
    problems: list[str] = field(default_factory=list)
    # For counterexample explanation: which monitor wires mean what.
    #   scope:      hierarchical path of the checked module (VCD scope)
    #   conditions: [{wire, text, role, signals}] role = antecedent|consequent|condition
    #   match:      wires true when the antecedent matched
    #   fail/pass:  wires true when an attempt failed / succeeded
    #   signals:    {port name: target-relative signal path}
    debug: dict = field(default_factory=dict)
    note: str = ""          # automatic checks: what is checked
    location: str = ""      # "file:line" of the property in the sources

    @property
    def supported(self) -> bool:
        return not self.problems


@dataclass
class Monitor:
    module_name: str
    ports: dict[str, int]                        # port name -> width
    connections: dict[str, str]                  # port name -> target-relative signal path
    text: str
    properties: list[CompiledProperty]


# One tick per solver step (IEEE 1800 global clocking).  A wire with the gclk
# attribute rather than $global_clock: both Yosys readers (read -sv and
# yosys-slang) accept it.
GLOBAL_CLOCK_NET = "__va_gclk"


# Harness reset sequence (pipeline.PreparedDesign.harness): reset is
# asserted for this many cycles from the start.
RESET_CYCLES = 2
IN_RESET_NET = "__va_in_reset"


def compile_monitor(
    module_name: str,
    target: str,
    records: list[AssertionRecord],
    default_clock: Optional[tuple[str, str]] = None,
    reset_cycles: int = 0,
    in_reset_path: str = "",
    witness_covers: bool = False,
) -> Monitor:
    """Compile all assertions checking `target` into one monitor module.

    witness_covers: also emit <label>__wit for assertions with an antecedent.

    default_clock: (edge, signal path) used for assertions without a clock.
    reset_cycles: length of the harness reset sequence; records marked
    after_reset are not checked during it.  in_reset_path: the harness's
    in-reset signal as seen from the target (exact also with several
    clocks); without it the monitor counts solver steps.
    """
    ports: dict[str, int] = {}
    connections: dict[str, str] = {}
    body: list[str] = []
    results: list[CompiledProperty] = []

    def add_port(path: str, width: int) -> str:
        name = port_name(path)
        ports[name] = max(width, ports.get(name, 0))
        connections[name] = path
        return name

    if default_clock is not None:
        add_port(default_clock[1], 1)
    reset_port = bool(in_reset_path and reset_cycles and any(r.after_reset for r in records))
    if reset_port:
        ports[IN_RESET_NET] = 1
        connections[IN_RESET_NET] = in_reset_path

    for index, record in enumerate(records):
        result = CompiledProperty(record.label, record.kind, note=record.note,
                                  location=str(record.location))
        results.append(result)
        if record.problems:
            result.problems = [_describe(p) for p in record.problems]
            continue
        signal_names = {path: add_port(path, sig.width) for path, sig in record.signals.items()}
        try:
            compiler = _PropertyCompiler(index, record, signal_names, target, default_clock,
                                         in_reset=IN_RESET_NET if record.after_reset and reset_cycles else "",
                                         element_port=add_port, witness=witness_covers)
            lines, has_pre = compiler.compile()
        except (CompileError, ExprUnsupported, A.AutomatonTooLarge) as e:
            result.problems = [f"{e} ({record.location})"]
            continue
        result.has_precondition = has_pre
        result.has_witness = compiler.has_witness
        clock_port = compiler.clock.split()[-1] if compiler.clock.startswith(("posedge", "negedge")) else ""
        result.debug = {**compiler.debug, "scope": target, "clock": clock_port,
                        "signals": {port_name(p): p for p in record.signals}}
        body.append(f"    // ---- {record.label} ({record.location}) ----")
        body.extend(lines)
        body.append("")

    port_lines = [f"    input wire {f'[{w - 1}:0] ' if w > 1 else ''}{name}" for name, w in ports.items()]
    text = "\n".join([
        "`ifdef FORMAL",
        f"`ifndef {WITNESS_MACRO}",
        f"`define {WITNESS_MACRO} 16",
        "`endif",
        f"module {module_name} (",
        ",\n".join(port_lines),
        ");",
        "",
        *([f"    (* gclk *) wire {GLOBAL_CLOCK_NET};", ""]
          if any(GLOBAL_CLOCK_NET in line or IN_RESET_NET in line for line in body) else []),
        *(["    reg [1:0] __va_cycle = 0;",
           f"    always @(posedge {GLOBAL_CLOCK_NET}) if (__va_cycle != 2'd{reset_cycles}) __va_cycle <= __va_cycle + 2'd1;",
           f"    wire {IN_RESET_NET} = __va_cycle != 2'd{reset_cycles};", ""]
          if not reset_port and any(IN_RESET_NET in line for line in body) else []),
        *body,
        "endmodule",
        "`endif",
        "",
    ])
    return Monitor(module_name, ports, connections, text, results)


def _describe(problem: Unsupported) -> str:
    return f"{problem.reason} ({problem.location})" if problem.location else problem.reason


@dataclass
class _Signals:
    fail: str = "1'b0"
    pass_: str = "1'b0"      # non-vacuous success of an attempt
    pre: str = ""            # antecedent matched (top-level implication only)


class _PropertyCompiler:
    def __init__(self, index: int, record: AssertionRecord, signal_names: dict[str, str],
                 target: str, default_clock: Optional[tuple[str, str]], in_reset: str = "",
                 element_port: Optional[Callable[[str, int], str]] = None, witness: bool = False):
        self.record = record
        self.witness = witness
        self.has_witness = False
        self.prefix = f"_va{index}_"
        self.counter = itertools.count()
        self.ctx = ExprContext(signal_names, target_prefix=target, fresh=self.fresh, wire=self.wire,
                               element=element_port)
        self.printer = ExprPrinter(self.ctx)
        self.atoms: dict[str, int] = {}
        self.atom_names: list[str] = []
        self.decls: list[str] = []
        self.comb: list[str] = []
        self.regs: list[tuple[str, int, str, str, str]] = []  # (name, width, next value, extra clear, clock)
        self.clear: list[str] = []                       # active abort conditions
        self.allow_match_items = False                   # set while compiling replicas
        self.role = "condition"                          # antecedent | consequent | condition
        self.replica: Optional[int] = None               # local-variable replica being compiled
        self.debug: dict = {"conditions": [], "match": [], "fail": "", "pass": "",
                            "antecedents": [], "replica_fail": [], "locals": [], "live": []}
        self.live: list[dict] = []                       # liveness obligations
        self.target = target
        # Global mode (a clock switch, see the module docstring)
        self.global_mode = bool(record.clocks)
        self.samples: dict[str, tuple[str, int]] = {}    # source -> (previous-step register, width)
        self.sample_ports: dict[str, str] = {}           # previous-step register -> port
        self.ticks: dict[str, str] = {}                  # clock -> wire, 1 at the steps it ticks
        self.port_printer = ExprPrinter(ExprContext(signal_names, target_prefix=target))
        if self.global_mode:
            if record.local_vars:
                raise CompileError("local variables across a clock switch are not supported yet")
            if record.kind == AssertionKind.COVER:
                raise CompileError("clock switches in cover properties are not supported yet")
            self.ctx.signal_names = {path: self.sample(port, record.signals[path].width)
                                     for path, port in signal_names.items()}
            if element_port is not None:
                port = element_port
                self.ctx.element = lambda text, width: self.sample(port(text, width), width)

        if record.clock is not None:
            self.clock = self.clock_text(record.clock)
        elif default_clock is not None:
            self.clock = f"{default_clock[0]} {port_name(default_clock[1])}"
        else:
            # No clock written or inferable (e.g. combinational designs):
            # IEEE 1800 global clocking, one tick per solver step.
            self.clock = f"posedge {GLOBAL_CLOCK_NET}"
        self.ctx.clock = self.clock
        self.root_trigger = ""           # trigger of the whole property (set by compile)
        self.disable = self.printer.boolean(record.disable) if record.disable is not None else "1'b0"
        if in_reset:
            if self.global_mode:
                in_reset = self.sample(in_reset, 1)
            self.disable = in_reset if record.disable is None else f"({self.disable}) || {in_reset}"

    def clock_text(self, clock) -> str:
        if clock.edge not in ("posedge", "negedge"):
            raise CompileError(f"'{clock.edge}' clocking is not supported")
        return f"{clock.edge} {self.port_printer.print(clock.expr)}"

    # Global mode

    def sample(self, source: str, width: int) -> str:
        """Register holding `source` as it was one solver step earlier: the
        sampled value at a clock tick seen in this step."""
        if source not in self.samples:
            name = self.fresh("s")
            self.samples[source] = (name, width)
            self.sample_ports[name] = source
        return self.samples[source][0]

    def tick(self, clock: str) -> str:
        """Wire that is 1 at the steps where `clock` ticks ("" for the global
        clock).  No tick at step 0, which has no previous step to sample."""
        edge, signal = clock.split(maxsplit=1)
        if signal == GLOBAL_CLOCK_NET:
            return ""
        if clock not in self.ticks:
            prev, started = self.sample(signal, 1), self.sample("1'b1", 1)
            rise = f"!{prev} && {signal}" if edge == "posedge" else f"{prev} && !{signal}"
            self.ticks[clock] = self.wire("tick", f"{started} && {rise}")
        return self.ticks[clock]

    def at(self, clock: str) -> tuple[str, str]:
        """(event, condition) of the code that runs at the ticks of `clock`."""
        if not self.global_mode:
            return clock, ""
        return f"posedge {GLOBAL_CLOCK_NET}", self.tick(clock)

    def ticked(self, signal: str) -> str:
        """An outcome of the current clock as a signal true only at its ticks."""
        tick = self.tick(self.clock) if self.global_mode else ""
        return f"{tick} && ({signal})" if tick else signal

    def switch(self, match: str, clock, overlapped: bool) -> str:
        """Continue on `clock` after `match` (an outcome of the current clock):
        the trigger at the first tick of `clock` at or after (overlapped) or
        strictly after each match.  A pending flag carries a match to that
        tick; matches before the same tick start the same attempt."""
        self.clock = self.ctx.clock = self.clock_text(clock)
        tick = self.tick(self.clock)
        pending = self.fresh("pending")
        now = f"{match} && !{tick}" if overlapped else match
        self.regs.append((pending, 1, f"({pending} && !{tick}) || ({now})", " || ".join(self.clear),
                          f"posedge {GLOBAL_CLOCK_NET}"))
        return self.wire("due", f"{tick} && ({pending}{f' || {match}' if overlapped else ''})")

    # Naming and atoms

    def fresh(self, kind: str) -> str:
        return f"{self.prefix}{kind}{next(self.counter)}"

    def atom(self, expr) -> int:
        if isinstance(expr, NegatedCondition):
            inner = self.atom_names[self.atom(expr.cond)]
            text = f"!{inner}"
        elif isinstance(expr, InitialCycle):
            text = f"!{self.reg('started', '1')}"
        else:
            text = self.printer.condition(expr)
        if text not in self.atoms:
            self.atoms[text] = len(self.atom_names)
            name = self.fresh("g")
            self.atom_names.append(name)
            self.decls.append(f"    wire {name} = {text};")
            names = set(self.ctx.signal_names.values())
            self.debug["conditions"].append({
                "wire": name,
                "text": self.source_text(expr),
                "role": self.role,
                "replica": self.replica,
                "signals": sorted(self.sample_ports.get(p, p) for p in names
                                  if re.search(rf'\b{re.escape(p)}\b', text)),
            })
        else:
            cond = self.debug["conditions"][self.atoms[text]]
            if cond["role"] != self.role:
                cond["role"] = "condition"
        return self.atoms[text]

    def source_text(self, expr) -> str:
        """The condition as written in the SVA (target prefix removed)."""
        if isinstance(expr, Bound):
            return self.source_text(expr.expr)
        if isinstance(expr, InitialCycle):
            return "first cycle"
        if isinstance(expr, NegatedCondition):
            return f"!({self.source_text(expr.cond)})"
        if isinstance(expr, RangeCondition):
            return f"{self.source_text(expr.expr)} in [{expr.lo}:{expr.hi}]"
        if isinstance(expr, CaseCondition):
            subject = self.source_text(expr.subject)
            op = "inside" if expr.match == "inside" else "matches" if expr.match else "=="
            return " || ".join(f"{subject} {op} {self.source_text(i)}" for i in expr.items)
        syn = getattr(expr, "syntax", None)
        text = " ".join(str(syn).split()) if syn is not None else self.printer.print(expr)
        return _readable(text, self.target)

    def guard(self, g: A.Conj) -> str:
        if not g:
            return "1'b1"
        return " && ".join(self.atom_names[a] if pol else f"!{self.atom_names[a]}" for a, pol in sorted(g))

    def wire(self, kind: str, value: str, width: int = 1) -> str:
        name = self.fresh(kind)
        self.decls.append(f"    wire {f'[{width - 1}:0] ' if width > 1 else ''}{name};")
        self.comb.append(f"    assign {name} = {value};")
        return name

    def reg(self, kind: str, next_value: str, width: int = 1, name: str = "") -> str:
        """Attempt-state register; cleared by disable iff and by any enclosing
        accept_on/reject_on condition active where it is created."""
        name = name or self.fresh(kind)
        self.regs.append((name, width, next_value, " || ".join(self.clear), self.clock))
        return name

    # Top level

    def compile(self) -> tuple[list[str], bool]:
        record = self.record
        trigger = self.root_trigger = f"!({self.disable})"
        kind = record.kind
        compile_one = self.cover if kind == AssertionKind.COVER else self.top
        if record.local_vars:
            sig = self.replicated(record.prop, trigger, compile_one)
        else:
            sig = compile_one(record.prop, trigger)
        if kind == AssertionKind.COVER:
            sig.pass_ = self.debug["pass"] = self.wire("pass", sig.pass_)
        else:
            sig.fail = self.debug["fail"] = self.wire("fail", sig.fail)
        witness = ""
        if self.witness and kind == AssertionKind.ASSERT and sig.pre and sig.pass_ != "1'b0":
            witness = self.wire("wit", sig.pass_)
            self.has_witness = True

        if self.global_mode and self.live:
            raise CompileError("liveness in a property that switches clocks is not supported yet")

        # Register updates by event (made before the declarations: in global
        # mode they create the tick wires)
        updates: dict[str, list[str]] = {}

        def update(clock: str, statement: str, enable: str = "") -> None:
            event, tick = self.at(clock)
            cond = " && ".join(c for c in (tick, enable) if c)
            updates.setdefault(event, []).append(f"{f'if ({cond}) ' if cond else ''}{statement}")

        # Sampled values keep sampling during disable (IEEE 1800 16.9.3)
        for reg in self.ctx.registers:
            update(reg.clock or self.clock, f"{reg.name} <= {reg.source};", reg.enable)
        for name, _, nxt, extra, reg_clock in self.regs:
            clear = self.disable + (f" || {extra}" if extra else "")
            update(reg_clock, f"{name} <= ({clear}) ? 0 : ({nxt});")
        check_event = self.at(self.clock)[0]     # outcomes are gated by their ticks
        for source, (name, _) in self.samples.items():
            update(f"posedge {GLOBAL_CLOCK_NET}", f"{name} <= {source};")

        lines = []
        declared = [(r.name, r.width) for r in self.ctx.registers] + [(r[0], r[1]) for r in self.regs] \
            + list(self.samples.values())
        for name, width in declared:
            w = f"[{width - 1}:0] " if width > 1 else ""
            lines.append(f"    reg {w}{name} = 0;")
        lines.extend(self.decls)
        lines.extend(self.comb)
        for event, statements in updates.items():
            lines.append(f"    always @({event}) begin")
            lines.extend(f"        {statement}" for statement in statements)
            lines.append("    end")

        label = record.label
        active = f"!({self.disable})"
        lines.append(f"    always @({check_event}) begin")
        if kind in (AssertionKind.ASSERT, AssertionKind.RESTRICT):
            lines.append(f"        if ({active} && ({sig.fail}))")
            lines.append(f"            {label}: assert(0);")
        elif kind == AssertionKind.ASSUME:
            lines.append(f"        if ({active})")
            lines.append(f"            {label}: assume(!({sig.fail}));")
        else:
            lines.append(f"        if ({active} && ({sig.pass_}))")
            lines.append(f"            {label}: cover(1);")
        if sig.pre:
            lines.append(f"        if ({active} && ({sig.pre}))")
            lines.append(f"            {label}{PRECONDITION_SUFFIX}: cover(1);")
        if witness:
            lines.append(f"        if ({active} && ({witness}))")
            lines.append(f"            {label}{WITNESS_SUFFIX}: cover(1);")
        lines.append("    end")
        if self.live:
            lines.append(f"    always @({self.clock}) begin")
            for i, ob in enumerate(self.live):
                if kind == AssertionKind.ASSUME:
                    lines.append(f"        {label}__fair{i}: assume property (s_eventually !({ob['pending']}));")
                else:
                    if "fair" in ob:
                        lines.append(f"        {label}{LIVE_FAIR_INFIX}{i}: assume property (s_eventually ({ob['fair']}));")
                    lines.append(f"        {label}{LIVE_INFIX}{i}: assert property (s_eventually !({ob['pending']}));")
                    lines.append(f"        if ({ob['witness']})")
                    lines.append(f"            {label}{WITNESS_INFIX}{i}: cover(1);")
            lines.append("    end")
        return lines, bool(sig.pre)

    def top(self, prop: Prop, trigger: str) -> _Signals:
        """Failure-oriented structural compilation (assert / assume)."""
        if isinstance(prop, PropClocked):
            raise CompileError("a clock switch is supported only right after |-> or |=>")
        if isinstance(prop, PropImplication):
            outer = self.clock
            try:
                match = self.antecedent(prop.ante, trigger, prop.ante_text)   # may end on another clock
                cons = prop.cons
                if isinstance(cons, PropClocked):
                    start = self.switch(match, cons.clock, prop.overlapped)
                    cons = cons.prop
                else:
                    start = match if prop.overlapped else self.delayed(match, 1)
                sub = self.consequent(lambda: self.top(cons, start))
            finally:
                self.clock = self.ctx.clock = outer
            return _Signals(sub.fail, sub.pass_, pre=match)
        ev = prop.prop if isinstance(prop, PropNot) else None
        if isinstance(ev, PropTemporal) and ev.op in (TemporalOp.EVENTUALLY, TemporalOp.S_EVENTUALLY) \
                and isinstance(ev.prop, PropSeq):
            # not s_eventually[m:n] S: S never matches starting in the window (safety)
            never = ev.prop
            start = self.window(trigger, ev.min or 0, ev.max)
            return _Signals(self.nfa_tracker(self.seq(never.seq), start))
        if isinstance(prop, PropBinary) and prop.op == PropOp.OR and _has_liveness(prop):
            return self.or_liveness(prop, trigger)
        if isinstance(prop, PropBinary) and prop.op == PropOp.AND:
            a, b = self.top(prop.left, trigger), self.top(prop.right, trigger)
            return _Signals(f"({a.fail}) || ({b.fail})")
        if isinstance(prop, PropIf):
            cond = self.atom_names[self.atom(prop.cond)]
            a = self.top(prop.then, f"({trigger}) && {cond}")
            if prop.otherwise is None:
                return _Signals(a.fail)
            b = self.top(prop.otherwise, f"({trigger}) && !{cond}")
            return _Signals(f"({a.fail}) || ({b.fail})")
        if isinstance(prop, PropTemporal) and prop.op in (TemporalOp.NEXTTIME, TemporalOp.S_NEXTTIME):
            return self.top(prop.prop, self.delayed(trigger, prop.min if prop.min is not None else 1))
        if isinstance(prop, PropTemporal) and prop.op in (TemporalOp.ALWAYS, TemporalOp.S_ALWAYS):
            return self.top(prop.prop, self.window(trigger, prop.min, prop.max))
        if isinstance(prop, PropAbort):
            return self.abort(prop, trigger)
        if isinstance(prop, Unsupported):
            raise CompileError(prop.reason)
        live = self.liveness(prop, trigger)
        if live is not None:
            return live
        p = self.pdfa(prop)
        fail, pass_, _ = self.pdfa_tracker(p, trigger)
        return _Signals(fail, pass_)

    # Liveness

    def liveness(self, prop: Prop, trigger: str) -> Optional[_Signals]:
        """Top-level eventualities: s_eventually, strong unbounded sequences,
        s_until / s_until_with.  None if `prop` is not one of them."""
        if isinstance(prop, PropTemporal) and prop.op in (TemporalOp.S_EVENTUALLY, TemporalOp.EVENTUALLY) \
                and prop.max is None:
            inner = prop.prop
            if isinstance(inner, PropTemporal) and inner.op in (TemporalOp.ALWAYS, TemporalOp.S_ALWAYS) \
                    and not inner.min and inner.max is None:
                return self.persistence(inner.prop, self.delayed(trigger, prop.min or 0))
            if not isinstance(inner, PropSeq):
                raise CompileError("s_eventually of a property is supported for s_eventually always p "
                                   "and s_eventually of a sequence")
            if self.record.kind == AssertionKind.ASSUME:
                seq, start = inner.seq, self.delayed(trigger, prop.min or 0)
                if not isinstance(seq, SeqBool):
                    return self.sequence_fairness(seq, start)
                self.obligation(start, done_bool=self.atom_names[self.atom(seq.expr)])
                return _Signals()
            done = self.eventually_nfa(inner.seq, prop.min or 0)
            self.obligation(trigger, done_nfa=done)
            return _Signals()
        if isinstance(prop, PropSeq) and prop.strong:
            nfa = self.seq(prop.seq)
            if A.is_bounded(nfa):
                return None
            if self.record.kind == AssertionKind.ASSUME:
                raise CompileError(_FAIRNESS_ONLY)
            safety = self.top(PropSeq(prop.seq, strong=False), trigger)
            self.obligation(trigger, done_nfa=nfa)
            return safety
        if isinstance(prop, PropBinary) and prop.op in (PropOp.S_UNTIL, PropOp.S_UNTIL_WITH):
            hold, release = self.boolean_operand(prop.left), self.boolean_operand(prop.right)
            with_ = prop.op == PropOp.S_UNTIL_WITH
            p = A.pdfa_until(hold, release, strong=False, with_=with_)
            fail, pass_, _ = self.pdfa_tracker(p, trigger)
            r = self.atom_names[release]
            done = f"{r} && {self.atom_names[hold]}" if with_ else r
            self.obligation(trigger, done_bool=done)
            return _Signals(fail, pass_)
        return None

    def persistence(self, prop: Prop, start: str) -> _Signals:
        """`s_eventually always p` from the ticks where `start` holds: from some
        tick on, p holds (its attempts started at every tick pass)."""
        started = self.fresh("st")
        self.reg("st", f"{started} || ({start})", name=started)
        now = self.wire("stn", f"{started} || ({start})")
        if self.record.kind == AssertionKind.ASSUME:
            if not (isinstance(prop, PropSeq) and isinstance(prop.seq, SeqBool)):
                raise CompileError("in an assumption, s_eventually always is supported for a boolean")
            # the solver picks the tick from which p holds; fairness: it comes
            settled = self.fresh("set")
            pick = self.wire("pk", "$anyseq")
            settled_now = self.wire("setn", f"{settled} || ({now} && {pick})")
            self.reg("set", settled_now, name=settled)
            pending = self.wire("lv", f"{now} && !{settled_now}")
            self.live.append({"pending": pending})
            self.debug["live"].append({"pending": pending, "start": start})
            return _Signals(f"{settled_now} && !{self.atom_names[self.atom(prop.seq.expr)]}")
        live_before = len(self.live)
        fails = self.top(prop, now).fail
        if len(self.live) != live_before:
            raise CompileError("s_eventually always of a property with an eventuality is not supported")
        # waveform: p failing twice after the start
        count = self.fresh("nf")
        self.reg("nf", f"({fails}) && {count} != 2'd2 ? {count} + 2'd1 : {count}", width=2, name=count)
        self.live.append({"pending": "1'b1", "fair": fails, "witness": f"{count} == 2'd2"})
        self.debug["live"].append({"pending": now, "start": start})
        return _Signals()

    def sequence_fairness(self, seq: Seq, start: str) -> _Signals:
        """Assumed `s_eventually S` for the attempts started by `start`: each
        sees a match of S starting at or after it.  If attempts recur forever,
        so must matches; if they stop, a match must start after the last one.
        The solver picks when they stop (no attempt after it: assumed)."""
        nfa = self.seq(seq)
        matched = self.nfa_tracker(nfa, "1'b1")                     # a match ends now
        fresh = self.nfa_tracker(nfa, "1'b1", restart=start)        # ... that started at or after the last attempt
        pending = self.fresh("lp")
        self.reg("lp", f"({pending} || ({start})) && !{fresh}", name=pending)
        pending_now = self.wire("lpn", f"({pending} || ({start})) && !{fresh}")
        pick = self.wire("pk", "$anyseq")
        stopped = self.fresh("stp")
        stopped_now = self.wire("stpn", f"{stopped} || {pick}")
        self.reg("stp", stopped_now, name=stopped)
        waiting = self.wire("lv", f"{stopped_now} ? {pending_now} : !{matched}")
        self.live.append({"pending": waiting})
        self.debug["live"].append({"pending": waiting, "start": start})
        return _Signals(f"{stopped_now} && ({start})")

    def eventually_nfa(self, seq: Seq, lo: int) -> A.NFA:
        """Matches of `seq` starting lo or more ticks after the attempt starts."""
        nfa, _ = self.combine((A.atom_nfa(A.TRUE), False), lo, None, self.seq_parts(seq))
        if nfa is None:
            raise CompileError("s_eventually of a sequence that can only be empty")
        return nfa

    def obligation(self, start: str, done_nfa: Optional[A.NFA] = None, done_bool: str = "",
                   choose: bool = True) -> None:
        """Track an eventuality started by `start`, fulfilled by a match of
        done_nfa (or when done_bool holds).  choose=False: `start` already
        fires for a single attempt."""
        if self.record.kind == AssertionKind.ASSUME:
            # Fairness: every attempt must be fulfilled.  Merging attempts is
            # exact because one event (done_bool) fulfils all of them at once.
            if not done_bool:
                raise CompileError(_FAIRNESS_ONLY)
            pending = self.fresh("lp")
            self.reg("lp", f"({pending} || ({start})) && !({done_bool})", name=pending)
            now = self.wire("lv", f"({pending} || ({start})) && !({done_bool})")
            self.live.append({"pending": now})
            self.debug["live"].append({"pending": now, "start": start})
            return
        tracked = self.chosen_attempt(start) if choose else start
        done = self.nfa_tracker(done_nfa, tracked) if done_nfa is not None else done_bool
        pending = self.fresh("lp")
        self.reg("lp", f"({pending} || {tracked}) && !({done})", name=pending)
        now = self.wire("lv", f"({pending} || {tracked}) && !({done})")
        self.add_obligation(now, tracked)

    def chosen_attempt(self, start: str) -> str:
        """`start` for one attempt, chosen freely by the solver (it looks for
        the attempt that violates the property)."""
        pick = self.wire("pk", "$anyseq")
        picked = self.fresh("pkd")
        tracked = self.wire("ts", f"({start}) && {pick} && !{picked}")
        self.reg("pkd", f"{picked} || {tracked}", name=picked)
        return tracked

    def add_obligation(self, pending: str, start: str) -> None:
        """A liveness check: `pending` must not stay true forever."""
        age = self.fresh("lage")
        self.reg("lage", f"{pending} ? (({age} == 16'hffff) ? {age} : {age} + 16'd1) : 16'd0",
                 width=16, name=age)
        self.live.append({"pending": pending, "witness": f"{age} >= `{WITNESS_MACRO}"})
        self.debug["live"].append({"pending": pending, "start": start})

    def or_liveness(self, prop: PropBinary, trigger: str) -> _Signals:
        """`p or q` where a side is an eventuality: the property is violated
        when both sides are.  For one attempt (chosen by the solver), each
        side gives a signal that settles: a safety side its sticky failure, an
        eventuality its pending flag (true from the start until fulfilled).
        The `or` is violated iff both stay true forever."""
        if self.record.kind == AssertionKind.ASSUME:
            raise CompileError("eventualities under 'or' in an assumption are not supported yet")
        attempt = self.chosen_attempt(trigger)
        violated = []
        for side in (prop.left, prop.right):
            live_before, debug_before = len(self.live), len(self.debug["live"])
            sig = self.top(side, attempt)
            if any("fair" in ob for ob in self.live[live_before:]):
                raise CompileError("s_eventually always under 'or' is not supported yet")
            pendings = [ob["pending"] for ob in self.live[live_before:]]
            del self.live[live_before:], self.debug["live"][debug_before:]
            parts = [f"({p})" for p in pendings]
            if sig.fail not in ("", "1'b0"):
                failed = self.fresh("sf")
                self.reg("sf", f"{failed} || ({sig.fail})", name=failed)
                parts.append(f"({failed} || ({sig.fail}))")
            violated.append(" || ".join(parts) or "1'b0")
        both = self.wire("lv", " && ".join(f"({v})" for v in violated))
        self.add_obligation(both, attempt)
        return _Signals()


    def cover(self, prop: Prop, trigger: str) -> _Signals:
        """Success-oriented compilation (cover): a non-vacuous pass."""
        if isinstance(prop, PropSeq):
            return _Signals(pass_=self.nfa_tracker(self.seq(prop.seq), trigger))
        if isinstance(prop, PropImplication):
            match = self.antecedent(prop.ante, trigger, prop.ante_text)
            start = match if prop.overlapped else self.delayed(match, 1)
            sub = self.consequent(lambda: self.cover(prop.cons, start))
            return _Signals(pass_=sub.pass_, pre=match)
        if isinstance(prop, PropTemporal) and prop.op in (TemporalOp.S_EVENTUALLY, TemporalOp.EVENTUALLY) \
                and prop.max is None and isinstance(prop.prop, PropSeq):
            return _Signals(pass_=self.nfa_tracker(self.eventually_nfa(prop.prop.seq, prop.min or 0), trigger))
        if isinstance(prop, PropBinary) and prop.op in (PropOp.S_UNTIL, PropOp.S_UNTIL_WITH):
            p = A.pdfa_until(self.boolean_operand(prop.left), self.boolean_operand(prop.right),
                             strong=False, with_=prop.op == PropOp.S_UNTIL_WITH)
            _, pass_, _ = self.pdfa_tracker(p, trigger)
            return _Signals(pass_=pass_)
        p = self.pdfa(prop)
        _, pass_, _ = self.pdfa_tracker(p, trigger)
        return _Signals(pass_=pass_)

    def antecedent(self, seq: Seq, trigger: str, text: str = "") -> str:
        """Matches of the antecedent; after a clock switch in it (`a ##1 @(c2)
        b`), the compiler stays on the clock it ends on."""
        outer, self.role = self.role, "antecedent"
        try:
            match = trigger
            while isinstance(seq, SeqSwitch):
                match = self.switch(self.nfa_tracker(self.seq(seq.first), match), seq.clock, seq.overlapped)
                seq = seq.rest
            match = self.nfa_tracker(self.seq(seq), match)
        finally:
            self.role = outer
        self.debug["match"].append(match)
        lo, hi = _seq_length(seq)
        if not any(a["match"] == match for a in self.debug["antecedents"]):
            self.debug["antecedents"].append({
                "text": _readable(text, self.target), "match": match,
                "length": lo if lo == hi else None})
        return match

    def consequent(self, compile_fn):
        outer, self.role = self.role, "consequent"
        try:
            return compile_fn()
        finally:
            self.role = outer

    def abort(self, prop: PropAbort, trigger: str) -> _Signals:
        cond = self.atom_names[self.atom(prop.cond)]
        regs_before = len(self.regs)
        self.clear.append(cond)
        try:
            sub = self.top(prop.prop, trigger)
        finally:
            self.clear.remove(cond)
        own = [r[0] for r in self.regs[regs_before:]]
        if prop.accept:
            # Pending attempts succeed when cond holds; nothing fails that tick.
            return _Signals(f"!{cond} && ({sub.fail})")
        pending = " || ".join(own + [trigger]) if own else trigger
        return _Signals(f"({sub.fail}) || {self.ticked(f'{cond} && ({pending})')}")

    # Local variables

    def replicated(self, prop: Prop, trigger: str, compile_one) -> _Signals:
        """Compile `prop` once per start-tick phase so each replica sees at
        most one live attempt and can keep its local variables in registers."""
        assigns = _assignments(prop)
        length = _attempt_length(prop)
        if length is None:
            raise CompileError("local variables are supported only in properties of bounded length")
        replicas = length + 1
        if replicas > MAX_LOCAL_VAR_REPLICAS:
            raise CompileError(f"property with local variables lasts {length} ticks; "
                               f"the limit is {MAX_LOCAL_VAR_REPLICAS - 1}")
        width = max(1, (replicas - 1).bit_length())
        phase = self.fresh("ph")
        self.reg("ph", f"({phase} == {width}'d{replicas - 1}) ? {width}'d0 : {phase} + {width}'d1",
                 width=width, name=phase)

        fails, passes, pres = [], [], []
        self.allow_match_items = True
        try:
            for r in range(replicas):
                self.replica = r
                start = f"({trigger}) && ({phase} == {width}'d{r})"
                for var, (offset, expr) in assigns.items():
                    capture = self.delayed(start, offset)
                    value = self.printer.print(expr)
                    bits = expr.type.bitWidth
                    store = self.fresh("lv")
                    self.reg("lv", f"{capture} ? ({value}) : {store}", width=bits, name=store)
                    # The value is visible from the assigning tick on (##0 reads see it)
                    self.ctx.local_names[var] = f"({capture} ? ({value}) : {store})"
                    self.debug["locals"].append({"var": var, "replica": r, "wire": store,
                                                 "width": bits})
                sig = compile_one(prop, start)
                outcome = sig.pass_ if compile_one == self.cover else sig.fail
                self.debug["replica_fail"].append(self.wire("rf", outcome))
                fails.append(f"({sig.fail})")
                passes.append(f"({sig.pass_})")
                if sig.pre:
                    pres.append(f"({sig.pre})")
        finally:
            self.allow_match_items = False
            self.replica = None
            self.ctx.local_names.clear()
        return _Signals(" || ".join(fails), " || ".join(passes), " || ".join(pres))

    # Structural helpers

    def delayed(self, signal: str, ticks: int) -> str:
        for _ in range(ticks):
            signal = self.reg("d", signal)
        return signal

    def window(self, trigger: str, lo: Optional[int], hi: Optional[int]) -> str:
        """Start signal for ticks lo..hi after each trigger (None = 0..$)."""
        lo = lo or 0
        if hi is None:
            base = self.delayed(trigger, lo)
            sticky = self.fresh("st")
            self.reg("st", f"{sticky} || ({base})", name=sticky)
            return f"({base}) || {sticky}"
        if hi > A.MAX_UNROLL:
            raise A.AutomatonTooLarge(f"always [{lo}:{hi}] is too long to unroll")
        taps, signal = [], trigger
        for k in range(hi + 1):
            if k >= lo:
                taps.append(signal)
            if k < hi:
                signal = self.reg("d", signal)
        return " || ".join(f"({t})" for t in taps)

    # Automaton trackers

    def nfa_tracker(self, nfa: A.NFA, trigger: str, restart: str = "") -> str:
        """Signal that is true when an attempt's sequence match ends now.
        restart: attempts started before a tick where it holds are dropped."""
        sources = {p for p, _, _ in nfa.trans}
        occ = {s: self.fresh("n") for s in sources}
        active = {}
        for s in sources:
            parts = []
            if s in nfa.init:
                parts.append(f"({trigger})")
            if any(q == s for _, _, q in nfa.trans):
                parts.append(f"{occ[s]} && !({restart})" if restart else occ[s])
            active[s] = self.wire("a", " || ".join(parts) if parts else "1'b0")
        nxt: dict[int, list[str]] = {}
        match: list[str] = []
        for p, g, q in nfa.trans:
            term = f"{active[p]} && {self.guard(g)}"
            if q in nfa.final:
                match.append(f"({term})")
            if q in sources:
                nxt.setdefault(q, []).append(f"({term})")
        for s in sources:
            if any(q == s for _, _, q in nfa.trans):
                self.reg("n", " || ".join(nxt.get(s, ["1'b0"])), name=occ[s])
        return self.wire("m", self.ticked(" || ".join(match)) if match else "1'b0")

    def pdfa_tracker(self, p: A.PDFA, trigger: str) -> tuple[str, str, str]:
        """(fail, non-vacuous pass, any pass) of attempts started by trigger."""
        targets = {o[1] for _, rows in p.table for o in rows.values() if o[0] == A.GO}
        occ = {s: self.fresh("q") for s in targets}
        fail, pass_nv, pass_any = [], [], []
        nxt: dict[int, list[str]] = {}
        for s, (atoms, rows) in enumerate(p.table):
            parts = []
            if s == 0:
                parts.append(f"({trigger})")
            if s in occ:
                parts.append(occ[s])
            if not parts:
                continue
            active = self.wire("a", " || ".join(parts))
            names = [self.atom_names[a] for a in atoms]
            outcomes = {o for o in rows.values()}
            for o in outcomes:
                cond = _decision(names, rows, lambda out, o=o: out == o)
                if cond == "1'b0":
                    continue
                term = f"({active} && {cond})"
                if o[0] == A.GO:
                    nxt.setdefault(o[1], []).append(term)
                elif o[0] == A.FAIL:
                    fail.append(term)
                elif o[0] == A.PASS:
                    pass_nv.append(term)
                    pass_any.append(term)
                else:
                    pass_any.append(term)
        for s, name in occ.items():
            self.reg("q", " || ".join(nxt.get(s, ["1'b0"])), name=name)
        join = lambda xs: self.ticked(" || ".join(xs)) if xs else "1'b0"
        return (self.wire("f", join(fail)), self.wire("p", join(pass_nv)), self.wire("pa", join(pass_any)))

    # IR -> automata

    def seq(self, s: Seq) -> A.NFA:
        nfa, _empty = self.seq_parts(s)
        if nfa is None:
            raise CompileError("sequence can only match the empty sequence")
        return nfa

    def seq_parts(self, s: Seq) -> tuple[Optional[A.NFA], bool]:
        """(automaton for the non-empty matches, can-match-empty)."""
        if isinstance(s, SeqBool):
            return A.atom_nfa(A.lit(self.atom(s.expr))), False
        if isinstance(s, SeqRepeat):
            return self.repeat(s)
        if isinstance(s, SeqConcat):
            return self.concat(s)
        if isinstance(s, SeqSwitch):
            raise CompileError("a clock switch inside a sequence is supported only in an implication's antecedent")
        if isinstance(s, SeqBinary):
            x, ex = self.seq_parts(s.left)
            y, ey = self.seq_parts(s.right)
            if s.op == SeqOp.OR:
                return A.union_all([n for n in (x, y) if n is not None]), ex or ey
            if ex or ey or x is None or y is None:
                raise CompileError(f"'{s.op.value}' of a sequence that can be empty is not supported")
            build = {SeqOp.AND: A.seq_and, SeqOp.INTERSECT: A.intersect, SeqOp.WITHIN: A.within}[s.op]
            return build(x, y), False
        if isinstance(s, SeqThroughout):
            x, ex = self.seq_parts(s.seq)
            if ex or x is None:
                raise CompileError("'throughout' over a sequence that can be empty is not supported")
            return A.throughout(A.lit(self.atom(s.cond)), x), False
        if isinstance(s, SeqFirstMatch):
            x, ex = self.seq_parts(s.seq)
            if ex or x is None:
                return None, True          # the empty match is always first
            return A.first_match(x), False
        if isinstance(s, SeqMatchItems):
            if not self.allow_match_items:
                raise CompileError("local variable assignment in an unsupported position")
            return self.seq_parts(s.seq)
        if isinstance(s, Unsupported):
            raise CompileError(s.reason)
        raise CompileError(f"unknown sequence node {type(s).__name__}")

    def repeat(self, s: SeqRepeat) -> tuple[Optional[A.NFA], bool]:
        lo, hi = s.min, s.max
        if s.kind in (RepeatKind.GOTO, RepeatKind.NONCONSECUTIVE):
            if not isinstance(s.seq, SeqBool):
                raise CompileError("goto/non-consecutive repetition needs a boolean operand")
            b = self.atom(s.seq.expr)
            if s.kind == RepeatKind.GOTO:
                if hi == 0:
                    return None, True
                return A.goto(b, max(lo, 1), hi), lo == 0
            if hi == 0:
                return A.loop(A.atom_nfa(A.lit(b, False))), True
            core = A.nonconsecutive(b, max(lo, 1), hi)
            if lo == 0:
                core = A.union(core, A.loop(A.atom_nfa(A.lit(b, False))))
            return core, lo == 0
        base, empty = self.seq_parts(s.seq)
        if empty or base is None:
            raise CompileError("repetition of a sequence that can be empty is not supported")
        if hi == 0:
            return None, True
        return A.repeat(base, max(lo, 1), hi), lo == 0

    def concat(self, s: SeqConcat) -> tuple[Optional[A.NFA], bool]:
        first_delay, first = s.items[0]
        acc = self.seq_parts(first)
        if (first_delay.min, first_delay.max) != (0, 0):
            # "##d s" as a sequence means "1 ##d s"
            acc = self.combine((A.atom_nfa(A.TRUE), False), first_delay.min, first_delay.max, acc)
        for delay, item in s.items[1:]:
            acc = self.combine(acc, delay.min, delay.max, self.seq_parts(item))
        return acc

    def combine(self, left, lo: int, hi: Optional[int], right) -> tuple[Optional[A.NFA], bool]:
        """left ##[lo:hi] right with the IEEE rules for empty matches:
        (empty ##n s) = ##(n-1) s and (s ##n empty) = s ##(n-1) 1, n >= 1."""
        x, ex = left
        y, ey = right
        if ex and ey:
            raise CompileError("concatenation of two sequences that can both be empty is not supported")
        parts = []
        if x is not None and y is not None:
            parts.append(A.concat_delay(x, lo, hi, y))
        shifted = (max(lo, 1) - 1, None if hi is None else hi - 1)
        if hi is None or hi >= 1:
            a, b = shifted
            if ex and y is not None:
                lead = []
                if a == 0:
                    lead.append(y)
                if b is None or b >= 1:
                    lead.append(A.concat1(A.trues(max(a, 1), b), y))
                parts.extend(lead)
            if ey and x is not None:
                if a == 0:
                    parts.append(x)
                if b is None or b >= 1:
                    parts.append(A.concat1(x, A.trues(max(a, 1), b)))
        return A.union_all(parts), False

    def pdfa(self, prop: Prop) -> A.PDFA:
        if isinstance(prop, PropSeq):
            nfa = self.seq(prop.seq)
            if prop.strong and not A.is_bounded(nfa):
                raise CompileError("strong unbounded sequences need liveness checking, which is not supported")
            return A.pdfa_from_sequence(nfa)
        if isinstance(prop, PropNot):
            return A.pdfa_not(self.pdfa(prop.prop))
        if isinstance(prop, PropBinary):
            if prop.op in (PropOp.UNTIL, PropOp.S_UNTIL, PropOp.UNTIL_WITH, PropOp.S_UNTIL_WITH):
                hold, release = self.boolean_operand(prop.left), self.boolean_operand(prop.right)
                return A.pdfa_until(hold, release,
                                    strong=prop.op in (PropOp.S_UNTIL, PropOp.S_UNTIL_WITH),
                                    with_=prop.op in (PropOp.UNTIL_WITH, PropOp.S_UNTIL_WITH))
            a, b = self.pdfa(prop.left), self.pdfa(prop.right)
            if prop.op == PropOp.AND:
                return A.pdfa_and(a, b)
            if prop.op == PropOp.OR:
                return A.pdfa_or(a, b)
            if prop.op == PropOp.IMPLIES:
                return A.pdfa_or(A.pdfa_not(a), b)
            if prop.op == PropOp.IFF:
                return A.pdfa_and(A.pdfa_or(A.pdfa_not(a), b), A.pdfa_or(A.pdfa_not(b), a))
        if isinstance(prop, PropImplication):
            return A.pdfa_implication(self.seq(prop.ante), self.pdfa(prop.cons), prop.overlapped)
        if isinstance(prop, PropFollowedBy):
            inner = A.pdfa_implication(self.seq(prop.ante), A.pdfa_not(self.pdfa(prop.cons)), prop.overlapped)
            return A.pdfa_not(inner)
        if isinstance(prop, PropTemporal):
            op = prop.op
            if op in (TemporalOp.NEXTTIME, TemporalOp.S_NEXTTIME):
                return A.pdfa_delay(self.pdfa(prop.prop), prop.min if prop.min is not None else 1)
            if prop.max is None:
                raise CompileError(f"unbounded '{op.value}' inside another operator needs liveness "
                                   f"checking, which is not supported")
            every = op in (TemporalOp.ALWAYS, TemporalOp.S_ALWAYS)
            return A.pdfa_window(self.pdfa(prop.prop), prop.min or 0, prop.max, every)
        if isinstance(prop, PropIf):
            otherwise = self.pdfa(prop.otherwise) if prop.otherwise is not None else None
            return A.pdfa_if(self.atom(prop.cond), self.pdfa(prop.then), otherwise)
        if isinstance(prop, PropAbort):
            raise CompileError("accept_on/reject_on inside another operator is not supported yet")
        if isinstance(prop, Unsupported):
            raise CompileError(prop.reason)
        raise CompileError(f"property '{type(prop).__name__}' is not supported")

    def boolean_operand(self, prop: Prop) -> int:
        if isinstance(prop, PropSeq) and isinstance(prop.seq, SeqBool):
            return self.atom(prop.seq.expr)
        raise CompileError("'until' operands must be boolean expressions")


def _readable(text: str, target: str) -> str:
    """Source text without the target's hierarchy prefix or redundant outer
    parentheses: "(fifo.full)" -> "full"."""
    if target:
        text = text.replace(f"{target}.", "")
    text = text.strip()
    while text.startswith("(") and text.endswith(")") and _balanced(text[1:-1]):
        text = text[1:-1].strip()
    return text


def _balanced(text: str) -> bool:
    depth = 0
    for ch in text:
        depth += {"(": 1, ")": -1}.get(ch, 0)
        if depth < 0:
            return False
    return depth == 0


def _decision(names: list[str], rows: dict, pred) -> str:
    """Verilog boolean over `names` true exactly for the valuations whose
    outcome satisfies `pred` (Shannon expansion, constants folded)."""
    def rec(fixed: tuple[bool, ...]) -> str:
        depth = len(fixed)
        if depth == len(names):
            return "1'b1" if pred(rows[fixed]) else "1'b0"
        hi = rec(fixed + (True,))
        lo = rec(fixed + (False,))
        if hi == lo:
            return hi
        n = names[depth]
        if hi == "1'b1" and lo == "1'b0":
            return n
        if hi == "1'b0" and lo == "1'b1":
            return f"!{n}"
        if lo == "1'b0":
            return f"({n} && {hi})"
        if hi == "1'b0":
            return f"(!{n} && {lo})"
        return f"({n} ? {hi} : {lo})"
    return rec(())


# ── Local-variable analysis ─────────────────────────────────

def _has_liveness(prop) -> bool:
    """Does the property contain an eventuality (needs liveness checking)?"""
    if isinstance(prop, PropTemporal):
        if prop.op in (TemporalOp.S_EVENTUALLY, TemporalOp.EVENTUALLY) and prop.max is None:
            return True
        return _has_liveness(prop.prop)
    if isinstance(prop, PropSeq):
        return prop.strong and _seq_length(prop.seq)[1] is None
    if isinstance(prop, PropBinary):
        return prop.op in (PropOp.S_UNTIL, PropOp.S_UNTIL_WITH) \
            or _has_liveness(prop.left) or _has_liveness(prop.right)
    if isinstance(prop, PropImplication):
        return _has_liveness(prop.cons)
    if isinstance(prop, PropIf):
        return _has_liveness(prop.then) or (prop.otherwise is not None and _has_liveness(prop.otherwise))
    if isinstance(prop, (PropNot, PropAbort, PropClocked)):
        return _has_liveness(prop.prop)
    return False


def _seq_length(s: Seq) -> tuple[int, Optional[int]]:
    """(min, max) number of ticks a match spans; max None = unbounded."""
    if isinstance(s, SeqBool):
        return 1, 1
    if isinstance(s, (SeqThroughout, SeqFirstMatch, SeqMatchItems)):
        return _seq_length(s.seq)
    if isinstance(s, SeqRepeat):
        if s.kind != RepeatKind.CONSECUTIVE:
            return max(s.min, 1), None
        lo, hi = _seq_length(s.seq)
        return lo * s.min, (None if hi is None or s.max is None else hi * s.max)
    if isinstance(s, SeqConcat):
        lo = hi = 0
        bounded = True
        for i, (delay, item) in enumerate(s.items):
            ilo, ihi = _seq_length(item)
            if i == 0 and (delay.min, delay.max) == (0, 0):
                lo, hi = ilo, ihi
                continue
            lo += delay.min + ilo - 1 if i else delay.min + ilo
            if hi is None or ihi is None or delay.max is None:
                bounded = False
            else:
                hi += delay.max + ihi - 1 if i else delay.max + ihi
        return lo, (hi if bounded else None)
    if isinstance(s, SeqBinary):
        (alo, ahi), (blo, bhi) = _seq_length(s.left), _seq_length(s.right)
        if s.op == SeqOp.WITHIN:
            return blo, bhi
        if s.op == SeqOp.OR:
            return min(alo, blo), (None if ahi is None or bhi is None else max(ahi, bhi))
        if s.op == SeqOp.INTERSECT:
            return max(alo, blo), (bhi if ahi is None else ahi if bhi is None else min(ahi, bhi))
        return max(alo, blo), (None if ahi is None or bhi is None else max(ahi, bhi))
    return 1, None


def _attempt_length(prop: Prop) -> Optional[int]:
    """Ticks after the start by which an attempt is decided (None = unbounded)."""
    if isinstance(prop, PropSeq):
        hi = _seq_length(prop.seq)[1]
        return None if hi is None else hi - 1
    if isinstance(prop, PropImplication):
        ante = _seq_length(prop.ante)[1]
        cons = _attempt_length(prop.cons)
        if ante is None or cons is None:
            return None
        return ante - 1 + (0 if prop.overlapped else 1) + cons
    return None


def _assignments(prop: Prop) -> dict[str, tuple[int, Any]]:
    """{var: (tick offset from the attempt start, expression)} for each local
    variable assignment; the offset must be fixed so one register per
    replica holds the value."""
    found: dict[str, tuple[int, Any]] = {}

    def walk(s: Seq, start: Optional[int]) -> None:
        if isinstance(s, SeqMatchItems):
            lo, hi = _seq_length(s.seq)
            if start is None or lo != hi:
                raise CompileError("local variables must be assigned at a fixed tick of the attempt")
            for a in s.assignments:
                if a.var in found:
                    raise CompileError(f"local variable '{a.var}' is assigned more than once")
                found[a.var] = (start + lo - 1, a.expr)
            walk(s.seq, start)
            return
        if isinstance(s, SeqConcat):
            pos: Optional[int] = start
            for delay, item in s.items:
                # an item starts `delay` ticks after the previous one ends
                # (for the first item: after the attempt start)
                if pos is not None:
                    pos = pos + delay.min if delay.min == delay.max else None
                walk(item, pos)
                if pos is not None:
                    lo, hi = _seq_length(item)
                    pos = pos + lo - 1 if lo == hi else None
            return
        for child in _children(s):
            walk(child, None)

    if isinstance(prop, PropImplication):
        walk(prop.ante, 0)
        lo, hi = _seq_length(prop.ante)
        cons_start = (lo - 1 + (0 if prop.overlapped else 1)) if lo == hi else None
        if isinstance(prop.cons, PropSeq):
            walk(prop.cons.seq, cons_start)
    elif isinstance(prop, PropSeq):
        walk(prop.seq, 0)
    else:
        raise CompileError("local variables are supported in sequences and implications only")
    return found


def _children(s: Seq) -> list[Seq]:
    if isinstance(s, (SeqRepeat, SeqThroughout, SeqFirstMatch)):
        return [s.seq]
    if isinstance(s, SeqBinary):
        return [s.left, s.right]
    return []
