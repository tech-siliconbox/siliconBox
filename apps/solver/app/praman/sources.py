"""
Sorting the analyzed files into design files and SVA files.

A Praman script, like a JasperGold one, just says `analyze -sv <file>`; the
formal pipeline (services.sva.pipeline) wants to know which files hold the
design and which hold the checkers bound into it.  A file is an SVA file if
it contains a `bind`, defines a module some `bind` instantiates, or holds
only assertion modules nothing instantiates (an unbound checker).
"""

from __future__ import annotations

import re

_COMMENTS = re.compile(r"//[^\n]*|/\*.*?\*/", re.DOTALL)
_BIND = re.compile(r"(?m)^\s*bind\s+[\w.$\[\]:]+\s+(\w+)")
_MODULE = re.compile(r"(?m)^\s*(?:module|interface|checker)\s+(?:automatic\s+|static\s+)?(\w+)")
_PROPERTY = re.compile(r"\b(?:assert|assume|cover|restrict)\s+(?:property|sequence)\b")
_KEYWORDS = {"module", "interface", "checker", "bind", "program", "package", "endmodule"}


def strip_comments(text: str) -> str:
    return _COMMENTS.sub(lambda m: "\n" * m.group(0).count("\n"), text)


def modules(text: str) -> list[str]:
    return _MODULE.findall(strip_comments(text))


def _instantiated(name: str, texts: list[str]) -> bool:
    """`name u (...)` or `name #(...) u (...)` somewhere (not its own declaration)."""
    pattern = re.compile(rf"(?<![\w.$`])(\w+\s+)?{re.escape(name)}\s*(?:#\s*\(|\s[A-Za-z_]\w*\s*(?:\[[^\]]*\]\s*)?\()")
    for text in texts:
        for m in pattern.finditer(text):
            before = (m.group(1) or "").strip()
            if before not in _KEYWORDS:
                return True
    return False


def top_candidates(files: list[tuple[str, str]]) -> list[str]:
    """Modules nothing instantiates or binds: what `elaborate` without -top chooses from."""
    texts = [strip_comments(text) for _, text in files]
    bound = {m for text in texts for m in _BIND.findall(text)}
    names = [m for text in texts for m in _MODULE.findall(text)]
    return [m for m in dict.fromkeys(names) if m not in bound and not _instantiated(m, texts)]


def classify(files: list[tuple[str, str]], top: str) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """(design files, SVA files), each in analyze order."""
    texts = [strip_comments(text) for _, text in files]
    bound = {m for text in texts for m in _BIND.findall(text)}
    design, sva = [], []
    for (name, text), clean in zip(files, texts):
        defined = _MODULE.findall(clean)
        is_sva = bool(_BIND.search(clean)) or any(m in bound for m in defined)
        if not is_sva and defined and top not in defined and _PROPERTY.search(clean):
            is_sva = not any(_instantiated(m, texts) for m in defined)
        (sva if is_sva else design).append((name, text))
    if not design:                      # e.g. a single file with design and bind
        return list(files), []
    return design, sva


def resolve(name: str, files: dict[str, str]) -> str:
    """The session file a script means by `name` ("" if none): the exact
    path, or - scripts carry paths of the machine they were written on - the
    one file with the same base name."""
    wanted = name.replace("\\", "/")
    while wanted.startswith("./"):
        wanted = wanted[2:]
    if wanted in files:
        return wanted
    base = wanted.rsplit("/", 1)[-1]
    matches = [f for f in files if f.rsplit("/", 1)[-1] == base]
    return matches[0] if len(matches) == 1 else ""


def joined(analyzed: list[tuple[str, str]], top: str):
    """(design, sva) JoinedSources of the analyzed files, as the formal
    pipeline compiles them, and the names of the SVA files."""
    from app.praman.services.formal_service import SVA_FILENAME
    from app.praman.services.sby_generator import sanitize_filename
    from app.praman.services.uploads import join_sources
    design_files, sva_files = classify(analyzed, top)
    # The joined design is compiled, and read by Yosys, under a name without
    # spaces or brackets ("ecc (1).sv" as a file name breaks its commands);
    # messages still name the files as they were uploaded (JoinedSource.locate).
    return (join_sources(design_files, sanitize_filename(design_files[0][0])),
            join_sources(sva_files, SVA_FILENAME), [name for name, _ in sva_files])


# ── A script for uploaded files ───────────────────────────────

SOURCE_FILE = re.compile(r"\.(sv|v)$", re.IGNORECASE)
SCRIPT_FILE = re.compile(r"\.tcl$", re.IGNORECASE)
DEFAULT_SCRIPT = "pm.tcl"
_INPUTS = re.compile(r"\binput\b([^;)]*)")
_NOT_NAMES = {"wire", "logic", "reg", "bit", "signed", "unsigned", "var", "input"}
_CLOCK = re.compile(r"(clk|clock)", re.IGNORECASE)             # a name that says it is a clock: pclk, hclk, clk_i, ...
_EDGE = re.compile(r"\b(?:posedge|negedge)\s+(?:\(\s*)?([A-Za-z_]\w*)")
_RESET = re.compile(r"(rst|reset)", re.IGNORECASE)
_ACTIVE_LOW = re.compile(r"(^n_?(rst|reset))|((rst|reset)_?(n|ni|b|l|an)$)|(_n$)|(resetn$)|(rstn$)", re.IGNORECASE)


def _inputs(text: str, module: str) -> list[str]:
    """Names of the inputs of `module` (as far as its text shows them)."""
    clean = strip_comments(text)
    m = re.search(rf"\bmodule\s+{re.escape(module)}\b(.*?)\bendmodule\b", clean, re.DOTALL)
    names: list[str] = []
    for decl in _INPUTS.findall(m.group(1) if m else ""):
        decl = re.sub(r"\[[^\]]*\]", " ", decl)                 # ranges
        decl = re.split(r"\b(?:output|inout)\b", decl)[0]       # `input a, output b`
        for word in re.findall(r"[A-Za-z_]\w*", decl):
            if word not in _NOT_NAMES and word not in names:
                names.append(word)
    return names


def _clock(inputs: list[str], texts: list[str]) -> str:
    """The clock among the top's inputs: the one the design's always blocks use as an
    edge most often (a reset that is also an edge, as in negedge rst_n, is not it),
    else one named like a clock (clk, pclk, hclk, clk_i, ...); "" if none."""
    edges: dict[str, int] = {}
    for text in texts:
        for name in _EDGE.findall(strip_comments(text)):
            edges[name] = edges.get(name, 0) + 1
    used = sorted((n for n in inputs if n in edges and not _RESET.search(n)), key=lambda n: -edges[n])
    if used:
        return used[0]
    return next((n for n in inputs if n.lower() in ("clk", "clock")), "") or \
        next((n for n in inputs if _CLOCK.search(n) and not _RESET.search(n)), "")


def default_script(files: dict[str, str]) -> tuple[str, str]:
    """(script, what it assumes) for the source files of a session, or ("", "")
    when there is nothing to write one for.  The script is the usual sequence -
    analyze, elaborate, clock, reset, prove - with the top module, clock and
    reset read off the files; it is a starting point to check, not run by itself."""
    found = sorted((name, text) for name, text in files.items() if SOURCE_FILE.search(name))
    if not found:
        return "", ""
    # A file that only defines modules another file already defines is another
    # version of them (a revision to check for equivalence, a backup): analyzing
    # both would define the modules twice.
    defined: set[str] = set()
    kept, left_out = [], []
    for name, text in found:
        names = modules(text)
        if names and all(m in defined for m in names):
            left_out.append((name, names))
            continue
        defined.update(names)
        kept.append((name, text))
    found = kept
    tops = top_candidates(found)
    top = tops[0] if tops else ""
    design, sva = classify(found, top)
    inputs = next((_inputs(text, top) for _, text in design if top and top in modules(text)), [])
    clock = _clock(inputs, [text for _, text in design])
    reset = next((n for n in inputs if _RESET.search(n) and n != clock), "")
    reset_text = f"{'!' if _ACTIVE_LOW.search(reset) else ''}{reset}" if reset else ""
    word = lambda name: name if re.fullmatch(r"[\w./+-]+", name) else "{" + name + "}"
    lines = [
        "# pm.tcl: written by Praman for the files of this session.",
        "# Check the top module, the clock and the reset, then run it:  source pm.tcl",
        "clear -all",
        "",
        *[f"# {name} is not analyzed: it defines {', '.join(names)} again (another version?)"
          for name, names in left_out],
        "analyze -sv " + " ".join(word(n) for n, _ in design),
        *(["analyze -sv " + " ".join(word(n) for n, _ in sva)] if sva else []),
        "",
        *([f"# several top-level modules were found: {', '.join(tops)}"] if len(tops) > 1 else []),
        f"elaborate -top {top}" if top else "elaborate",
        "",
        f"clock {clock}" if clock else "clock -none",
        f"reset {reset_text}" if reset else "reset -none",
        "",
        "prove -all",
        "",
    ]
    what = f"top {top or 'not found'}, clock {clock or 'none'}, reset {reset_text or 'none'}"
    return "\n".join(lines), what
