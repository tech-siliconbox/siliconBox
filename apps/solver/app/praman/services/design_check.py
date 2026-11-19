"""
Pre-run check: the compile stage of a run (formal_service.compile_design)
without the solvers.  It reports, in a few seconds, what would otherwise
fail only after the run started:

  elaborate   slang reads design + SVA (syntax, unknown modules and names)
  properties  every assertion compiled to a monitor, or why it can't be
  read        Yosys reads the design with the monitors (formal model)

Locations are mapped back to the uploaded files (see uploads.JoinedSource).
"""

from __future__ import annotations

import logging
import re
import shutil
import time

from app.praman.services.compile_worker import run_isolated
from app.praman.services.formal_service import compile_design
from app.praman.services.sva.frontend import FrontendError
from app.praman.services.sva.hints import GENERATED_FILES, hint_for
from app.praman.services.sva.pipeline import DesignReadError
from app.praman.services.uploads import JoinedSource

logger = logging.getLogger("veriassist.check")

# slang: "file.sv:12:5: error: message", then the source line and a caret line
_SLANG_DIAG = re.compile(r"^(?P<file>[^\s:]+):(?P<line>\d+):(?P<col>\d+): (?P<sev>error|warning): (?P<msg>.*)$",
                         re.MULTILINE)


def check_design(design: JoinedSource, sva: JoinedSource, top: str = "", reset_signal: str = "",
                 reset_polarity: str = "auto", clock_signal: str = "", auto_checks: bool = False) -> dict:
    started = time.monotonic()
    sources = {s.name: s for s in (design, sva) if s.text}
    stages = {"elaborate": "skipped", "properties": "skipped", "read": "skipped"}
    issues: list[dict] = []
    summary: dict = {}
    properties: list[dict] = []

    try:
        prepared = run_isolated(compile_design, sva.text, design.text, design.name, top,
                                  reset_signal=reset_signal, reset_polarity=reset_polarity,
                                  clock_signal=clock_signal, auto_checks=auto_checks)
    except DesignReadError as e:
        stages.update(elaborate="pass", properties="pass", read="fail")
        issues.append(_issue("error", e.message, sources, e.file, e.line, hint=e.hint))
    except FrontendError as e:
        stages["elaborate"] = "fail"
        issues.extend(_slang_issues(str(e), sources))
    except Exception as e:  # a tool bug must not look like a server failure
        logger.exception("pre-run check failed")
        stages["elaborate"] = "fail"
        issues.append(_issue("error", f"Internal error while checking: {e}", sources,
                             hint="This is a problem in the tool, not in your files. Please report it."))
    else:
        unsupported = [p for p in prepared.properties if not p.supported]
        stages.update(elaborate="pass", properties="warn" if unsupported else "pass",
                      read="pass" if shutil.which("yosys") else "skipped")
        for p in unsupported:
            file, _, line = p.location.rpartition(":")
            issues.append(_issue("warning", f"{p.label} is not checkable: {p.problems[0]}", sources,
                                 file, int(line) if line.isdigit() else 0))
        summary = {"top": prepared.top, "reader": prepared.reader, **prepared.harness_info()}
        properties = [{"label": p.label, "kind": p.kind.value, "supported": p.supported}
                      for p in prepared.properties]

    return {
        "ok": not any(i["severity"] == "error" for i in issues),
        "stages": stages,
        "issues": issues,
        "design": summary,
        "properties": properties,
        "seconds": round(time.monotonic() - started, 2),
    }


def _slang_issues(text: str, sources: dict[str, JoinedSource]) -> list[dict]:
    matches = list(_SLANG_DIAG.finditer(text))
    if not matches:   # e.g. "Top module 'x' is not defined ..."
        return [_issue("error", text.strip(), sources)]
    issues = []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        snippet = text[m.end():end].strip("\n")
        issues.append(_issue(m["sev"], m["msg"], sources, m["file"], int(m["line"]), int(m["col"]), snippet))
    return issues


def _issue(severity: str, message: str, sources: dict[str, JoinedSource], file: str = "",
           line: int = 0, column: int = 0, snippet: str = "", hint: str = "") -> dict:
    generated = file in GENERATED_FILES
    if file in sources and line:
        snippet = snippet or sources[file].line_text(line)   # Yosys gives no source line
        file, line = sources[file].locate(line)
    return {
        "severity": severity,
        "message": _relocate(message, sources),
        "file": file,
        "line": line,
        "column": column,
        "snippet": snippet,
        "hint": hint or hint_for(message, file),
        "generated": generated,
    }


def _relocate(text: str, sources: dict[str, JoinedSource]) -> str:
    """Rewrite "joined.sv:12" references inside a message as uploaded file:line."""
    for name, source in sources.items():
        text = re.sub(rf"(?<![\w.]){re.escape(name)}:(\d+)",
                      lambda m, src=source: "{}:{}".format(*src.locate(int(m[1]))), text)
    return text
