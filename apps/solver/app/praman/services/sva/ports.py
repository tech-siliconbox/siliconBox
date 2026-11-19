"""
Module ports seen from inside an instance (pyslang): which port a symbol is,
what it is connected to, and the bind rule: a port of a checker attached
with `bind` stands for the signal of the bound module connected to it.
"""

from __future__ import annotations

from typing import Any, Optional

from pyslang import ast, syntax


def port_of(sym):
    """(instance, port) when `sym` is the internal side of a module port."""
    scope = sym.parentScope
    body = scope.containingInstance if scope is not None else None
    inst = body.parentInstance if body is not None else None
    if body is None or inst is None:
        return None, None
    port = next((p for p in body.portList if p.name == sym.name), None)
    return inst, port


def connected_symbol(inst, port) -> Optional[Any]:
    """The signal a port of `inst` is connected to (None for an expression)."""
    conn = inst.getPortConnection(port)
    expr = getattr(conn, "expression", None) if conn is not None else None
    while isinstance(expr, ast.ConversionExpression):
        expr = expr.operand
    return expr.getSymbolReference() if expr is not None else None


def is_bound(inst) -> bool:
    """An instance created by a bind directive."""
    syn = inst.syntax
    owner = syn.parent.parent if syn is not None and syn.parent is not None else None
    return owner is not None and owner.kind == syntax.SyntaxKind.BindDirective


def through_bind(sym):
    """A port of a bound checker -> the bound module's signal connected to it
    (an expression connection, or any other symbol, is returned unchanged)."""
    inst, port = port_of(sym)
    if inst is None or port is None or not is_bound(inst):
        return sym
    return connected_symbol(inst, port) or sym
