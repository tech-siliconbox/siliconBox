"""
Properties written in Tcl, as in JasperGold:

    assert -name <name> {<expr>}      assume -name <name> {<expr>}      cover -name <name> {<expr>}

The expression is SVA written in the scope of the top module (its signals,
and signals below it by path: u_core.state).  Each becomes a statement in
the top module, clocked by the declared clock and disabled during the
declared reset:

    <name> : assume property (@(posedge clk) disable iff (!rst_n) <expr>);

The statements go on the line of the top module's `endmodule`, so every line
of the user's files stays where it was (messages still point at the right
lines).  The user's files are never changed: this is the text a proof reads.
"""

from __future__ import annotations

import re
from typing import Optional

from app.praman.split import _mask

KINDS = ("assert", "assume", "cover")
NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")
SOURCE = "Tcl"                       # the Source column of a property written in Tcl


class TclPropertyError(Exception):
    """The property cannot be added as asked."""


def check_expression(expr: str) -> str:
    """`expr` on one line, if it is one expression (no statement, balanced parentheses)."""
    flat = " ".join(expr.split())
    masked = _mask(flat)
    if not flat:
        raise TclPropertyError("the expression is empty")
    if ";" in masked or masked.count("(") != masked.count(")") or masked.count("[") != masked.count("]"):
        raise TclPropertyError(f'"{flat}" is not one expression')
    return flat


def statement(name: str, kind: str, expr: str, clock: Optional[str], reset: Optional[tuple[str, bool]]) -> str:
    """The SVA statement of a property written in Tcl (see the module doc)."""
    clocking = f"@(posedge {clock}) " if clock else ""
    signal, active_low = reset if reset else ("", False)
    disable = f"disable iff ({'!' if active_low else ''}{signal}) " if signal and clocking else ""
    return f"{name} : {kind} property ({clocking}{disable}{expr});"


def _endmodule(text: str, top: str) -> Optional[int]:
    """Where the `endmodule` of module `top` starts in `text` (None if `top` is not defined there)."""
    masked = _mask(text)
    start = re.search(rf"\bmodule\s+(?:(?:automatic|static)\s+)?{re.escape(top)}\b", masked)
    if start is None:
        return None
    end = re.compile(r"\bendmodule\b").search(masked, start.end())
    return end.start() if end else None


def insert(design: str, sva: str, top: str, statements: list[str]) -> tuple[str, str]:
    """(design, sva) with `statements` inside the top module (on its endmodule line)."""
    if not statements:
        return design, sva
    text = " ".join(statements) + " "
    for which, source in (("design", design), ("sva", sva)):
        at = _endmodule(source, top)
        if at is not None:
            changed = source[:at] + text + source[at:]
            return (changed, sva) if which == "design" else (design, changed)
    raise TclPropertyError(f'the top module "{top}" was not found in the sources')


# ── What-if: values pinned on a trace (Visualize) ─────────────

PIN_SIGNAL = re.compile(r"^[A-Za-z_][\w$]*(\.[A-Za-z_][\w$]*|\[\d+\])*$")
PIN_VALUE = {
    "hex": re.compile(r"^[0-9a-fA-F_]+$"), "dec": re.compile(r"^\d+$"),
    "bin": re.compile(r"^[01_]+$"), "signed": re.compile(r"^-?\d+$"),
}
CYCLE = "__pm_cycle"


def pin_statements(clock: str, pins: list[dict]) -> list[str]:
    """Statements holding each pinned signal to its value in its cycle: a
    cycle counter from 0 (the first step of a trace) and an immediate
    assumption per pin, which constrains exactly the step it is in.
    pins: [{signal (a path below the top), cycle, value, width, radix}]."""
    if not clock:
        raise TclPropertyError("a trace can be edited only on a clocked design (declare the clock)")
    out = [f"reg [31:0] {CYCLE} = 32'd0;", f"always @(posedge {clock}) {CYCLE} <= {CYCLE} + 32'd1;"]
    for k, pin in enumerate(pins, start=1):
        signal, radix = str(pin["signal"]), str(pin.get("radix") or "hex")
        value = str(pin["value"]).strip().replace("_", "")
        width, cycle = int(pin.get("width") or 1), int(pin["cycle"])
        if not PIN_SIGNAL.match(signal):
            raise TclPropertyError(f'"{signal}" is not a signal name')
        if radix not in PIN_VALUE or not PIN_VALUE[radix].match(value):
            raise TclPropertyError(f'"{value}" is not a {radix} value')
        if not 0 <= cycle < 100000 or not 1 <= width <= 4096:
            raise TclPropertyError("the cycle or the width is out of range")
        if radix == "signed":
            check = f"$signed({signal}) == {value}"
        else:
            base = {"hex": "h", "dec": "d", "bin": "b"}[radix]
            check = f"{signal} == {width}'{base}{value}"
        out.append(f"always @* if ({CYCLE} == 32'd{cycle}) __pm_pin{k}: assume ({check});")
    return out



def differ_statements(inputs: dict[str, list[str]], widths: dict[str, int], until: int) -> list[str]:
    """Statements asking for a trace whose inputs differ from the given ones
    (inputs: name -> its value in each cycle, as binary) in some cycle up to
    `until` (the cycle the given trace fails in).  Needs pin_statements' cycle
    counter.  A trace that fails before `until` differs already."""
    rows = []
    for cycle in range(until + 1):
        terms = [f"{name} == {widths[name]}'b{values[min(cycle, len(values) - 1)]}"
                 for name, values in sorted(inputs.items()) if values and re.fullmatch(r"[01]+", values[min(cycle, len(values) - 1)])]
        same = " && ".join(terms) or "1'b1"
        rows.append(f"({CYCLE} == 32'd{cycle}) ? ({same}) :")
    now = " ".join(rows) + " 1'b1"
    return [
        f"wire __pm_now = {now};",
        "reg __pm_same = 1'b1;",
        f"always @(posedge {{clock}}) __pm_same <= __pm_same && __pm_now;",
        f"always @* if ({CYCLE} == 32'd{until}) __pm_other: assume (!(__pm_same && __pm_now));",
    ]
