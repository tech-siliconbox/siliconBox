"""
Plain-language hints for common slang / Yosys errors, shown next to the
tool's own message (pre-run check and failed runs).
"""

from __future__ import annotations

import re

from app.praman.services.yosys_reader import HARNESS_FILE, MONITOR_FILE

GENERATED_FILES = (MONITOR_FILE, HARNESS_FILE)

GENERATED_HINT = ("This error is in checker code the tool generated from your SVA, not in your "
                  "files. Please report it together with the files.")

_HINTS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"unknown module '([^']+)'"),
     "No module named '{0}' was uploaded. Add the file that defines it, or fix the name "
     "(for a bind, it must name the design module to attach the checker to)."),
    (re.compile(r"could not resolve hierarchical path name '([^']+)'"),
     "'{0}' does not exist at that point of the design hierarchy. Check the signal name, and "
     "that the path starts at the module the checker is bound to (e.g. top.signal)."),
    (re.compile(r"use of undeclared identifier '([^']+)'"),
     "'{0}' is not declared here. Declare it, connect it through a port, or reference it "
     "hierarchically (module.signal)."),
    (re.compile(r"Top module '[^']+' is not defined"),
     "Clear the Top Module field to pick the top automatically, or enter one of the listed modules."),
    (re.compile(r"unexpected '#'|forever|timing control|delay control", re.IGNORECASE),
     "Testbench-only code (delays, forever loops, classes) is not supported in design files: "
     "formal checking needs synthesizable RTL."),
    (re.compile(r"unsupported language feature"),
     "Yosys cannot build hardware from this line. Testbench-only code (delays, forever loops, "
     "classes) is not supported in design files; otherwise rewrite it with a synthesizable construct."),
]


def hint_for(message: str, file: str = "") -> str:
    """Hint for one error message ("" when none applies)."""
    if file in GENERATED_FILES:
        return GENERATED_HINT
    for pattern, text in _HINTS:
        match = pattern.search(message)
        if match:
            return text.format(*match.groups())
    return ""
