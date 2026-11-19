"""
What `analyze` and `elaborate` need from slang beyond the formal pipeline:
syntax errors per file, the instance tree of the design, the ports of the
top module and the instance each assertion statement sits in.

These are module-level functions with picklable arguments and results:
they run in the compile workers (services.compile_worker.run_isolated), as
all slang work does.
"""

from __future__ import annotations

import re
from typing import Any

from pyslang import DiagnosticEngine, TextDiagnosticClient, ast, syntax

from app.praman.services.sva.frontend import elaborate

_DIAG = re.compile(r"^(?P<file>[^\s:]+):(?P<line>\d+):(?P<col>\d+): (?P<sev>error|warning): (?P<msg>.*)$",
                   re.MULTILINE)


def check_syntax(name: str, text: str) -> list[dict]:
    """Parse one source (no elaboration): [{severity, line, column, message}]."""
    tree = syntax.SyntaxTree.fromText(text, name)
    engine = DiagnosticEngine(tree.sourceManager)
    found = []
    for diag in tree.diagnostics:
        client = TextDiagnosticClient()
        engine.addClient(client)
        engine.issue(diag)
        engine.clearClients()
        m = _DIAG.search(client.getString())
        if m:
            found.append({"severity": m["sev"], "line": int(m["line"]), "column": int(m["col"]),
                          "message": m["msg"]})
        elif diag.isError():
            found.append({"severity": "error", "line": 0, "column": 0, "message": client.getString().strip()})
    return found


def design_tree(files: dict[str, str], top: str) -> dict[str, Any]:
    """The elaborated hierarchy below `top`.

    Returns {tree, ports, locations, instances}:
      tree       {path, name, module, kind, file, line, children: [...]}
      ports      [{name, direction, width}] of the top module
      locations  {"file:line": instance path} for every assertion statement
                 (the first instance of a module that is instantiated twice)
      instances  number of instances
    File names and lines are those of `files` (the joined sources).
    """
    design = elaborate(files, top=top)
    root = design.compilation.getRoot()
    sm = design.compilation.sourceManager
    top_inst = next((inst for inst in root.topInstances if inst.name == top), None)
    if top_inst is None:
        return {"tree": None, "ports": [], "locations": {}, "instances": 0}

    def where(loc) -> tuple[str, int]:
        loc = sm.getFullyOriginalLoc(loc)
        return sm.getFileName(loc), sm.getLineNumber(loc)

    nodes: dict[str, dict] = {}
    symbols: dict[str, Any] = {}

    def collect(obj):
        if isinstance(obj, ast.GenerateBlockSymbol) and obj.isUninstantiated:
            return ast.VisitAction.Skip
        if isinstance(obj, ast.InstanceSymbol):
            path = obj.hierarchicalPath
            file, line = where(obj.location)
            nodes[path] = {"path": path, "name": path, "module": obj.definition.name,
                           "kind": str(obj.definition.definitionKind).rsplit(".", 1)[-1].lower(),
                           "file": file, "line": line, "children": []}
            symbols[path] = obj
        return ast.VisitAction.Advance
    top_inst.visit(collect)

    for path, node in nodes.items():
        if path == top:
            continue
        parent = path
        while "." in parent:
            parent = parent.rsplit(".", 1)[0]
            if parent in nodes:
                break
        else:
            parent = top
        if parent in nodes and parent != path:
            node["name"] = path[len(parent) + 1:]
            nodes[parent]["children"].append(node)

    locations: dict[str, str] = {}
    for path, inst in symbols.items():
        def statements(obj, own=path):
            if isinstance(obj, ast.GenerateBlockSymbol) and obj.isUninstantiated:
                return ast.VisitAction.Skip
            if isinstance(obj, ast.InstanceSymbol) and obj.hierarchicalPath != own:
                return ast.VisitAction.Skip
            if isinstance(obj, (ast.ConcurrentAssertionStatement, ast.ImmediateAssertionStatement)):
                file, line = where(obj.sourceRange.start)
                locations.setdefault(f"{file}:{line}", own)
            return ast.VisitAction.Advance
        inst.visit(statements)

    ports = []
    for member in top_inst.body:
        if member.kind == ast.SymbolKind.Port:
            direction = {ast.ArgumentDirection.In: "input", ast.ArgumentDirection.Out: "output"}.get(
                member.direction, "inout")
            try:
                width = int(member.type.bitWidth)
            except Exception:
                width = 1
            ports.append({"name": member.name, "direction": direction, "width": width})

    return {"tree": nodes.get(top), "ports": ports, "locations": locations, "instances": len(nodes)}


def probe_widths(files: dict[str, str], top: str) -> dict[int, int]:
    """{k: width} of the expressions of the `__pm_probe_<k>` nets of the elaborated
    design (split.insert_probes: `wire __pm_probe_<k> = |(<expr>);`).
    Raises FrontendError when it does not elaborate."""
    design = elaborate(files, top=top, hierarchical=True)
    found: dict[int, int] = {}

    def visit(obj):
        if isinstance(obj, ast.NetSymbol) and obj.name.startswith("__pm_probe_"):
            operand = getattr(obj.initializer, "operand", None)
            if operand is not None:
                try:
                    found.setdefault(int(obj.name.rsplit("_", 1)[-1]), int(operand.type.bitWidth))
                except (ValueError, AttributeError):
                    pass
        return True
    design.compilation.getRoot().visit(visit)
    return found


def module_signals(files: dict[str, str], top: str, max_width: int = 64) -> dict[str, dict]:
    """The signals of every module below `top` (for toggle coverage):
    {module: {instances: [paths below the top ("" for the top)], signals:
    [{name, width, line}]}}.  A module used with different parameters keeps
    the narrowest width of each signal, so its covers fit every instance.
    Memories (unpacked arrays) and signals wider than `max_width` are left out."""
    design = elaborate(files, top=top)
    root = design.compilation.getRoot()
    sm = design.compilation.sourceManager
    top_inst = next((inst for inst in root.topInstances if inst.name == top), None)
    out: dict[str, dict] = {}
    if top_inst is None:
        return out

    def add(inst, path: str) -> None:
        module = inst.definition.name
        entry = out.setdefault(module, {"instances": [], "signals": {}})
        entry["instances"].append(path)
        for member in inst.body:
            if member.kind not in (ast.SymbolKind.Port, ast.SymbolKind.Variable, ast.SymbolKind.Net):
                continue
            if member.name.startswith("__") or not member.name:
                continue
            try:
                if member.type.isUnpackedArray:
                    continue
                width = int(member.type.bitWidth)
            except Exception:
                continue
            if width < 1 or width > max_width:
                continue
            line = sm.getLineNumber(sm.getFullyOriginalLoc(member.location))
            known = entry["signals"].get(member.name)
            if known is None or width < known["width"]:
                entry["signals"][member.name] = {"name": member.name, "width": width,
                                                 "line": known["line"] if known else line}

    def visit(obj):
        if isinstance(obj, ast.GenerateBlockSymbol) and obj.isUninstantiated:
            return ast.VisitAction.Skip
        if isinstance(obj, ast.InstanceSymbol):
            path = obj.hierarchicalPath
            add(obj, "" if path == top else path[len(top) + 1:])
        return ast.VisitAction.Advance
    top_inst.visit(visit)
    return {m: {"instances": e["instances"], "signals": list(e["signals"].values())} for m, e in out.items()}
