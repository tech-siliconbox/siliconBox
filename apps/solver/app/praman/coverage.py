"""
Formal coverage of the design's branches, as JasperGold's COV/UNR apps
measure it: can every branch of the design's procedural code be reached?

Every branch inside an always block gets a cover of its own, in the text a
proof reads (the user's files are never changed):

    if (c) S1 else S2        ->  if (c) begin __pm_cov_1: cover (1'b1); S1 end
                                 else begin __pm_cov_2: cover (1'b1); S2 end
    if (c) S1                ->  ... S1 end else begin __pm_cov_3: cover (1'b1); end
    case (s) 0: S; ...       ->  0: begin __pm_cov_4: cover (1'b1); S end ...
                                 default: begin __pm_cov_5: cover (1'b1); end   (when it has none)

An `else if` is covered through the branches of its inner if.  Every
insertion is on a line that is already there, so no line number moves.

A branch that is covered can happen (it comes with a trace).  One proven
unreachable is dead code - or a sign that the assumptions rule out
behaviour the design has, which a proof then never checks.

Statements are counted per branch: a statement is reached when the branch
it is in is (one outside every branch runs on each clock).  Toggles: each
bit of a module's signals gets a cover of its rise and of its fall, on the
module's clock, inserted on the endmodule line:

    always @(posedge clk) begin __pm_tgl_7: cover ($rose(q[2])); ... end
"""

from __future__ import annotations

import re

from pyslang import syntax

PREFIX = "__pm_cov_"
TOGGLE_PREFIX = "__pm_tgl_"
MAX_TOGGLE_BITS = 1024           # bits of a design measured for toggles (each gets two covers)
STATEMENTS = {"ExpressionStatement", "ProceduralAssignStatement", "ProceduralForceStatement",
              "VoidCastedCallStatement"}
ALWAYS = {"AlwaysBlock", "AlwaysFFBlock", "AlwaysCombBlock", "AlwaysLatchBlock"}
SKIP = {"FunctionDeclaration", "TaskDeclaration", "InitialBlock", "FinalBlock"}


def _kind(node) -> str:
    return str(node.kind).rsplit(".", 1)[-1]


def _span(node) -> tuple[int, int]:
    r = node.sourceRange
    return r.start.offset, r.end.offset


def branches(text: str, name: str = "design.sv") -> tuple[str, list[dict]]:
    """(text with a cover in every branch, [{label, line, kind, what, module, statements}]):
    line is 1-based in `text`; kind: then, else, implicit else, case item, default, no case item."""
    out, items, _, _ = instrument(text, name)
    return out, items


def instrument(text: str, name: str = "design.sv", signals: dict[str, list[dict]] | None = None,
               max_toggle_bits: int = MAX_TOGGLE_BITS, clocks_given: dict[str, str] | None = None
               ) -> tuple[str, list[dict], list[dict], dict]:
    """Covers for branches and (with `signals`: module -> [{name, width, line}])
    toggles.  -> (text, branch items, toggle items, info), info: {unconditional:
    {module: statements outside every branch}, clocks: {module: clock},
    toggle_bits_left_out: n}.  Toggle items: {label, line, kind (rise | fall),
    what, module, signal, bit}."""
    tree = syntax.SyntaxTree.fromText(text, name)
    edits: list[tuple[int, int, str]] = []          # (offset, order, inserted text)
    found: list[dict] = []
    owners: dict[tuple[int, int], str] = {}         # a wrapped clause -> the label of its branch
    unconditional: dict[str, int] = {}
    module_spans: dict[str, tuple[int, int]] = {}

    def line_of(offset: int) -> int:
        return text.count("\n", 0, offset) + 1

    def cover(kind: str, at: int, what: str, module: str) -> str:
        label = f"{PREFIX}{len(found) + 1}"
        found.append({"label": label, "line": line_of(at), "kind": kind, "what": " ".join(what.split())[:120],
                      "module": module, "statements": 0})
        return f"{label}: cover (1'b1);"

    def wrap(statement, kind: str, what: str, module: str) -> None:
        start, end = _span(statement)
        edits.append((start, 1, f"begin {cover(kind, start, what, module)} "))
        edits.append((end, 0, " end"))
        owners[(start, end)] = found[-1]["label"]

    by_label = {}

    def visit(node, inside: bool, module: str, owner: str) -> None:
        kind = _kind(node)
        if kind in SKIP:
            return
        if kind == "ModuleDeclaration":
            module = node.header.name.valueText
            module_spans[module] = _span(node)
        inside = inside or kind in ALWAYS
        owner = owners.get(_span(node), owner) if inside else owner
        if inside and kind in STATEMENTS:
            if owner:
                by_label[owner]["statements"] += 1
            else:
                unconditional[module] = unconditional.get(module, 0) + 1
        if inside and kind == "ConditionalStatement":
            start, end = _span(node)
            condition = text[slice(*_span(node.predicate))]
            wrap(node.statement, "then", f"if ({condition})", module)
            by_label[found[-1]["label"]] = found[-1]
            if node.elseClause is None:
                edits.append((end, 2, f" else begin {cover('implicit else', start, f'not ({condition})', module)} end"))
                by_label[found[-1]["label"]] = found[-1]
            elif _kind(node.elseClause.clause) != "ConditionalStatement":
                wrap(node.elseClause.clause, "else", f"else of if ({condition})", module)
                by_label[found[-1]["label"]] = found[-1]
        elif inside and kind == "CaseStatement":
            start, end = _span(node)
            selector = text[slice(*_span(node.expr))] if getattr(node, "expr", None) is not None else ""
            has_default = False
            for item in node.items:
                item_kind = _kind(item)
                if item_kind == "DefaultCaseItem":
                    has_default = True
                    wrap(item.clause, "default", f"case ({selector}) default", module)
                elif item_kind == "StandardCaseItem":
                    labels = text[_span(item)[0]:_span(item.clause)[0]].rstrip().rstrip(":")
                    wrap(item.clause, "case item", f"case ({selector}) {labels}", module)
                else:
                    continue
                by_label[found[-1]["label"]] = found[-1]
            if not has_default:
                endcase = text.rfind("endcase", start, end)
                if endcase >= 0:
                    edits.append((endcase, 3, f"default: begin "
                                              f"{cover('no case item', start, f'case ({selector}): no item matches', module)} end "))
                    by_label[found[-1]["label"]] = found[-1]
        for child in node:
            if isinstance(child, syntax.SyntaxNode):
                visit(child, inside, module, owner)

    visit(tree.root, False, "", "")

    toggles: list[dict] = []
    clocks: dict[str, str] = {}
    left_out = 0
    budget = max_toggle_bits
    for module, wanted in (signals or {}).items():
        span = module_spans.get(module)
        if span is None:
            continue
        body = text[span[0]:span[1]]
        m = re.search(r"@\s*\(\s*posedge\s+([A-Za-z_]\w*)", body)
        clock = m.group(1) if m else (clocks_given or {}).get(module, "")
        if not clock:                                # no clock of its own: its toggles are not measured
            left_out += sum(s["width"] for s in wanted)
            continue
        clocks[module] = clock
        statements = []
        for sig in wanted:
            if sig["name"] == clock or re.search(r"rst|reset", sig["name"], re.I):
                continue
            for bit in range(sig["width"]):
                if budget <= 0:
                    left_out += 1
                    continue
                budget -= 1
                ref = f"{sig['name']}[{bit}]" if sig["width"] > 1 else sig["name"]
                for edge, fn in (("rise", "$rose"), ("fall", "$fell")):
                    label = f"{TOGGLE_PREFIX}{len(toggles) + 1}"
                    toggles.append({"label": label, "line": sig["line"], "kind": edge, "what": f"{ref} {edge}s",
                                    "module": module, "signal": sig["name"], "bit": bit})
                    statements.append(f"{label}: cover ({fn}({ref}));")
        endmodule = text.rfind("endmodule", span[0], span[1])
        if statements and endmodule >= 0:
            # immediate covers in a clocked block: like the branch covers, off while the reset is held
            edits.append((endmodule, 4, f"always @(posedge {clock}) begin {' '.join(statements)} end "))

    out = text
    for offset, _, insert in sorted(edits, key=lambda e: (e[0], e[1]), reverse=True):
        out = out[:offset] + insert + out[offset:]
    return out, found, toggles, {"unconditional": unconditional, "clocks": clocks, "toggle_bits_left_out": left_out}


def reset_branch(item: dict, reset: str, active_low: bool) -> bool:
    """Is this the branch a reset takes (if (!rst_n) ...)?  Checks are off while
    the reset is held, so such a branch is never covered - it is taken in reset,
    not dead.  The design's reset, or a port named like a reset in a submodule."""
    if item["kind"] != "then":
        return False
    condition = re.sub(r"\s+", "", item["what"][len("if ("):-1]) if item["what"].startswith("if (") else ""
    names = {reset} if reset else set()
    m = re.fullmatch(r"\(*(?:[!~]\(*(\w+)\)*|(\w+)==1'b0|(\w+)==0)\)*", condition)
    if m:                                               # active low: !rst_n, rst_n == 0
        name = next(g for g in m.groups() if g)
        return (name in names and active_low) or bool(re.search(r"rst|reset", name, re.I)) and name.endswith(("n", "N", "_b", "_l"))
    m = re.fullmatch(r"\(*(\w+)(?:==1'b1|==1)?\)*", condition)
    if m:                                               # active high: rst, rst == 1
        name = m.group(1)
        return (name in names and not active_low) or bool(re.fullmatch(r"\w*(rst|reset)\w*", name, re.I)) and not name.endswith(("n", "N", "_b", "_l"))
    return False
