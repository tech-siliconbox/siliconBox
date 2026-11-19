"""
Clock nets of an elaborated design (pyslang).

SymbiYosys's default model steps every flip-flop at every solver step, which
is exact only when the whole design runs on one clock.  With several clock
nets (unrelated input clocks, a divided or gated clock) the check must run in
multiclock mode, where each clock is a signal and flops update on its edges.

A clock net is a signal named in the edge-triggered event control of an
always block (`always @(posedge clk)`, `always_ff @(posedge clk or negedge
rst_n)`; the asynchronous reset in such a list is not a clock), or the clock
of an assertion.  Port connections are followed upwards, so a clock entering
a sub-module through a port counts as its driver in the parent.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

from pyslang import ast

from app.praman.services.sva.ports import connected_symbol, port_of

_EDGES = (ast.EdgeKind.PosEdge, ast.EdgeKind.NegEdge)
_RESET_LIKE = re.compile(r'(^|_)(n_?|[as])?(rst|reset|clr|clear)(n|_|b|$)|^[ahp]reset_?n$', re.IGNORECASE)


@dataclass
class ClockInfo:
    nets: list[str] = field(default_factory=list)          # hierarchical paths of distinct clock nets
    top_inputs: list[str] = field(default_factory=list)    # those that are inputs of the top module

    @property
    def multiclock(self) -> bool:
        return len(self.nets) > 1


def design_clocks(instances: dict[str, Any], top: str, records=(), reset_port: str = "") -> ClockInfo:
    nets: dict[str, Any] = {}
    under_top = [inst for path, inst in instances.items() if path == top or path.startswith(top + ".")]

    for inst in under_top:
        def visit(obj):
            if isinstance(obj, ast.InstanceSymbol):
                return obj is inst or obj.hierarchicalPath == inst.hierarchicalPath
            if isinstance(obj, ast.ProceduralBlockSymbol):
                for sym in _clock_symbols(obj, top, reset_port):
                    nets.setdefault(sym.hierarchicalPath, sym)
                return False
            return True
        inst.body.visit(visit)

    for record in records:
        for clock in (getattr(record, "clock", None), *getattr(record, "clocks", ())):
            expr = getattr(clock, "expr", None) if clock is not None else None
            sym = _driver(expr.getSymbolReference()) if expr is not None else None
            if sym is not None and (sym.hierarchicalPath == top or sym.hierarchicalPath.startswith(top + ".")):
                nets.setdefault(sym.hierarchicalPath, sym)

    info = ClockInfo(nets=sorted(nets))
    for path, sym in sorted(nets.items()):
        if path.rsplit(".", 1)[0] == top and _is_input(sym):
            info.top_inputs.append(sym.name)
    return info


def _clock_symbols(proc, top: str, reset_port: str) -> list[Any]:
    body = proc.body
    if not isinstance(body, ast.TimedStatement):
        return []
    timing = body.timing
    if isinstance(timing, ast.SignalEventControl):
        events = [timing]
    elif isinstance(timing, ast.EventListControl):
        events = [e for e in timing.events if isinstance(e, ast.SignalEventControl)]
    else:
        return []
    found = []
    for event in events:
        if event.edge not in _EDGES:
            continue
        ref = event.expr.getSymbolReference()
        if ref is not None:
            found.append(ref)
    if len(found) > 1:
        # posedge clk or negedge rst_n: the asynchronous reset is the signal
        # the block tests first (if (!rst_n) ...), or one named like a reset
        tested = _leading_if_signals(body.stmt)
        clocks = [s for s in found if s.name not in tested and s.name != reset_port
                  and not _RESET_LIKE.search(s.name)]
        found = clocks or found[:1]
    return [d for d in (_driver(s) for s in found) if d is not None]


def _leading_if_signals(stmt) -> set[str]:
    while isinstance(stmt, (ast.BlockStatement, ast.StatementList)):
        items = list(stmt.list) if isinstance(stmt, ast.StatementList) else [stmt.body]
        if not items:
            return set()
        stmt = items[0]
    if not isinstance(stmt, ast.ConditionalStatement):
        return set()
    names: set[str] = set()
    def visit(obj):
        if isinstance(obj, (ast.NamedValueExpression, ast.HierarchicalValueExpression)):
            names.add(obj.symbol.name)
        return True
    for cond in stmt.conditions:
        cond.expr.visit(visit)
    return names


def _driver(sym) -> Optional[Any]:
    """Follow a module's input port up to the signal connected to it."""
    for _ in range(64):
        inst, port = port_of(sym)
        ref = connected_symbol(inst, port) if inst is not None and port is not None else None
        if ref is None:
            return sym
        sym = ref
    return sym


def _is_input(sym) -> bool:
    _, port = port_of(sym)
    return port is not None and port.direction == ast.ArgumentDirection.In
