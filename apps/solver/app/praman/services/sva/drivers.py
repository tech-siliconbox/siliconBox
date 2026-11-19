"""
Driver tracing for counterexample debug: which statements drive a signal,
under which branch conditions, and what they read.

Given a signal's hierarchical path (as in the trace), find every
assignment to it: continuous assigns, assignments in always blocks (with
the enclosing if/case conditions), and output ports of sub-instances
(drill down through them).  Values are read from the trace by the caller:
a clocked assignment's value at cycle N comes from what it read at N-1.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from pyslang import ast

from app.praman.services.sva.debug import _as_int
from app.praman.services.sva.frontend import elaborate
from app.praman.services.sva.ports import port_of


def find_drivers_on_trace(files: dict[str, str], top: str, path: str, series: dict[str, list],
                          cycle: int) -> dict:
    """find_drivers with the branch conditions evaluated on a trace: `series`
    maps signal paths to their raw value per cycle; a clocked driver reads
    the values of the cycle before."""
    def lookup(p: str, clocked: bool):
        values = series.get(p)
        at = cycle - 1 if clocked else cycle
        return _as_int(values[at]) if values is not None and 0 <= at < len(values) else None
    return find_drivers(files, top, path, lookup=lookup)


def find_drivers(files: dict[str, str], top: str, path: str, lookup=None) -> dict[str, Any]:
    """lookup(path, clocked) -> int | None: a signal's value where the
    driver is evaluated; with it, each driver gets `active` (its branch
    conditions held: True / False / None if unknown)."""
    design = elaborate(files, top=top)
    root = design.compilation.getRoot()
    target = _find_symbol(root, path)
    if target is None:
        return {"signal": path, "drivers": [], "error": f"'{path}' is not a signal of the design"}

    sm = design.compilation.sourceManager
    drivers: list[dict[str, Any]] = []

    def where(node) -> dict:
        start = node.sourceRange.start if hasattr(node, "sourceRange") else node.location
        loc = sm.getFullyOriginalLoc(start)
        return {"file": sm.getFileName(loc), "line": sm.getLineNumber(loc)}

    def visit(obj):
        if isinstance(obj, ast.ContinuousAssignSymbol):
            assign = obj.assignment
            if isinstance(assign, ast.AssignmentExpression) and _writes(assign, path):
                drivers.append({**where(assign), "kind": "continuous assign", "clocked": False,
                                "text": _text(assign), "conditions": [], "reads": _reads(assign.right)})
            return False
        if isinstance(obj, ast.ProceduralBlockSymbol):
            timing, clocked = _timing(obj)
            for assign, conds in _assignments(obj.body, []):
                if _writes(assign, path):
                    reads = _reads(assign.right)
                    for c in conds:
                        reads += [r for r in _reads(c) if r not in reads]
                    active = None
                    if lookup is not None:
                        evaluate = lookup
                        active = _all_hold(conds, lambda p, c=clocked: evaluate(p, c))
                    drivers.append({**where(assign),
                                    "kind": f"always {timing}".strip() if timing else "always",
                                    "clocked": clocked, "text": _text(assign),
                                    "conditions": [_text(c) for c in conds], "reads": reads,
                                    "active": active})
            return False
        if isinstance(obj, ast.InstanceSymbol):
            for conn in obj.portConnections:
                port, expr = conn.port, conn.expression
                if expr is None or getattr(port, "direction", None) != ast.ArgumentDirection.Out:
                    continue
                if _refers_to(expr, path):
                    inner = getattr(port, "internalSymbol", None)
                    drivers.append({**where(obj), "kind": f"output port '{port.name}' of instance "
                                    f"{obj.name} ({obj.definition.name})", "clocked": False,
                                    "text": f"{obj.name}.{port.name}", "conditions": [],
                                    "reads": [inner.hierarchicalPath] if inner is not None else []})
        return True
    root.visit(visit)

    # An input port of a sub-module is driven by its connection in the parent
    port_driver = _input_port_driver(target)
    if port_driver is not None:
        drivers.append(port_driver(where))
    for d in drivers:
        d.setdefault("active", True if not d["conditions"] and lookup is not None else d.get("active"))
    # the drivers that fired first
    drivers.sort(key=lambda d: {True: 0, None: 1, False: 2}[d["active"]])
    return {"signal": path, "drivers": drivers}


def _all_hold(conds, lookup) -> Optional[bool]:
    result: Optional[bool] = True
    for c in conds:
        v = _truth(c, lookup)
        if v is False:
            return False
        if v is None:
            result = None
    return result


def _truth(cond, lookup) -> Optional[bool]:
    if isinstance(cond, _Not):
        v = _truth(cond.inner, lookup)
        return None if v is None else not v
    if isinstance(cond, _Note):
        return None
    if isinstance(cond, _CaseItem):
        subject = _eval(cond.subject, lookup)
        items = [_eval(i, lookup) for i in cond.items]
        if subject is None or None in items:
            return None
        return subject in items
    v = _eval(cond, lookup)
    return None if v is None else v != 0


_BIN = {
    ast.BinaryOperator.Add: lambda a, b: a + b, ast.BinaryOperator.Subtract: lambda a, b: a - b,
    ast.BinaryOperator.BinaryAnd: lambda a, b: a & b, ast.BinaryOperator.BinaryOr: lambda a, b: a | b,
    ast.BinaryOperator.BinaryXor: lambda a, b: a ^ b,
    ast.BinaryOperator.Equality: lambda a, b: int(a == b), ast.BinaryOperator.Inequality: lambda a, b: int(a != b),
    ast.BinaryOperator.CaseEquality: lambda a, b: int(a == b), ast.BinaryOperator.CaseInequality: lambda a, b: int(a != b),
    ast.BinaryOperator.GreaterThan: lambda a, b: int(a > b), ast.BinaryOperator.GreaterThanEqual: lambda a, b: int(a >= b),
    ast.BinaryOperator.LessThan: lambda a, b: int(a < b), ast.BinaryOperator.LessThanEqual: lambda a, b: int(a <= b),
    ast.BinaryOperator.LogicalAnd: lambda a, b: int(bool(a) and bool(b)),
    ast.BinaryOperator.LogicalOr: lambda a, b: int(bool(a) or bool(b)),
    ast.BinaryOperator.LogicalShiftLeft: lambda a, b: a << b, ast.BinaryOperator.LogicalShiftRight: lambda a, b: a >> b,
}


def _eval(e, lookup) -> Optional[int]:
    """Value of a (simple, unsigned) expression from trace values; None if
    it uses anything else."""
    cv = getattr(e, "constant", None)
    if cv is not None and cv.value is not None:
        try:
            return int(cv.value)
        except (TypeError, ValueError):
            return None
    if isinstance(e, ast.ConversionExpression):
        return _eval(e.operand, lookup)
    if isinstance(e, (ast.NamedValueExpression, ast.HierarchicalValueExpression)):
        sym = e.symbol
        if sym.kind == ast.SymbolKind.Parameter:
            return None
        return lookup(sym.hierarchicalPath)
    width = e.type.bitWidth if getattr(e, "type", None) is not None else 0
    mask = (1 << width) - 1 if width > 0 else -1
    if isinstance(e, ast.UnaryExpression):
        v = _eval(e.operand, lookup)
        if v is None:
            return None
        op = e.op
        if op == ast.UnaryOperator.LogicalNot:
            return int(v == 0)
        if op == ast.UnaryOperator.BitwiseNot:
            return ~v & mask
        if op == ast.UnaryOperator.BitwiseOr:
            return int(v != 0)
        if op == ast.UnaryOperator.BitwiseAnd:
            w = e.operand.type.bitWidth
            return int(v == (1 << w) - 1)
        return None
    if isinstance(e, ast.BinaryExpression):
        a, b = _eval(e.left, lookup), _eval(e.right, lookup)
        fn = _BIN.get(e.op)
        if a is None or b is None or fn is None:
            return None
        return fn(a, b) & mask
    if isinstance(e, ast.ElementSelectExpression):
        v, i = _eval(e.value, lookup), _eval(e.selector, lookup)
        rng = getattr(e.value.type, "fixedRange", None)
        if v is None or i is None or rng is None or e.value.type.isUnpackedArray:
            return None
        return (v >> (i - int(rng.lower))) & 1
    return None


def _find_symbol(root, path: str) -> Optional[Any]:
    found: list = []
    def visit(obj):
        if found:
            return False
        if isinstance(obj, (ast.NetSymbol, ast.VariableSymbol)) and obj.hierarchicalPath == path:
            found.append(obj)
            return False
        return True
    root.visit(visit)
    return found[0] if found else None


def _timing(proc) -> tuple[str, bool]:
    body = proc.body
    if isinstance(body, ast.TimedStatement) and body.timing.syntax is not None:
        text = " ".join(str(body.timing.syntax).split())
        clocked = "posedge" in text or "negedge" in text
        return text, clocked
    kind = proc.procedureKind
    if kind == ast.ProceduralBlockKind.AlwaysFF:
        return "_ff", True
    if kind == ast.ProceduralBlockKind.AlwaysComb:
        return "_comb", False
    return "", False


def _assignments(stmt, conds: list):
    """(assignment, enclosing conditions) in a statement tree."""
    if stmt is None:
        return
    if isinstance(stmt, ast.TimedStatement):
        yield from _assignments(stmt.stmt, conds)
    elif isinstance(stmt, ast.BlockStatement):
        yield from _assignments(stmt.body, conds)
    elif isinstance(stmt, ast.StatementList):
        for s in stmt.list:
            yield from _assignments(s, conds)
    elif isinstance(stmt, ast.ConditionalStatement):
        cs = [c.expr for c in stmt.conditions]
        yield from _assignments(stmt.ifTrue, conds + cs)
        if stmt.ifFalse is not None:
            yield from _assignments(stmt.ifFalse, conds + [_Not(c) for c in cs])
    elif isinstance(stmt, ast.CaseStatement):
        earlier: list = []
        for group in stmt.items:
            item = _CaseItem(stmt.expr, list(group.expressions))
            yield from _assignments(group.stmt, conds + [item])
            earlier.append(item)
        if stmt.defaultCase is not None:
            yield from _assignments(stmt.defaultCase, conds + [_Not(e) for e in earlier])
    elif isinstance(stmt, ast.ExpressionStatement):
        found: list = []
        def visit(obj):
            if isinstance(obj, ast.AssignmentExpression):
                found.append(obj)
                return False
            return True
        stmt.expr.visit(visit)
        for assign in found:
            yield assign, conds
    else:
        # loops and other statements: assignments inside, conditions unknown
        found = []
        def visit_any(obj):
            if isinstance(obj, ast.AssignmentExpression):
                found.append(obj)
                return False
            return True
        stmt.visit(visit_any)
        for assign in found:
            yield assign, conds + [_Note(f"inside a {type(stmt).__name__.replace('Statement', '').lower()}")]


class _Not:
    def __init__(self, inner):
        self.inner = inner


class _CaseItem:
    def __init__(self, subject, items):
        self.subject, self.items = subject, items


class _Note:
    def __init__(self, text):
        self.text = text


def _text(node) -> str:
    if isinstance(node, _Not):
        inner = _text(node.inner)
        plain = re.fullmatch(r"!\(?([\w.]+)\)?", inner)
        return plain.group(1) if plain else f"!({inner})"
    if isinstance(node, _CaseItem):
        return f"{_text(node.subject)} == " + " / ".join(_text(i) for i in node.items)
    if isinstance(node, _Note):
        return node.text
    while isinstance(node, ast.ConversionExpression) and node.syntax is None:
        node = node.operand
    syn = getattr(node, "syntax", None)
    return " ".join(str(syn).split()) if syn is not None else "?"


def _reads(node) -> list[str]:
    if isinstance(node, _Not):
        return _reads(node.inner)
    if isinstance(node, _CaseItem):
        out = _reads(node.subject)
        for i in node.items:
            out += [r for r in _reads(i) if r not in out]
        return out
    if isinstance(node, _Note) or node is None:
        return []
    out: list[str] = []
    def visit(obj):
        if isinstance(obj, (ast.NamedValueExpression, ast.HierarchicalValueExpression)):
            sym = obj.symbol
            if sym.kind in (ast.SymbolKind.Net, ast.SymbolKind.Variable) and sym.hierarchicalPath not in out:
                out.append(sym.hierarchicalPath)
        return True
    node.visit(visit)
    return out


def _writes(assign, path: str) -> bool:
    return path in _lvalue_targets(assign.left)


def _lvalue_targets(expr) -> list[str]:
    """Signals written by an assignment target (not those used as indexes)."""
    if isinstance(expr, (ast.NamedValueExpression, ast.HierarchicalValueExpression)):
        return [expr.symbol.hierarchicalPath]
    if isinstance(expr, (ast.ElementSelectExpression, ast.RangeSelectExpression, ast.MemberAccessExpression)):
        return _lvalue_targets(expr.value)
    if isinstance(expr, ast.ConversionExpression):
        return _lvalue_targets(expr.operand)
    if isinstance(expr, ast.ConcatenationExpression):
        return [t for op in expr.operands for t in _lvalue_targets(op)]
    return []


def _refers_to(expr, path: str) -> bool:
    hit = []
    def visit(obj):
        if isinstance(obj, (ast.NamedValueExpression, ast.HierarchicalValueExpression)) \
                and obj.symbol.hierarchicalPath == path:
            hit.append(obj)
            return False
        return not hit
    expr.visit(visit)
    return bool(hit)


def _input_port_driver(sym):
    inst, port = port_of(sym)
    if inst is None or port is None or port.direction != ast.ArgumentDirection.In:
        return None
    conn = inst.getPortConnection(port)
    expr = getattr(conn, "expression", None) if conn is not None else None
    if expr is None:
        return None
    def build(where):
        return {**where(inst), "kind": f"input port '{port.name}' of instance {inst.name}, connected to",
                "clocked": False, "text": _text(expr), "conditions": [], "reads": _reads(expr)}
    return build
