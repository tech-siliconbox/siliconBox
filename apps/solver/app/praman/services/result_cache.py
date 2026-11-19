"""
Result cache: a property's decided result is reused when nothing it depends
on has changed, so re-proving after editing one assertion only proves that
one (and what it affects).

A property's key is a hash of everything its result depends on:
  - the design files, with every assertion statement taken out (editing an
    assertion does not change the design; its helper logic stays in),
  - its own compiled checker (with its precondition and witness covers),
  - every assumption's compiled checker,
  - the harness (clocks, reset sequence), the depth, the mode, the reader,
  - CACHE_VERSION and the Yosys version.
Numbers the compiler gives a checker's wires (`_va3_...`) depend on its
position among the others, so they are normalised; comments are left out.

Only decided results are kept: proven, counterexample, covered, unreachable,
vacuous.  An undetermined result depends on time limits and is never kept.
A kept counterexample or cover trace comes with its waveform.
"""

from __future__ import annotations

import hashlib
import re
import subprocess
from functools import lru_cache
from typing import Optional, Protocol

CACHE_VERSION = "2"                  # 2: results before the flattened-name fix of the shared model are not reused
DECIDED = {"PROVEN", "FAIL", "COVERED", "UNREACHABLE", "VACUOUS"}

_BLOCK = re.compile(r"^    // ---- (\w+) \([^\n]*\) ----\n(.*?)(?=^    // ---- |^endmodule)", re.M | re.S)
_WIRE_NUMBER = re.compile(r"\b_va\d+_")
_ASSERTION = re.compile(r"(?:\b\w+\s*:\s*)?\b(?:assert|assume|cover|restrict)\s+(?:property|sequence)\s*\(")
_COMMENTS = re.compile(r"//[^\n]*|/\*.*?\*/", re.S)


class Cache(Protocol):
    def get(self, key: str) -> Optional[tuple[dict, Optional[bytes]]]: ...
    def put(self, key: str, entry: dict, trace: Optional[bytes]) -> None: ...


@lru_cache(maxsize=1)
def _yosys_version() -> str:
    try:
        return subprocess.run(["yosys", "-V"], capture_output=True, text=True, timeout=20).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return ""


def _without_assertions(text: str) -> str:
    """`text` without its concurrent assertion statements (and their else actions)."""
    text = _COMMENTS.sub("", text)
    out, pos = [], 0
    for m in _ASSERTION.finditer(text):
        if m.start() < pos:
            continue
        depth, i = 1, m.end()
        while i < len(text) and depth:
            depth += {"(": 1, ")": -1}.get(text[i], 0)
            i += 1
        rest = re.match(r"\s*else\b[^;]*;|\s*;", text[i:])
        out.append(text[pos:m.start()])
        pos = i + (rest.end() if rest else 0)
    out.append(text[pos:])
    return " ".join("".join(out).split())


def blocks(monitor_text: str) -> dict[str, str]:
    """{label: its compiled checker, normalised} of every property of the monitors."""
    found = {}
    for m in _BLOCK.finditer(monitor_text):
        found[m.group(1)] = " ".join(_WIRE_NUMBER.sub("_vaN_", m.group(2)).split())
    return found


def _is_assumption(block: str) -> bool:
    return bool(re.search(r"\b\w+:\s*assume\s*\(", block)) and not re.search(r"\b\w+:\s*(assert|cover)\s*\(", block)


def property_keys(prepared, monitor_text: str, depth: int, mode: str) -> dict[str, str]:
    """{label: key} for the properties of a compiled design (see the module doc)."""
    found = blocks(monitor_text)
    common = hashlib.sha256()
    for part in (CACHE_VERSION, _yosys_version(), prepared.top, prepared.reader, str(prepared.multiclock),
                 str(prepared.steps_per_cycle), str(depth), mode, prepared.harness_module(0),
                 *(f"{name}\0{_without_assertions(text)}" for name, text in sorted(prepared._files.items())),
                 *(f"{label}\0{block}" for label, block in sorted(found.items()) if _is_assumption(block))):
        common.update(part.encode("utf-8"))
        common.update(b"\1")
    base = common.hexdigest()
    return {label: hashlib.sha256(f"{base}\0{label}\0{block}".encode("utf-8")).hexdigest()
            for label, block in found.items() if not _is_assumption(block)}
