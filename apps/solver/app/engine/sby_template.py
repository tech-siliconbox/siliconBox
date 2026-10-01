"""The only way a .sby file is written: a fixed template filled with checked values.

Hardening finding 2 (docs/security/solver-hardening.md): mode, solver and the top module used
to be pasted into the .sby file, so a value holding a newline could add Yosys script lines.
Every value placed here is allow-listed or matched against a strict pattern first.
"""

import re
from dataclasses import dataclass

from app.limits import MAX_DEPTH, MAX_TIMEOUT_SECONDS, MODES, SOLVERS

IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,63}")
FILE_NAME = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_-]{0,63}\.(?:sv|v)")
SOURCE_PATH = re.compile(r"(?:src/)?[A-Za-z0-9_][A-Za-z0-9_-]{0,63}\.(?:sv|v)")


class SbyTemplateError(ValueError):
    """A value would not be safe to place in the .sby file."""


@dataclass(frozen=True)
class SbySettings:
    mode: str
    solver: str
    depth: int
    timeout_seconds: int
    top_module: str


def _check(settings: SbySettings) -> None:
    if settings.mode not in MODES:
        raise SbyTemplateError(f"mode must be one of {sorted(MODES)}")
    if settings.solver not in SOLVERS:
        raise SbyTemplateError(f"solver must be one of {sorted(SOLVERS)}")
    if not 1 <= settings.depth <= MAX_DEPTH:
        raise SbyTemplateError(f"depth must be 1 to {MAX_DEPTH}")
    if not 1 <= settings.timeout_seconds <= MAX_TIMEOUT_SECONDS:
        raise SbyTemplateError(f"timeout must be 1 to {MAX_TIMEOUT_SECONDS} seconds")
    if not IDENTIFIER.fullmatch(settings.top_module):
        raise SbyTemplateError("top module must be a plain identifier")


def render_sby(settings: SbySettings, files: list[tuple[str, str]]) -> str:
    """Builds the .sby text. `files` pairs the name Yosys reads with its source path."""
    _check(settings)
    if not files:
        raise SbyTemplateError("at least one source file is needed")
    for name, source in files:
        if not FILE_NAME.fullmatch(name) or not SOURCE_PATH.fullmatch(source):
            raise SbyTemplateError("source file names must be plain .sv or .v names")

    mode = settings.mode
    lines = [
        "[tasks]",
        mode,
        "",
        "[options]",
        f"{mode}: mode {mode}",
        f"{mode}: depth {settings.depth}",
        f"{mode}: timeout {settings.timeout_seconds}",
        "",
        "[engines]",
        f"smtbmc {settings.solver}",
        "",
        "[script]",
        *(f"read -sv -formal {name}" for name, _ in files),
        f"prep -top {settings.top_module}",
        "",
        "[files]",
        *(f"{name} {source}" for name, source in files),
        "",
    ]
    return "\n".join(lines)
