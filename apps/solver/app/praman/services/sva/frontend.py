"""
SVA front end: elaborate DUT + assertion sources with slang (pyslang) and
extract every concurrent assertion as an AssertionRecord (see ir.py).

slang does the language work: preprocessing (macros with arguments,
`include), parameters, bind, hierarchical names, named sequences and
properties with arguments, local variables, and typing every expression.
This module adds what slang leaves to tools:

- IEEE 1800-2017 16.14.6 clock inference: explicit clock, else the clock of
  the enclosing always procedure, else the scope's default clocking.
- default disable iff (16.15): applied when an assertion has none.
- The scope each assertion checks (the bind target), and every DUT signal it
  reads, resolved to a path, width and signedness.
- A total mapping to the IR: anything not representable becomes an
  Unsupported problem on that one record, never a silent drop.
"""

from __future__ import annotations

import gc
import logging
import re
import weakref
from dataclasses import dataclass, field
from typing import Any, Optional

from pyslang import Bag, ConstantValue, DiagnosticEngine, SVInt, TextDiagnosticClient, ast, syntax

from app.praman.services.sva.ports import through_bind
from app.praman.services.sva.ir import (
    AssertionKind, AssertionRecord, AssignValue, Bound, CaseCondition, Clock, ConstValue, Delay, ExprValue,
    InitialCycle, LocalAssign, Location, MuxValue, NegatedCondition, Prop, PropClocked, RangeCondition,
    UnknownValue,
    PropAbort, PropBinary, PropFollowedBy, PropIf, PropImplication, PropNot,
    PropOp, PropSeq, PropTemporal, RepeatKind, Seq, SeqBinary, SeqBool,
    SeqConcat, SeqFirstMatch, SeqMatchItems, SeqOp, SeqRepeat, SeqSwitch, SeqThroughout,
    Signal, TemporalOp, Unsupported,
)

logger = logging.getLogger("veriassist.sva.frontend")

# `default disable iff (E);` is rewritten in place to this net declaration so
# that slang binds and type-checks E in its scope (pyslang has no public API
# to bind a free-standing expression).  Same line count, so locations hold.
DEFAULT_DISABLE_NET = "__va_default_disable"


class FrontendError(Exception):
    """The sources could not be elaborated; carries slang's diagnostics."""


@dataclass
class ElaboratedDesign:
    compilation: Any                 # keeps slang's AST objects alive
    tops: list[str]
    records: list[AssertionRecord]
    warnings: list[str] = field(default_factory=list)
    keeper: Any = None               # keeps its compilations from being freed (see _new_compilation)


def elaborate(
    files: dict[str, str],
    top: str = "",
    defines: Optional[dict[str, str]] = None,
    hierarchical: bool = False,
    auto_checks: bool = False,
) -> ElaboratedDesign:
    """Elaborate {filename: source} and extract all concurrent assertions.

    hierarchical: the Yosys reader resolves hierarchical references, so an
    assertion may read signals anywhere it sees (the target moves up to an
    enclosing instance).  Either way, signals below the checked module (sub-
    instances, helper logic in a bound checker) are read; with read -sv the
    pipeline connects them after flattening.  auto_checks: add automatic checks of the
    design (branch reachability, array index range; see _AutoChecks).

    Raises FrontendError if slang reports errors.
    """
    keeper = _Keeper()
    compilation = _compile(keeper, files, defines)
    errors, warnings = _diagnostics(compilation)
    if errors:
        raise FrontendError("\n".join(errors))

    root = compilation.getRoot()
    tops = [inst.name for inst in root.topInstances]
    if top and top not in tops:
        # A module instantiated elsewhere chosen as top (like -top in other
        # tools): elaborate it as the root; keep unrelated tops (checkers).
        definitions = {d.name for d in compilation.getDefinitions()} \
            if hasattr(compilation, "getDefinitions") else {top}
        if top not in definitions:
            raise FrontendError(
                f"Top module '{top}' is not defined in the design "
                f"(top-level modules: {', '.join(tops) or 'none'}).")
        keep = [t.name for t in root.topInstances if not _instantiates(t, top)]
        compilation = _compile(keeper, files, defines, [top, *keep])
        errors, warnings = _diagnostics(compilation)
        if errors:
            raise FrontendError("\n".join(errors))
        root = compilation.getRoot()
        tops = [inst.name for inst in root.topInstances]

    walker = _Walker(compilation, hierarchical, auto_checks)
    for inst in root.topInstances:
        walker.walk_instance(inst)

    # Safety net: every concurrent assertion slang knows about must be
    # reported, even in a context the walker does not handle.
    seen = {id(r) for r in walker.statements}
    def find_missed(obj):
        if isinstance(obj, ast.GenerateBlockSymbol) and obj.isUninstantiated:
            return ast.VisitAction.Skip   # a generate branch not taken: not part of the design
        if isinstance(obj, ast.ConcurrentAssertionStatement) and id(obj) not in seen:
            walker.records.append(walker.unsupported_record(
                obj, "assertion in a context that is not supported yet "
                     "(checker, class, function, or uninstantiated scope)"))
        return True
    root.visit(find_missed)

    logger.info(f"Elaborated {len(files)} file(s): tops={tops}, {len(walker.records)} assertion(s)")
    design = ElaboratedDesign(compilation, tops, walker.records, warnings, keeper)
    for record in design.records:
        record.owner = design
    return design


# ── Compilation lifetime ──────────────────────────────────────
# pyslang's wrappers of AST objects (symbols, expressions, types) do not keep
# their Compilation alive.  If a compilation is freed while a wrapper of one
# of its objects still exists, nanobind aborts the process later ("unexpected
# collision") once a new object is allocated at a freed address.  Such
# wrappers outlive their compilation in reference cycles the garbage collector
# has not reached yet (e.g. a property compiler and its bound methods), so a
# compilation is freed only once the design that owns it is gone, and only
# right after a collection.

class _Keeper:
    """Held by an ElaboratedDesign (and so by its records): its compilations
    stay alive as long as it does."""


_compilations: list[tuple[Any, weakref.ref]] = []    # (compilation, its keeper)


def _new_compilation(keeper: _Keeper, options=None):
    gc.collect()
    _compilations[:] = [(c, k) for c, k in _compilations if k() is not None]
    compilation = ast.Compilation(options) if options is not None else ast.Compilation()
    _compilations.append((compilation, weakref.ref(keeper)))
    return compilation


def _compile(keeper: _Keeper, files: dict[str, str], defines: Optional[dict[str, str]],
             tops: Optional[list[str]] = None):
    if tops:
        options = ast.CompilationOptions()
        options.topModules = set(tops)
        compilation = _new_compilation(keeper, Bag([options]))
    else:
        compilation = _new_compilation(keeper)
    for name, text in files.items():
        if defines:
            text = "".join(f"`define {k} {v}\n" for k, v in defines.items()) + text
        compilation.addSyntaxTree(syntax.SyntaxTree.fromText(_rewrite_default_disable(text), name))
    return compilation


def _instantiates(inst, definition: str) -> bool:
    found = []
    def visit(obj):
        if isinstance(obj, ast.InstanceSymbol) and obj.definition.name == definition:
            found.append(obj)
            return False
        return not found
    inst.visit(visit)
    return bool(found)


# ── Source rewriting ─────────────────────────────────────────

_DEFAULT_DISABLE_RE = re.compile(r'\bdefault(\s+)disable(\s+)iff\b')


def _rewrite_default_disable(text: str) -> str:
    """`default disable iff (E);` -> `wire __va_default_disable = |(E);`.

    Whitespace (including newlines) between the keywords is kept, so line
    numbers do not move.  |(E) gives the truth value of a multi-bit E.
    """
    def repl(m: re.Match) -> str:
        return f"wire{m.group(1)}{DEFAULT_DISABLE_NET}{m.group(2)}= |"
    return _DEFAULT_DISABLE_RE.sub(repl, text)


def _diagnostics(compilation) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    engine = DiagnosticEngine(compilation.sourceManager)
    for diag in compilation.getAllDiagnostics():
        client = TextDiagnosticClient()
        engine.addClient(client)
        engine.issue(diag)
        engine.clearClients()
        text = client.getString().strip()
        (errors if diag.isError() else warnings).append(text)
    return errors, warnings


# ── Design walk ───────────────────────────────────────────────

_KIND = {
    ast.AssertionKind.Assert: AssertionKind.ASSERT,
    ast.AssertionKind.Assume: AssertionKind.ASSUME,
    ast.AssertionKind.CoverProperty: AssertionKind.COVER,
    ast.AssertionKind.CoverSequence: AssertionKind.COVER,
    ast.AssertionKind.Restrict: AssertionKind.RESTRICT,
}

_EDGE = {
    ast.EdgeKind.PosEdge: "posedge",
    ast.EdgeKind.NegEdge: "negedge",
    ast.EdgeKind.BothEdges: "edge",
}

_REAL_PROCEDURES = {
    syntax.SyntaxKind.AlwaysBlock, syntax.SyntaxKind.AlwaysFFBlock,
    syntax.SyntaxKind.AlwaysCombBlock, syntax.SyntaxKind.AlwaysLatchBlock,
    syntax.SyntaxKind.InitialBlock, syntax.SyntaxKind.FinalBlock,
}


@dataclass
class _ScopeDefaults:
    clock: Optional[Clock] = None
    disable: Any = None


class _Walker:
    def __init__(self, compilation, hierarchical: bool = False, auto_checks: bool = False):
        self.compilation = compilation
        self.hierarchical = hierarchical
        self.auto_checks = auto_checks
        self.sm = compilation.sourceManager
        self.records: list[AssertionRecord] = []
        self.statements: list = []
        self.auto_labels: dict[str, int] = {}
        self.call_sites: dict[str, int] = {}      # task/function calls inlined so far
        # generate-loop iterations around the statement being read, e.g.
        # ["g_sel_0"] inside g_sel[0]; makes per-iteration labels unique
        self.generate_path: list[str] = []

    # Instances and scopes

    def walk_instance(self, inst) -> None:
        self.walk_scope(inst.body, inst, _ScopeDefaults())

    def walk_scope(self, scope, inst, inherited: _ScopeDefaults) -> None:
        defaults = self.scope_defaults(scope, inherited)
        for member in scope:
            if isinstance(member, ast.InstanceSymbol):
                if member.isModule or member.isInterface:
                    self.walk_instance(member)
            elif isinstance(member, ast.InstanceArraySymbol):
                for element in member:
                    if isinstance(element, ast.InstanceSymbol):
                        self.walk_instance(element)
            elif isinstance(member, (ast.GenerateBlockSymbol,)):
                if not member.isUninstantiated:
                    self.walk_scope(member, inst, defaults)
            elif isinstance(member, ast.GenerateBlockArraySymbol):
                for block in member:
                    if isinstance(block, ast.GenerateBlockSymbol) and not block.isUninstantiated:
                        self.generate_path.append(f"{member.name}_{block.arrayIndex}")
                        try:
                            self.walk_scope(block, inst, defaults)
                        finally:
                            self.generate_path.pop()
            elif isinstance(member, ast.ProceduralBlockSymbol):
                self.walk_procedure(member, inst, defaults)
            elif isinstance(member, ast.ContinuousAssignSymbol) and self.auto_checks:
                for expr, lo, hi in _index_checks(member.assignment):
                    self.records.append(self.index_record(expr, lo, hi, inst, None, [], {}))

    def scope_defaults(self, scope, inherited: _ScopeDefaults) -> _ScopeDefaults:
        defaults = _ScopeDefaults(inherited.clock, inherited.disable)
        for member in scope:
            if isinstance(member, ast.ClockingBlockSymbol) and self.is_default_clocking(member, scope):
                defaults.clock = self.clock_from_timing(member.event)
            elif isinstance(member, ast.NetSymbol) and member.name == DEFAULT_DISABLE_NET:
                defaults.disable = member.initializer
        return defaults

    @staticmethod
    def is_default_clocking(block, scope) -> bool:
        decl = block.syntax
        keyword = getattr(decl, "globalOrDefault", None)
        if keyword is not None and keyword.valueText == "default":
            return True
        # `default clocking cb;` referring to a block declared elsewhere
        for member in scope:
            syn = getattr(member, "syntax", None)
            if syn is not None and syn.kind == syntax.SyntaxKind.DefaultClockingReference \
                    and syn.name.valueText == block.name:
                return True
        return False

    def walk_procedure(self, proc, inst, defaults: _ScopeDefaults) -> None:
        procedure_clock = None
        if proc.syntax is not None and proc.syntax.kind in _REAL_PROCEDURES:
            body = proc.body
            if isinstance(body, ast.TimedStatement):
                procedure_clock = self.clock_from_timing(body.timing)

        def visit(obj):
            if isinstance(obj, ast.ConcurrentAssertionStatement):
                self.statements.append(obj)
                self.records.append(self.make_record(obj, inst, defaults, procedure_clock))
                return False
            return True
        proc.body.visit(visit)

        # Immediate assertions: checked by the monitor at the procedure's
        # clock, guarded by the if/case branch they sit in.
        if proc.syntax is not None and proc.syntax.kind in _REAL_PROCEDURES:
            initial = proc.syntax.kind == syntax.SyntaxKind.InitialBlock
            final = proc.syntax.kind == syntax.SyntaxKind.FinalBlock
            collector = _ImmediateCollector(proc, initial=initial, calls=self.call_sites)
            for found in collector.collect(proc.body):
                if final and not found.problem:
                    found.problem = "immediate assertion in a final block (end of simulation) has no formal meaning"
                self.records.append(self.immediate_record(found, inst, procedure_clock))
            if self.auto_checks and not (initial or final):
                for anchor, suffix, conds, what in collector.branches:
                    self.records.append(self.branch_record(anchor, suffix, conds, what, inst, procedure_clock))
                for expr, lo, hi, conds, values in collector.indexes:
                    self.records.append(self.index_record(expr, lo, hi, inst, procedure_clock, conds, values))

    # Automatic checks (no SVA needed)

    def auto_label(self, kind: str, inst, node, suffix: str = "") -> str:
        line = self.location(node.sourceRange.start).line
        base = f"auto_{kind}_{inst.definition.name}_L{line}{suffix}"
        self.auto_labels[base] = self.auto_labels.get(base, 0) + 1
        count = self.auto_labels[base]
        return base if count == 1 else f"{base}_{count}"

    def branch_record(self, anchor, suffix: str, conds, what: str, inst, clock) -> AssertionRecord:
        """Cover: the branch can be taken (unreachable = dead code)."""
        guards = [c if pol else NegatedCondition(c) for c, pol in conds]
        seq: Seq = SeqBool(guards[0])
        for g in guards[1:]:
            seq = SeqBinary(SeqOp.INTERSECT, seq, SeqBool(g))
        loc = self.location(anchor.sourceRange.start)
        record = AssertionRecord(
            label=self.auto_label("reach", inst, anchor, suffix), kind=AssertionKind.COVER,
            location=loc, target=inst.hierarchicalPath, clock=clock, disable=None,
            prop=PropSeq(seq), after_reset=True, note=f"{what} at {loc} is reachable",
            drivers=tuple(sorted(_drivers(_raw_exprs(conds[-1:])))))
        _SignalResolver(self, inst, record).resolve(_raw_exprs(conds), clock, None)
        return record

    def index_record(self, expr, lo: int, hi: int, inst, clock, conds, values: dict) -> AssertionRecord:
        """Assert: a variable index stays within its array's bounds."""
        guards = [c if pol else NegatedCondition(c) for c, pol in conds]
        check = RangeCondition(expr.selector, lo, hi)
        body = SeqBool(Bound(check, values) if values else check)
        prop: Prop = PropSeq(body)
        if guards:
            ante: Seq = SeqBool(guards[0])
            for g in guards[1:]:
                ante = SeqBinary(SeqOp.INTERSECT, ante, SeqBool(g))
            prop = PropImplication(ante, prop, True,
                                   ante_text=" && ".join(_condition_text(g) for g in guards))
        loc = self.location(expr.sourceRange.start)
        text = " ".join(str(expr.syntax).split()) if expr.syntax is not None else "index"
        record = AssertionRecord(
            label=self.auto_label("index", inst, expr), kind=AssertionKind.ASSERT,
            location=loc, target=inst.hierarchicalPath, clock=clock, disable=None, prop=prop,
            after_reset=True, note=f"index of {text} at {loc} stays within [{lo}:{hi}]")
        _SignalResolver(self, inst, record).resolve(_reads(body.expr) + _raw_exprs(conds), clock, None)
        return record

    def immediate_record(self, found: _Found, inst, clock) -> AssertionRecord:
        stmt = found.stmt
        kind = _KIND.get(stmt.assertionKind, AssertionKind.ASSERT)
        if found.problem:
            return self.unsupported_record(stmt, found.problem, found.suffix)
        conds = ([(InitialCycle(), True)] if found.initial else []) + found.conds
        guards = [c if pol else NegatedCondition(c) for c, pol in conds]
        body = SeqBool(Bound(stmt.cond, found.values) if found.values else stmt.cond)
        if kind == AssertionKind.COVER:
            seq: Seq = body
            for g in guards:
                seq = SeqBinary(SeqOp.INTERSECT, SeqBool(g), seq)
            prop: Prop = PropSeq(seq)
        elif guards:
            ante: Seq = SeqBool(guards[0])
            for g in guards[1:]:
                ante = SeqBinary(SeqOp.INTERSECT, ante, SeqBool(g))
            text = " && ".join(_condition_text(g) for g in guards)
            prop = PropImplication(ante, PropSeq(body), True, ante_text=text)
        else:
            prop = PropSeq(body)
        record = AssertionRecord(
            label=self.label(stmt, kind) + found.suffix, kind=kind,
            location=self.location(stmt.sourceRange.start), target=inst.hierarchicalPath,
            clock=clock, disable=None, prop=prop, after_reset=not found.initial)
        _SignalResolver(self, inst, record).resolve(_reads(body.expr) + _raw_exprs(found.conds), clock, None)
        return record

    # Records

    def make_record(self, stmt, inst, defaults: _ScopeDefaults, procedure_clock) -> AssertionRecord:
        kind = _KIND.get(stmt.assertionKind)
        if kind is None:
            return self.unsupported_record(stmt, f"'{stmt.assertionKind.name.lower()}' statements are not supported")

        converter = _Converter(self)
        clock, disable, body = converter.peel(stmt.propertySpec)
        # Clock inference (IEEE 1800 16.14.6): explicit or leading clock,
        # then the enclosing procedure's clock, then default clocking.
        converter.clock = clock or procedure_clock or defaults.clock
        if disable is None:
            disable = defaults.disable

        prop = converter.to_prop(body)
        clock = converter.clock
        record = AssertionRecord(
            label=self.label(stmt, kind),
            kind=kind,
            location=self.location(stmt.sourceRange.start),
            target=inst.hierarchicalPath,
            clock=clock,
            disable=disable,
            prop=prop,
            local_vars=tuple(converter.local_vars),
            problems=list(converter.problems),
            clocks=tuple(converter.other_clocks),
        )
        # clock None = unclocked; the integration decides which clock to use
        # (the DUT's single clock, or every solver step for combinational logic).

        _SignalResolver(self, inst, record).resolve(converter.expressions, clock, disable)
        return record

    def unsupported_record(self, stmt, reason: str, suffix: str = "") -> AssertionRecord:
        loc = self.location(stmt.sourceRange.start)
        kind = _KIND.get(stmt.assertionKind, AssertionKind.ASSERT)
        return AssertionRecord(
            label=self.label(stmt, kind) + suffix, kind=kind, location=loc, target="",
            clock=None, disable=None, prop=Unsupported(reason, loc),
            problems=[Unsupported(reason, loc)],
        )

    def label(self, stmt, kind: AssertionKind) -> str:
        syn = stmt.syntax
        if syn is not None and syn.label is not None:
            # `wp : cover ...` inside `for (...) begin : g` exists once per
            # iteration: g[2].wp is labelled g_2__wp
            return "__".join([*self.generate_path, syn.label.name.valueText])
        line = self.location(stmt.sourceRange.start).line
        base = f"_auto_{kind.value}_line{line}"
        self.auto_labels[base] = self.auto_labels.get(base, 0) + 1
        count = self.auto_labels[base]
        return base if count == 1 else f"{base}_{count}"

    def location(self, loc) -> Location:
        loc = self.sm.getFullyOriginalLoc(loc)
        return Location(self.sm.getFileName(loc), self.sm.getLineNumber(loc))

    def clock_from_timing(self, timing) -> Optional[Clock]:
        if isinstance(timing, ast.SignalEventControl) and timing.edge in _EDGE \
                and timing.iffCondition is None:
            return Clock(_EDGE[timing.edge], timing.expr)
        return None


def _condition_text(cond) -> str:
    if isinstance(cond, Bound):
        return _condition_text(cond.expr)
    if isinstance(cond, InitialCycle):
        return "first cycle"
    if isinstance(cond, RangeCondition):
        return f"{_condition_text(cond.expr)} in [{cond.lo}:{cond.hi}]"
    if isinstance(cond, NegatedCondition):
        return f"!({_condition_text(cond.cond)})"
    if isinstance(cond, CaseCondition):
        subject = _condition_text(cond.subject)
        op = "inside" if cond.match == "inside" else "matches" if cond.match else "=="
        return " || ".join(f"{subject} {op} {_condition_text(i)}" for i in cond.items)
    syn = getattr(cond, "syntax", None)
    return " ".join(str(syn).split()) if syn is not None else "?"


def _drivers(exprs) -> set[str]:
    """Hierarchical paths of the signals driving the values read by `exprs`
    (module ports followed upwards)."""
    from app.praman.services.sva.clocks import _driver
    out: set[str] = set()
    def visit(obj):
        if isinstance(obj, (ast.NamedValueExpression, ast.HierarchicalValueExpression)):
            sym = _driver(obj.symbol)
            if sym is not None:
                out.add(sym.hierarchicalPath)
        return True
    for e in exprs:
        e.visit(visit)
    return out


def _expr_text(e) -> str:
    while isinstance(e, ast.ConversionExpression) and e.syntax is None:
        e = e.operand
    return " ".join(str(e.syntax).split()) if e.syntax is not None else "?"


def _raw_exprs(conds) -> list:
    return [e for c, _ in conds for e in _reads(c)]


def _reads(item, values: Optional[dict] = None) -> list:
    """The slang expressions a condition or value really reads: a variable
    with a procedural value contributes what that value reads instead."""
    values = values or {}
    if item is None or isinstance(item, (InitialCycle, UnknownValue, ConstValue)):
        return []
    if isinstance(item, Bound):
        return _reads(item.expr, item.values)
    if isinstance(item, NegatedCondition):
        return _reads(item.cond, values)
    if isinstance(item, RangeCondition):
        return _reads(item.expr, values)
    if isinstance(item, CaseCondition):
        items = [x for i in item.items
                 for x in ([i.left, i.right] if isinstance(i, ast.ValueRangeExpression) else [i])]
        return [e for x in [item.subject, *items] for e in _reads(x, values)]
    out = []
    def visit(obj):
        if isinstance(obj, (ast.NamedValueExpression, ast.HierarchicalValueExpression)):
            value = values.get(obj.symbol.hierarchicalPath, obj)
            out.extend([obj] if value is obj else _value_reads(value, obj))
        return True
    item.visit(visit)
    return out


def _value_reads(value, own) -> list:
    if value is None:                          # the variable's own value
        return [own]
    if isinstance(value, ExprValue):
        return _reads(value.expr, value.values)
    if isinstance(value, MuxValue):
        return _reads(value.cond) + _value_reads(value.then, own) + _value_reads(value.other, own)
    if isinstance(value, AssignValue):
        node = value.assign
        parts = [node.operand] if isinstance(node, ast.UnaryExpression) else [node.left, node.right]
        return [e for part in parts for e in _reads(part, value.values)]
    return []


def _index_checks(expr) -> list[tuple[Any, int, int]]:
    """Variable selects into arrays/vectors whose index can leave the
    bounds: [(select expression, lo, hi)]."""
    out = []
    def visit(obj):
        if isinstance(obj, ast.ElementSelectExpression):
            sel = obj.selector
            rng = getattr(obj.value.type, "fixedRange", None)
            if sel.constant is None and rng is not None:
                lo, hi = int(rng.lower), int(rng.upper)
                width = sel.type.bitWidth
                fits = not sel.type.isSigned and lo == 0 and (1 << width) - 1 <= hi
                if not fits and width > 0:
                    out.append((obj, lo, hi))
        return True
    expr.visit(visit)
    return out


@dataclass
class _Found:
    """An immediate assertion reached by the procedure walk."""
    stmt: Any                  # ImmediateAssertionStatement
    conds: list                # [(condition, polarity)] leading to it, read with their values
    values: dict               # procedural variable values at the assertion (ir.Bound)
    problem: str = ""
    suffix: str = ""           # label suffix: loop iteration, repeated task call
    initial: bool = False      # in an initial block: checked in the first cycle


_MATCH = {"Normal": "", "WildcardJustZ": "z", "WildcardXOrZ": "x", "Inside": "inside"}
_MAX_ITERATIONS = 256
_MAX_CONDITIONAL = 32       # iterations that run only if a signal condition holds
# (do-while and forever loops are not synthesizable: the design readers reject them)
_LOOPS = (ast.ForLoopStatement, ast.WhileLoopStatement, ast.RepeatLoopStatement)
_MAX_CALL_DEPTH = 8


class _ImmediateCollector:
    """Immediate assertions in a procedure, each with the branch conditions
    leading to it and the values its variables have there.

    The walk follows the procedure like a simulator would, symbolically:
    blocking assignments give variables a value (ir.ExprValue, ir.AssignValue,
    ir.ConstValue when it folds to a constant), if/case branches merge into
    muxes (ir.MuxValue), loops are unrolled iteration by iteration while their
    condition can hold, and task/function calls are inlined with their
    arguments.  What it cannot follow is marked (ir.UnknownValue) and
    reported only if an assertion reads it."""

    def __init__(self, scope, initial: bool = False, calls: Optional[dict] = None):
        self.scope = scope              # for constant evaluation (loop bounds)
        self.initial = initial
        self.calls = calls if calls is not None else {}   # call sites per subroutine
        self.found: list[_Found] = []
        # automatic checks: (anchor node, label suffix, conditions, description)
        self.branches: list[tuple[Any, str, list, str]] = []
        self.indexes: list[tuple[Any, int, int, list, dict]] = []   # (select, lo, hi, conditions, values)
        self.suffix = ""
        self.depth = 0                  # nested task/function calls
        self.symbols: dict[str, Any] = {}   # path -> symbol of each variable given a value

    def collect(self, stmt) -> list[_Found]:
        self.walk(stmt, [], {})
        return self.found

    # Statements

    def walk(self, stmt, conds: list, values: dict) -> None:
        if stmt is None:
            return
        if isinstance(stmt, ast.ImmediateAssertionStatement):
            self.found.append(_Found(stmt, list(conds), dict(values), suffix=self.suffix, initial=self.initial))
        elif isinstance(stmt, ast.TimedStatement):
            self.walk(stmt.stmt, conds, values)
        elif isinstance(stmt, ast.BlockStatement):
            self.walk(stmt.body, conds, values)
        elif isinstance(stmt, ast.StatementList):
            for s in stmt.list:
                self.walk(s, conds, values)
        elif isinstance(stmt, ast.ConditionalStatement):
            self.conditional(stmt, conds, values)
        elif isinstance(stmt, ast.CaseStatement):
            self.case(stmt, conds, values)
        elif isinstance(stmt, ast.ExpressionStatement):
            self.expression(stmt.expr, conds, values)
        elif isinstance(stmt, ast.VariableDeclStatement):
            self.declare(stmt.symbol, values)
        elif isinstance(stmt, ast.ForeachLoopStatement):
            self.foreach(stmt, conds, values)
        elif isinstance(stmt, _LOOPS):
            self.loop(stmt, conds, values)
        elif isinstance(stmt, ast.EmptyStatement):
            pass
        else:
            what = type(stmt).__name__.replace("Statement", " statement").lower()
            self.unsupported_inside(stmt, what)
            self.forget_writes(stmt, values, f"written inside a {what}")

    def conditional(self, stmt, conds: list, values: dict) -> None:
        cs = list(stmt.conditions)
        if any(c.pattern is not None for c in cs):
            self.unsupported_inside(stmt, "a pattern-matching if")
            self.forget_writes(stmt, values, "written inside a pattern-matching if")
            return
        bound = [(self.bind(c.expr, values), True) for c in cs]
        text = " && ".join(_expr_text(c.expr) for c in cs)
        self.branch(stmt, "_then", conds + bound, f"branch 'if ({text})'")
        then_values = dict(values)
        self.walk(stmt.ifTrue, conds + bound, then_values)
        else_values = dict(values)
        if stmt.ifFalse is not None:
            if len(cs) != 1:
                self.unsupported_inside(stmt.ifFalse, "the else of an if with &&& conditions")
                self.forget_writes(stmt.ifFalse, else_values, "written in the else of an if with &&& conditions")
            else:
                self.branch(stmt, "_else", conds + [(bound[0][0], False)], f"else of 'if ({text})'")
                self.walk(stmt.ifFalse, conds + [(bound[0][0], False)], else_values)
        if len(cs) == 1:
            self.merge(values, [(bound[0][0], then_values)], else_values)
        else:
            self.merge(values, [], then_values, how="written under an if with &&& conditions")

    def case(self, stmt, conds: list, values: dict) -> None:
        match = _MATCH[stmt.condition.name]
        earlier: list = []
        arms: list = []
        subject = _expr_text(stmt.expr)
        for i, group in enumerate(stmt.items):
            item = self.bind(CaseCondition(stmt.expr, tuple(group.expressions), match), values)
            labels = ", ".join(_expr_text(e) for e in group.expressions)
            self.branch(stmt, f"_item{i}", conds + earlier + [(item, True)], f"'case ({subject})' item {labels}")
            arm = dict(values)
            self.walk(group.stmt, conds + earlier + [(item, True)], arm)
            arms.append((item, arm))
            earlier.append((item, False))
        default = dict(values)
        if stmt.defaultCase is not None:
            if earlier:
                self.branch(stmt, "_default", conds + earlier, f"default of 'case ({subject})'")
            self.walk(stmt.defaultCase, conds + earlier, default)
        self.merge(values, arms, default)

    def expression(self, expr, conds: list, values: dict) -> None:
        if isinstance(expr, ast.CallExpression) and not expr.subroutineName.startswith("$"):
            self.call(expr, conds, values)
            return
        # assertions inside functions called in the expression
        calls = []
        def find_calls(obj):
            if isinstance(obj, ast.CallExpression) and not obj.subroutineName.startswith("$"):
                calls.append(obj)
            return True
        expr.visit(find_calls)
        for call in calls:
            self.call(call, conds, dict(values))
        if self.depth == 0:
            for select, lo, hi in _index_checks(expr):
                self.indexes.append((select, lo, hi, list(conds), dict(values)))
        if not self.assign(expr, values):
            self.forget_writes(expr, values, "written in a way the tool cannot follow (an array element, "
                                             "a struct member or inside an expression)")

    def declare(self, sym, values: dict) -> None:
        if sym.initializer is not None:
            folded = self.fold_into(sym, sym.initializer, values)
            values[sym.hierarchicalPath] = folded or ExprValue(sym.initializer, dict(values))

    def assign(self, expr, values: dict) -> bool:
        """Follow a blocking assignment (whole, compound or to a part of a
        vector) or an increment; False if it is not one."""
        if isinstance(expr, ast.UnaryExpression) and expr.op.name.endswith(("increment", "decrement")):
            sym, whole = _whole_variable(expr.operand), None
        elif isinstance(expr, ast.AssignmentExpression) and not expr.isNonBlocking:
            sym = _whole_variable(expr.left)
            whole = expr.right if sym is not None and not expr.isCompound else None   # x = e
            if sym is None and isinstance(expr.left, (ast.ElementSelectExpression, ast.RangeSelectExpression)):
                sym = _whole_variable(expr.left.value)
                if sym is not None and (not sym.type.isIntegral or expr.left.value.type.fixedRange is None):
                    sym = None
        else:
            return False
        if sym is None:
            return False
        path = sym.hierarchicalPath
        folded = self.fold_into(sym, expr, values)
        values[path] = folded or (ExprValue(whole, dict(values)) if whole is not None else AssignValue(expr, dict(values)))
        return True

    # Loops

    def foreach(self, stmt, conds: list, values: dict) -> None:
        iterations: list[tuple[dict, str]] = [({}, "")]
        for dim in stmt.loopDims:
            if dim.loopVar is None:
                continue
            rng = dim.range
            if rng is None:
                return self.not_unrolled(stmt, values, "a foreach loop over a dynamic array")
            left, right = int(rng.left), int(rng.right)
            step = 1 if right >= left else -1
            var = dim.loopVar
            self.symbols[var.hierarchicalPath] = var
            iterations = [({**b, var.hierarchicalPath: _const(var, i)}, f"{s}__{var.name}{i}")
                          for b, s in iterations for i in range(left, right + step, step)]
            if len(iterations) > _MAX_ITERATIONS:
                return self.not_unrolled(stmt, values, f"a loop of more than {_MAX_ITERATIONS} iterations")
        outer = self.suffix
        for bindings, suffix in iterations:
            values.update(bindings)
            self.suffix = outer + suffix
            self.walk(stmt.body, conds, values)
        self.suffix = outer

    def loop(self, stmt, conds: list, values: dict) -> None:
        """for / while / repeat, unrolled while the loop
        condition can hold.  An iteration whose condition depends on signals
        runs under that condition; afterwards each variable gets its value
        at the exit taken."""
        if _jumps(stmt.body):
            return self.not_unrolled(stmt, values, "a loop with break, continue or return")
        if isinstance(stmt, ast.RepeatLoopStatement) and self.fold(stmt.count, values) is None:
            return self.not_unrolled(stmt, values, "a repeat loop whose count is not constant")
        if isinstance(stmt, ast.ForLoopStatement):
            for var in stmt.loopVars:
                self.declare(var, values)
            for init in stmt.initializers:
                self.expression(init, conds, values)
        path: list = []           # conditions of the iterations so far
        exits: list = []          # (condition of leaving the loop there, values then)
        current = dict(values)
        walked = len(self.found), len(self.branches), len(self.indexes)
        for k in range(_MAX_ITERATIONS + 1):
            holds, cond = self.loop_condition(stmt, k, current)
            if holds is False:
                break
            if k == _MAX_ITERATIONS:
                del self.found[walked[0]:], self.branches[walked[1]:], self.indexes[walked[2]:]
                return self.not_unrolled(stmt, values, f"a loop that can run more than {_MAX_ITERATIONS} "
                                                       "iterations")
            if holds is None:
                if len(path) == _MAX_CONDITIONAL:
                    del self.found[walked[0]:], self.branches[walked[1]:], self.indexes[walked[2]:]
                    return self.not_unrolled(stmt, values, f"a loop whose iteration count depends on signals "
                                                           f"and can exceed {_MAX_CONDITIONAL}")
                bound = self.bind(cond, current)
                exits.append((NegatedCondition(bound), dict(current)))
                path.append((bound, True))
            outer = self.suffix
            self.suffix = outer + self.iteration_suffix(stmt, k, current)
            self.walk(stmt.body, conds + path, current)
            if isinstance(stmt, ast.ForLoopStatement):
                for step in stmt.steps:
                    self.expression(step, conds + path, current)
            self.suffix = outer
        self.merge(values, exits, current)

    def loop_condition(self, stmt, k: int, values: dict) -> tuple[Optional[bool], Any]:
        """(does iteration k run: True / False / None = depends on signals,
        the condition to run it under)."""
        if isinstance(stmt, ast.RepeatLoopStatement):
            count = self.fold(stmt.count, values)              # constant (checked by loop)
            return count is not None and k < count, None
        cond = stmt.stopExpr if isinstance(stmt, ast.ForLoopStatement) else stmt.cond
        if cond is None:
            return True, None
        return _truth(self.interval(cond, values)), cond

    def iteration_suffix(self, stmt, k: int, values: dict) -> str:
        """Label suffix of an iteration: the loop variable's value (for), else
        the iteration number."""
        if isinstance(stmt, ast.RepeatLoopStatement):
            return f"__r{k}"
        if isinstance(stmt, ast.ForLoopStatement):
            names = [v for v in stmt.loopVars] or [_whole_variable(i.left) for i in stmt.initializers
                                                   if isinstance(i, ast.AssignmentExpression)]
            if len(names) == 1 and names[0] is not None:
                value = values.get(names[0].hierarchicalPath)
                if isinstance(value, ConstValue):
                    return f"__{names[0].name}{value.value}"
        return f"__it{k}"

    def not_unrolled(self, stmt, values: dict, what: str) -> None:
        self.unsupported_inside(stmt, what)
        self.forget_writes(stmt, values, f"written in {what}")

    # Constant folding

    def fold(self, expr, values: dict) -> Optional[int]:
        """The value of `expr` when it is constant, given the variables known
        to be constant here."""
        try:
            return _int(expr.eval(self.evaluator(values)))
        except (ValueError, TypeError, AttributeError, RuntimeError):
            return None

    def fold_into(self, sym, expr, values: dict) -> Optional[ConstValue]:
        """`sym`'s value after evaluating `expr` (an assignment, ++/-- or its
        initializer), if constant."""
        t = sym.type
        if not t.isIntegral or t.bitWidth > 64:
            return None
        path = sym.hierarchicalPath
        try:
            context = self.evaluator(values)
            if not isinstance(values.get(path), ConstValue) or path not in self.symbols:
                if isinstance(expr, ast.UnaryExpression) or expr is not sym.initializer and \
                        (expr.isCompound or _whole_variable(expr.left) is None):
                    return None                       # reads the old value, which is not constant
                context.createLocal(sym, ConstantValue(SVInt(t.bitWidth, 0, t.isSigned)))
            result = expr.eval(context)
            if expr is sym.initializer:
                value = _int(result)
                value = None if value is None else _int(ConstantValue(SVInt(t.bitWidth, value % (1 << t.bitWidth),
                                                                            t.isSigned)))
            else:
                value = _int(context.findLocal(sym)) if _int(result) is not None else None
        except (ValueError, TypeError, AttributeError, RuntimeError):
            return None
        if value is None:
            return None
        self.symbols[sym.hierarchicalPath] = sym
        return ConstValue(value, t.bitWidth, t.isSigned)

    def evaluator(self, values: dict):
        context = ast.EvalContext(self.scope)
        context.pushEmptyFrame()
        for path, value in values.items():
            if isinstance(value, ConstValue) and path in self.symbols:
                context.createLocal(self.symbols[path], ConstantValue(
                    SVInt(value.width, value.value % (1 << value.width), value.signed)))
        return context

    def interval(self, expr, values: dict) -> Optional[tuple[int, int]]:
        """Range of values `expr` can take: constant parts folded, the rest
        anything its type allows (enough to see a loop condition end)."""
        value = self.fold(expr, values)
        if value is not None:
            return value, value
        t = expr.type
        if not t.isIntegral or t.bitWidth > 64:
            return None
        full = (-(1 << (t.bitWidth - 1)), (1 << (t.bitWidth - 1)) - 1) if t.isSigned else (0, (1 << t.bitWidth) - 1)
        fits = lambda r: r if r is not None and full[0] <= r[0] and r[1] <= full[1] else full
        if isinstance(expr, ast.ConversionExpression):
            return fits(self.interval(expr.operand, values))
        if isinstance(expr, ast.UnaryExpression) and expr.op.name == "LogicalNot":
            return {True: (0, 0), False: (1, 1), None: (0, 1)}[_truth(self.interval(expr.operand, values))]
        if not isinstance(expr, ast.BinaryExpression):
            return full
        a, b = self.interval(expr.left, values), self.interval(expr.right, values)
        if a is None or b is None:
            return full
        op = expr.op.name
        if op in ("Add", "Subtract", "Multiply"):
            if op == "Add":
                return fits((a[0] + b[0], a[1] + b[1]))
            if op == "Subtract":
                return fits((a[0] - b[1], a[1] - b[0]))
            corners = [x * y for x in a for y in b]
            return fits((min(corners), max(corners)))
        always = {"LessThan": (a[1] < b[0], a[0] >= b[1]), "LessThanEqual": (a[1] <= b[0], a[0] > b[1]),
                  "GreaterThan": (a[0] > b[1], a[1] <= b[0]), "GreaterThanEqual": (a[0] >= b[1], a[1] < b[0]),
                  "Equality": (a[0] == a[1] == b[0] == b[1], a[1] < b[0] or b[1] < a[0]),
                  "Inequality": (a[1] < b[0] or b[1] < a[0], a[0] == a[1] == b[0] == b[1])}
        if op in always:
            true, false = always[op]
            return (1, 1) if true else (0, 0) if false else (0, 1)
        if op in ("LogicalAnd", "LogicalOr"):
            ta, tb = _truth(a), _truth(b)
            if op == "LogicalAnd":
                return (0, 0) if False in (ta, tb) else (1, 1) if ta is tb is True else (0, 1)
            return (1, 1) if True in (ta, tb) else (0, 0) if ta is tb is False else (0, 1)
        return full

    def call(self, call, conds: list, values: dict) -> None:
        """Inline a task or function: its assertions are checked at this call
        site, with the arguments' values."""
        sub = call.subroutine
        if not isinstance(sub, ast.SubroutineSymbol) or sub.body is None or self.depth >= _MAX_CALL_DEPTH:
            return
        site = self.calls.get(sub.hierarchicalPath, 0) + 1
        self.calls[sub.hierarchicalPath] = site
        inner = dict(values)
        outputs = []
        for formal, actual in zip(sub.arguments, call.arguments):
            if formal.direction in (ast.ArgumentDirection.In, ast.ArgumentDirection.Ref):
                inner[formal.hierarchicalPath] = ExprValue(actual, dict(values))
            if formal.direction != ast.ArgumentDirection.In:
                outputs.append((formal, actual))
        outer = self.suffix
        self.suffix = outer + (f"__call{site}" if site > 1 else "")
        self.depth += 1
        self.walk(sub.body, conds, inner)
        self.depth -= 1
        self.suffix = outer
        formals = {f.hierarchicalPath for f in sub.arguments}
        values.update({k: v for k, v in inner.items() if k not in formals and not _is_local(k, sub)})
        for formal, actual in outputs:
            sym = _whole_variable(actual)
            if sym is not None:
                value = inner.get(formal.hierarchicalPath)
                values[sym.hierarchicalPath] = UnknownValue(f"an output of '{sub.name}' it does not set") \
                    if value is None or formal.type.bitWidth != sym.type.bitWidth else value

    # Helpers

    def bind(self, cond, values: dict):
        return Bound(cond, dict(values)) if values else cond

    def branch(self, anchor, suffix: str, conds: list, what: str) -> None:
        if self.depth == 0:
            self.branches.append((anchor, suffix + self.suffix, conds, what))

    @staticmethod
    def merge(values: dict, arms: list, otherwise: dict, how: str = "") -> None:
        """After a branch: each variable written in some arm gets the value of
        the arm taken (muxes over the arms' conditions, in order)."""
        written = set(otherwise) | {k for _, arm in arms for k in arm}
        for path in written:
            options = [arm.get(path, values.get(path)) for _, arm in arms] + [otherwise.get(path, values.get(path))]
            if all(o is options[0] for o in options):
                values[path] = options[0]
                continue
            if how or any(isinstance(o, UnknownValue) for o in options):
                values[path] = UnknownValue(how or "unknown in one of the branches")
                continue
            merged = options[-1]
            for (cond, _), option in zip(reversed(arms), reversed(options[:-1])):
                merged = MuxValue(cond, option, merged)
            values[path] = merged

    @staticmethod
    def forget_writes(node, values: dict, how: str) -> None:
        def visit(obj):
            if isinstance(obj, ast.AssignmentExpression) and not obj.isNonBlocking:
                sym = obj.left.getSymbolReference()
                if sym is not None:
                    values[sym.hierarchicalPath] = UnknownValue(how)
            elif isinstance(obj, ast.UnaryExpression) and "crement" in obj.op.name:
                sym = obj.operand.getSymbolReference()
                if sym is not None:
                    values[sym.hierarchicalPath] = UnknownValue(how)
            return True
        node.visit(visit)

    def unsupported_inside(self, stmt, what: str) -> None:
        def visit(obj):
            if isinstance(obj, ast.ImmediateAssertionStatement):
                self.found.append(_Found(obj, [], {}, f"immediate assertion inside {what} is not supported yet",
                                         suffix=self.suffix))
            return True
        stmt.visit(visit)


def _int(value) -> Optional[int]:
    """A slang constant as an int (None if not a known integer)."""
    v = getattr(value, "value", None)
    return int(v) if isinstance(v, SVInt) and not v.hasUnknown else None


def _truth(rng: Optional[tuple[int, int]]) -> Optional[bool]:
    """Truth of a value in this range: True / False / None (either)."""
    if rng is None or rng[0] <= 0 <= rng[1] and rng != (0, 0):
        return None
    return rng != (0, 0)


def _jumps(body) -> bool:
    """break / continue / return in a loop body (not followed yet)."""
    found = []
    def visit(obj):
        if isinstance(obj, (ast.BreakStatement, ast.ContinueStatement, ast.ReturnStatement)):
            found.append(obj)
        return True
    body.visit(visit)
    return bool(found)


def _same_clock(a: Clock, b: Clock) -> bool:
    return a.edge == b.edge and a.expr.isEquivalentTo(b.expr)


def _is_procedural_local(sym) -> bool:
    return isinstance(sym.parentScope, (ast.StatementBlockSymbol, ast.SubroutineSymbol))


def _const(var, value: int) -> ConstValue:
    return ConstValue(value, var.type.bitWidth, var.type.isSigned)


def _whole_variable(expr):
    """The variable an expression names as a whole (no select), else None."""
    while isinstance(expr, ast.ConversionExpression):
        expr = expr.operand
    if isinstance(expr, (ast.NamedValueExpression, ast.HierarchicalValueExpression)):
        return expr.symbol
    return None


def _is_local(path: str, sub) -> bool:
    return path.startswith(sub.hierarchicalPath + ".")


# ── AssertionExpr -> IR ───────────────────────────────────────

_SEQ_BINARY = {
    ast.BinaryAssertionOperator.And: SeqOp.AND,
    ast.BinaryAssertionOperator.Or: SeqOp.OR,
    ast.BinaryAssertionOperator.Intersect: SeqOp.INTERSECT,
    ast.BinaryAssertionOperator.Within: SeqOp.WITHIN,
}

_PROP_BINARY = {
    ast.BinaryAssertionOperator.And: PropOp.AND,
    ast.BinaryAssertionOperator.Or: PropOp.OR,
    ast.BinaryAssertionOperator.Iff: PropOp.IFF,
    ast.BinaryAssertionOperator.Implies: PropOp.IMPLIES,
    ast.BinaryAssertionOperator.Until: PropOp.UNTIL,
    ast.BinaryAssertionOperator.SUntil: PropOp.S_UNTIL,
    ast.BinaryAssertionOperator.UntilWith: PropOp.UNTIL_WITH,
    ast.BinaryAssertionOperator.SUntilWith: PropOp.S_UNTIL_WITH,
}

_TEMPORAL = {
    ast.UnaryAssertionOperator.NextTime: TemporalOp.NEXTTIME,
    ast.UnaryAssertionOperator.SNextTime: TemporalOp.S_NEXTTIME,
    ast.UnaryAssertionOperator.Always: TemporalOp.ALWAYS,
    ast.UnaryAssertionOperator.SAlways: TemporalOp.S_ALWAYS,
    ast.UnaryAssertionOperator.Eventually: TemporalOp.EVENTUALLY,
    ast.UnaryAssertionOperator.SEventually: TemporalOp.S_EVENTUALLY,
}

_REPEAT = {
    ast.SequenceRepetition.Kind.Consecutive: RepeatKind.CONSECUTIVE,
    ast.SequenceRepetition.Kind.Nonconsecutive: RepeatKind.NONCONSECUTIVE,
    ast.SequenceRepetition.Kind.GoTo: RepeatKind.GOTO,
}

_K = ast.AssertionExprKind


class _Converter:
    """Total conversion of one assertion's AssertionExpr tree to the IR."""

    def __init__(self, walker: _Walker):
        self.walker = walker
        self.problems: list[Unsupported] = []
        self.expressions: list = []      # boolean leaves, for signal resolution
        self.local_vars: list[str] = []
        self.clock: Optional[Clock] = None
        self.other_clocks: list[Clock] = []      # clocks switched to (PropClocked, SeqSwitch)

    def unsupported(self, reason: str, node) -> Unsupported:
        u = Unsupported(reason, self.where(node))
        self.problems.append(u)
        return u

    def where(self, node) -> Optional[Location]:
        rng = getattr(node, "sourceRange", None)
        if rng is None:
            syn = getattr(node, "syntax", None)
            rng = getattr(syn, "sourceRange", None) if syn is not None else None
        return self.walker.location(rng.start) if rng is not None else None

    # Clock / disable at the top of an assertion, through named properties

    def peel(self, e):
        clock, disable = None, None
        while True:
            inst = self.instance(e)
            if inst is not None and inst.symbol.kind == ast.SymbolKind.Property:
                self.note_locals(inst)
                e = inst.body
            elif isinstance(e, ast.ClockingAssertionExpr):
                clock = clock or self.walker.clock_from_timing(e.clocking)
                if clock is None:
                    self.unsupported("clocking event is not a single posedge/negedge/edge", e)
                e = e.expr
            elif isinstance(e, ast.DisableIffAssertionExpr):
                disable = e.condition
                self.expressions.append(e.condition)
                e = e.expr
            else:
                return clock, disable, e

    @staticmethod
    def instance(e):
        """The AssertionInstanceExpression behind a plain named reference."""
        if e.kind == _K.Simple and e.repetition is None \
                and isinstance(e.expr, ast.AssertionInstanceExpression):
            return e.expr
        return None

    def note_locals(self, inst) -> None:
        for var in inst.localVars:
            if var.name not in self.local_vars:
                self.local_vars.append(var.name)

    # Classification

    def is_sequence(self, e) -> bool:
        k = e.kind
        if k == _K.Simple:
            if isinstance(e.expr, ast.AssertionInstanceExpression):
                return e.expr.symbol.kind != ast.SymbolKind.Property
            return True
        if k in (_K.SequenceConcat, _K.SequenceWithMatch, _K.FirstMatch):
            return True
        if k == _K.Binary:
            if e.op in (ast.BinaryAssertionOperator.Intersect, ast.BinaryAssertionOperator.Within,
                        ast.BinaryAssertionOperator.Throughout):
                return True
            if e.op in (ast.BinaryAssertionOperator.And, ast.BinaryAssertionOperator.Or):
                return self.is_sequence(e.left) and self.is_sequence(e.right)
        if k == _K.Clocking:
            return self.is_sequence(e.expr)
        return False

    # Sequences

    def to_seq(self, e) -> Seq:
        k = e.kind
        if k == _K.Simple:
            if isinstance(e.expr, ast.AssertionInstanceExpression):
                self.note_locals(e.expr)
                base = self.to_seq(e.expr.body)
            else:
                self.expressions.append(e.expr)
                base = SeqBool(e.expr)
            return self.repeat(base, e.repetition)
        if k == _K.SequenceConcat:
            elements = list(e.elements)
            last = elements[-1]
            inner = self.walker.clock_from_timing(last.sequence.clocking) \
                if last.sequence.kind == _K.Clocking else None
            if len(elements) == 1 or inner is None or self.clock is None or _same_clock(inner, self.clock):
                return self.concat(elements)
            # a ##1 @(c2) b: the clocking event takes the rest of the sequence
            if (last.delay.min, last.delay.max) not in ((0, 0), (1, 1)):
                return self.unsupported("a clock switch inside a sequence needs ##1 or ##0 before it", e)
            first = self.concat(elements[:-1])
            self.expressions.append(inner.expr)
            self.other_clocks.append(inner)
            outer, self.clock = self.clock, inner
            try:
                return SeqSwitch(first, last.delay.max == 0, inner, self.to_seq(last.sequence.expr))
            finally:
                self.clock = outer
        if k == _K.SequenceWithMatch:
            seq = self.repeat(self.to_seq(e.expr), e.repetition)
            return self.with_match_items(seq, e.matchItems, e)
        if k == _K.FirstMatch:
            return self.with_match_items(SeqFirstMatch(self.to_seq(e.seq)), e.matchItems, e)
        if k == _K.Binary:
            if e.op == ast.BinaryAssertionOperator.Throughout:
                if e.left.kind != _K.Simple or isinstance(e.left.expr, ast.AssertionInstanceExpression):
                    return self.unsupported("left side of 'throughout' must be a boolean expression", e)
                self.expressions.append(e.left.expr)
                return SeqThroughout(e.left.expr, self.to_seq(e.right))
            if e.op in _SEQ_BINARY:
                return SeqBinary(_SEQ_BINARY[e.op], self.to_seq(e.left), self.to_seq(e.right))
        if k == _K.Clocking:
            return self.same_clock(e, self.to_seq)
        return self.unsupported(f"'{self.text(e)}' is not a sequence", e)

    def concat(self, elements) -> SeqConcat:
        return SeqConcat(tuple((Delay(el.delay.min, el.delay.max), self.to_seq(el.sequence)) for el in elements))

    def repeat(self, seq: Seq, repetition) -> Seq:
        if repetition is None:
            return seq
        rng = repetition.range
        return SeqRepeat(seq, _REPEAT[repetition.kind], rng.min, rng.max)

    def with_match_items(self, seq: Seq, items, node) -> Seq:
        assignments = []
        for item in items:
            if isinstance(item, ast.AssignmentExpression) and not item.isCompound:
                target = item.left.getSymbolReference() if hasattr(item.left, "getSymbolReference") else None
                if target is not None and target.kind == ast.SymbolKind.LocalAssertionVar:
                    self.expressions.append(item.right)
                    assignments.append(LocalAssign(target.name, item.right))
                    continue
            if item.kind == ast.ExpressionKind.Call:
                continue    # e.g. $display in a match item: no effect on the verdict
            self.unsupported("only 'local_var = expression' match items are supported", item)
        return SeqMatchItems(seq, tuple(assignments)) if assignments else seq

    # Properties

    def to_prop(self, e) -> Prop:
        if self.is_sequence(e):
            return PropSeq(self.to_seq(e))
        k = e.kind
        if k == _K.Simple:
            inst = self.instance(e)
            if inst is not None:
                self.note_locals(inst)
                return self.to_prop(inst.body)
        if k == _K.Unary:
            if e.op == ast.UnaryAssertionOperator.Not:
                return PropNot(self.to_prop(e.expr))
            rng = e.range
            return PropTemporal(
                _TEMPORAL[e.op], self.to_prop(e.expr),
                rng.min if rng is not None else None,
                rng.max if rng is not None else None,
            )
        if k == _K.Binary:
            op = e.op
            if op in (ast.BinaryAssertionOperator.OverlappedImplication,
                      ast.BinaryAssertionOperator.NonOverlappedImplication):
                overlapped = op == ast.BinaryAssertionOperator.OverlappedImplication
                ante = self.to_seq(e.left)
                # the consequent is on the clock the antecedent ends on
                outer, end = self.clock, ante
                while isinstance(end, SeqSwitch):
                    self.clock, end = end.clock, end.rest
                try:
                    cons = self.consequent(e.right)
                finally:
                    self.clock = outer
                return PropImplication(ante, cons, overlapped, ante_text=self.full_text(e.left))
            if op in (ast.BinaryAssertionOperator.OverlappedFollowedBy,
                      ast.BinaryAssertionOperator.NonOverlappedFollowedBy):
                return PropFollowedBy(self.to_seq(e.left), self.to_prop(e.right),
                                      op == ast.BinaryAssertionOperator.OverlappedFollowedBy)
            if op in _PROP_BINARY:
                return PropBinary(_PROP_BINARY[op], self.to_prop(e.left), self.to_prop(e.right))
        if k == _K.StrongWeak:
            strong = e.strength == ast.StrongWeakAssertionExpr.Strength.Strong
            return PropSeq(self.to_seq(e.expr), strong=strong)
        if k == _K.Abort:
            self.expressions.append(e.condition)
            return PropAbort(e.action == ast.AbortAssertionExpr.Action.Accept, e.isSync,
                             e.condition, self.to_prop(e.expr))
        if k == _K.Conditional:
            self.expressions.append(e.condition)
            otherwise = self.to_prop(e.elseExpr) if e.elseExpr is not None else None
            return PropIf(e.condition, self.to_prop(e.ifExpr), otherwise)
        if k == _K.Case:
            # case (s) a, b: p1; c: p2; default: p3  ==  if (s==a || s==b) p1 else if (s==c) p2 else p3
            self.expressions.append(e.expr)
            prop = self.to_prop(e.defaultCase) if e.defaultCase is not None else None
            for group in reversed(list(e.items)):
                items = tuple(group.expressions)
                self.expressions.extend(items)
                prop = PropIf(CaseCondition(e.expr, items), self.to_prop(group.body), prop)
            if prop is None:
                return self.unsupported("empty 'case' property", e)
            return prop
        if k == _K.Clocking:
            return self.same_clock(e, self.to_prop)
        if k == _K.DisableIff:
            return self.unsupported("'disable iff' is only allowed at the top of an assertion", e)
        return self.unsupported(f"'{self.text(e)}' is not supported", e)

    def consequent(self, e):
        """The consequent of an implication; it may switch to another clock
        (`@(c1) a |-> @(c2) b`)."""
        inner = self.walker.clock_from_timing(e.clocking) if e.kind == _K.Clocking else None
        outer = self.clock
        if inner is None or outer is None or _same_clock(inner, outer):
            return self.to_prop(e)
        self.expressions.append(inner.expr)
        self.other_clocks.append(inner)
        self.clock = inner
        try:
            return PropClocked(inner, self.to_prop(e.expr))
        finally:
            self.clock = outer

    def same_clock(self, e, convert):
        inner = self.walker.clock_from_timing(e.clocking)
        outer = self.clock
        if inner is not None and outer is None:
            self.clock = inner          # leading clock of a clocked sequence/property
            return convert(e.expr)
        if inner is not None and outer is not None and _same_clock(inner, outer):
            return convert(e.expr)
        return self.unsupported("a clock switch is supported only at the start of an implication's "
                                "consequent (@(posedge c1) a |-> @(posedge c2) b) or after ##1/##0 in "
                                "its antecedent (@(posedge c1) a ##1 @(posedge c2) b |-> c)", e)

    @staticmethod
    def text(e) -> str:
        syn = getattr(e, "syntax", None)
        return " ".join(str(syn).split())[:60] if syn is not None else str(e.kind)

    @staticmethod
    def full_text(e) -> str:
        syn = getattr(e, "syntax", None)
        return " ".join(str(syn).split()) if syn is not None else ""


# ── Signal resolution ─────────────────────────────────────────

_NEEDS_SLANG = (" without the yosys-slang plugin (part of the OSS CAD Suite), "
                "which reads hierarchical references")


class _SignalResolver:
    """Map every value an assertion reads to a signal of its target scope.

    Assertions written in a module check that module.  Assertions in a module
    bound into a target (bind) check the target: references such as
    `fifo.din` resolve upwards to the target, and checker ports are followed
    through their bind connections.
    """

    def __init__(self, walker: _Walker, inst, record: AssertionRecord):
        self.walker = walker
        self.inst = inst
        self.record = record

    def resolve(self, expressions, clock: Optional[Clock], disable) -> None:
        exprs = list(expressions)
        if clock is not None:
            exprs.append(clock.expr)
        if disable is not None:
            exprs.append(disable)

        symbols = []
        def collect(obj):
            if isinstance(obj, (ast.NamedValueExpression, ast.HierarchicalValueExpression)):
                symbols.append(obj.symbol)
            return True
        for expr in exprs:
            expr.visit(collect)

        resolved = [through_bind(s) for s in symbols]
        values = [s for s in resolved if self.is_signal(s)]
        if not values:
            self.record.target = self.inst.hierarchicalPath
            return

        own_chain = self.instance_chain(self.inst)
        own = own_chain[0]
        parent = own_chain[1] if len(own_chain) > 1 else ""
        owners = {self.owner_path(s) for s in values}
        # A module bound into a target checks the target: use the parent when
        # the assertion reads any of the parent's signals.
        target = parent if parent and parent in owners else own
        if self.walker.hierarchical:
            # Any signal below the target is reachable; signals elsewhere move
            # the target up to the closest instance enclosing all of them.
            chains = {self.owner_path(s): self.instance_chain(self.owner_instance(s)) for s in values}
            candidates = own_chain[own_chain.index(target):]
            target = next((c for c in candidates if all(c in chain for chain in chains.values())), target)
        self.record.target = target

        for sym in values:
            owner = self.owner_path(sym)
            path = sym.hierarchicalPath
            if owner.startswith(target + "."):
                # a hierarchical reference (yosys-slang), or connected after
                # flattening (read -sv, see pipeline.prepare)
                owner = target
            if owner != target:
                if owner == own:
                    reason = (f"'{sym.name}' is declared inside the bound checker module; "
                              f"only signals of '{target}' can be checked{_NEEDS_SLANG}")
                else:
                    reason = f"'{path}' is outside the checked module '{target}'"
                if all(p.reason != reason for p in self.record.problems):
                    self.record.problems.append(Unsupported(reason, self.record.location))
                continue
            rel = path[len(target) + 1:]
            if sym.type.isUnpackedArray:
                continue        # read element by element (see ExprPrinter, element ports)
            if rel not in self.record.signals:
                t = sym.type
                self.record.signals[rel] = Signal(rel, t.bitWidth, t.isSigned)

    @staticmethod
    def is_signal(sym) -> bool:
        # variables of a begin-end block, loop or task/function are not signals
        return sym.kind in (ast.SymbolKind.Net, ast.SymbolKind.Variable, ast.SymbolKind.Port) \
            and sym.name != DEFAULT_DISABLE_NET and not _is_procedural_local(sym)

    @staticmethod
    def owner_instance(sym):
        scope = sym.parentScope
        body = scope.containingInstance if scope is not None else None
        return body.parentInstance if body is not None else None

    @classmethod
    def owner_path(cls, sym) -> str:
        inst = cls.owner_instance(sym)
        return inst.hierarchicalPath if inst is not None else ""

    @classmethod
    def instance_chain(cls, inst) -> list[str]:
        """Paths of `inst` and every instance enclosing it, innermost first."""
        chain = []
        while inst is not None:
            chain.append(inst.hierarchicalPath)
            inst = cls.owner_instance(inst)
        return chain
