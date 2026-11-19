"""
Connectivity, as JasperGold's CONN app: a spreadsheet of connections
becomes assertions.

    name, source, destination, condition, latency
    c_irq, u_ctrl.irq_out, u_cpu.irq_in, , 0
    c_data, u_dma.wdata, u_mem.din, u_dma.wvalid, 2

Signals are paths from the top module (the top's own name in front is
allowed).  A row says: whenever the condition holds (always, if empty), the
destination equals the source - in the same cycle (latency 0), or `latency`
cycles later, the value the source had then:

    latency 0:  condition |-> destination == source
    latency N:  condition |-> ##N destination == $past(source, N)

The header row is optional (columns in this order then, and a row of just two
cells is source, destination); a row starting with # is a comment; name may
be empty (conn_<n>).  CSV or tab-separated.
"""

from __future__ import annotations

import csv
import io
import re

PREFIX = "conn_"
SIGNAL = re.compile(r"^[A-Za-z_][\w$]*(\.[A-Za-z_][\w$]*|\[\d+(:\d+)?\])*$")
COLUMNS = ("name", "source", "destination", "condition", "latency")
ALIASES = {"src": "source", "from": "source", "dst": "destination", "dest": "destination", "to": "destination",
           "cond": "condition", "enable": "condition", "delay": "latency", "cycles": "latency"}


class ConnError(Exception):
    """The spreadsheet cannot be read."""


def _cells(text: str) -> list[tuple[int, list[str]]]:
    dialect = "excel-tab" if "\t" in text.split("\n", 1)[0] else "excel"
    out = []
    for number, row in enumerate(csv.reader(io.StringIO(text), dialect=dialect), start=1):
        cells = [c.strip() for c in row]
        if not any(cells) or cells[0].startswith("#"):
            continue
        out.append((number, cells))
    return out


def parse(text: str, top: str) -> list[dict]:
    """[{name, expr, line, what}] for the rows of the spreadsheet."""
    rows = _cells(text)
    if not rows:
        raise ConnError("it has no connections")
    columns = list(COLUMNS)
    first = [ALIASES.get(c.lower(), c.lower()) for c in rows[0][1]]
    if "source" in first and "destination" in first:
        columns = first
        rows = rows[1:]
    headed = columns != list(COLUMNS)
    out = []
    for number, cells in rows:
        # without a header, a row of two cells is "source, destination"
        names = ["source", "destination"] if not headed and len([c for c in cells if c]) == 2 and len(cells) == 2 else columns
        row = dict(zip(names, cells + [""] * (len(names) - len(cells))))
        source = row.get("source", "").removeprefix(f"{top}.")
        destination = row.get("destination", "").removeprefix(f"{top}.")
        if not source or not destination:
            raise ConnError(f"line {number}: give a source and a destination")
        for signal in (source, destination):
            if not SIGNAL.match(signal):
                raise ConnError(f'line {number}: "{signal}" is not a signal path')
        latency_text = row.get("latency", "") or "0"
        if not latency_text.isdigit() or int(latency_text) > 1000:
            raise ConnError(f'line {number}: the latency "{latency_text}" is not a number of cycles')
        latency = int(latency_text)
        condition = " ".join(row.get("condition", "").split())
        if ";" in condition or condition.count("(") != condition.count(")"):
            raise ConnError(f'line {number}: the condition "{condition}" is not one expression')
        check = f"{destination} == {source}" if latency == 0 else f"##{latency} {destination} == $past({source}, {latency})"
        expr = f"({condition}) |-> {check}" if condition else (check if latency == 0 else f"1'b1 |-> {check}")
        what = f"{source} -> {destination}" + (f" when {condition}" if condition else "") + (f" after {latency}" if latency else "")
        out.append({"name": row.get("name", ""), "expr": expr, "line": number, "what": what})
    return out


def unique_name(name: str, taken: set[str]) -> str:
    """A label for a connection: its name if usable, else conn_<n>."""
    clean = re.sub(r"\W", "_", name.strip())
    if clean and re.match(r"^[A-Za-z_]", clean) and clean not in taken:
        return clean
    n = 1
    while f"{PREFIX}{n}" in taken:
        n += 1
    return f"{PREFIX}{n}"
