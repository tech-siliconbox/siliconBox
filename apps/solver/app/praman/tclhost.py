"""
The Tcl interpreter of a Praman session.

Scripts (pm.tcl, console lines) are real Tcl - variables, `if`, `foreach`,
`proc`, `source` - run by `tclsh` in a process of its own, inside a safe
interpreter: no `exec`, `open`, `socket`, `file` or `cd`, so a script cannot
touch the server.  The Praman commands (analyze, elaborate, prove, ...) are
aliases that call back here; see host.tcl for the line protocol.

A process per session keeps sessions apart and lets a stuck script be
killed.  Tcl computing is limited per evaluation (host.tcl, ::budget); time
spent inside a Praman command (a long proof) does not count.
"""

from __future__ import annotations

import base64
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger("praman.tcl")

HOST_SCRIPT = Path(__file__).with_name("host.tcl")
# Memory a session's Tcl interpreter may use (a script such as
# `string repeat x 1e10` must not take the server's memory).  Linux only:
# macOS does not enforce address-space limits.
TCL_MEMORY_MB = int(os.environ.get("PRAMAN_TCL_MEMORY_MB", "") or 1024)


def _limit_memory() -> None:                      # pragma: no cover - runs in the child
    try:
        import resource
        limit = TCL_MEMORY_MB * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
    except (ImportError, ValueError, OSError):
        pass


class TclUnavailable(RuntimeError):
    """No tclsh on this machine."""


class TclError(Exception):
    """A script failed; the message is Tcl's (with file and line for sourced files)."""


class CommandError(Exception):
    """Raised by a Praman command: becomes a Tcl error in the script."""


class ExitRequested(Exception):
    """`exit` in a script: stop running it."""


def tclsh_path() -> Optional[str]:
    return os.environ.get("PRAMAN_TCLSH") or shutil.which("tclsh") or shutil.which("tclsh8.6")


def _enc(text: str) -> str:
    return "=" + base64.b64encode(text.encode("utf-8")).decode("ascii")


def _dec(token: str) -> str:
    return base64.b64decode(token[1:]).decode("utf-8", errors="replace")


_BARE = re.compile(r"[A-Za-z0-9_./:+\-@%^,=!~*?]+")


def tcl_list(items) -> str:
    """Python strings as one Tcl list (what a command returns for `foreach`, `llength`, ...)."""
    out = []
    for item in items:
        item = str(item)
        if not item:
            out.append("{}")
        elif _BARE.fullmatch(item):
            out.append(item)
        else:
            escaped = re.sub(r'([\\{}\[\]$";\s])', lambda m: "\\" + {"\n": "n", "\t": "t"}.get(m.group(1), m.group(1)), item)
            out.append(escaped)
    return " ".join(out)


def tcl_split(text: str) -> list[str]:
    """The elements of a Tcl list such as `{a b} c "d e"` (as the value of
    `-property {...}` arrives here)."""
    items, i, n = [], 0, len(text)
    while i < n:
        if text[i].isspace():
            i += 1
            continue
        if text[i] == "{":
            depth, j = 1, i + 1
            while j < n and depth:
                if text[j] == "\\":
                    j += 1
                elif text[j] == "{":
                    depth += 1
                elif text[j] == "}":
                    depth -= 1
                j += 1
            if depth:
                raise CommandError(f"unmatched open brace in list: {text}")
            items.append(text[i + 1:j - 1])
            i = j
        elif text[i] == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            items.append(re.sub(r"\\(.)", r"\1", text[i + 1:j]))
            i = j + 1
        else:
            j = i
            while j < n and not text[j].isspace():
                j += 2 if text[j] == "\\" else 1
            items.append(re.sub(r"\\(.)", r"\1", text[i:j]))
            i = j
    return items


class TclHost:
    """One tclsh process.  `evaluate` is not re-entrant: a session runs one script at a time."""

    def __init__(self, commands: list[str]):
        exe = tclsh_path()
        if not exe:
            raise TclUnavailable("tclsh was not found (install Tcl 8.6 or later, or set PRAMAN_TCLSH)")
        self.commands = list(commands)
        self._lock = threading.Lock()
        self._proc = subprocess.Popen(
            [exe, str(HOST_SCRIPT), *self.commands],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="ascii", bufsize=1,
            preexec_fn=_limit_memory if sys.platform.startswith("linux") else None,
        )

    def alive(self) -> bool:
        return self._proc.poll() is None

    def _write(self, line: str) -> None:
        try:
            self._proc.stdin.write(line + "\n")
            self._proc.stdin.flush()
        except (BrokenPipeError, OSError, ValueError):
            raise TclError("the Tcl interpreter is not running")

    def evaluate(
        self,
        script: str,
        on_call: Callable[[str, list[str]], Optional[str]],
        on_out: Callable[[str, bool], None] = lambda text, newline: None,
        on_echo: Callable[[int, str], None] = lambda depth, text: None,
    ) -> str:
        """Run `script`; returns its result.  Raises TclError (script error)
        or ExitRequested (`exit`)."""
        with self._lock:
            self._write(f"EVAL {_enc(script)}")
            while True:
                line = self._proc.stdout.readline()
                if not line:
                    raise TclError("the Tcl interpreter stopped unexpectedly")
                kind, *rest = line.rstrip("\n").split(" ")
                if kind == "CALL":
                    name, args = rest[0], [_dec(token) for token in rest[1:]]
                    try:
                        reply = "OK", on_call(name, args) or ""
                    except ExitRequested as e:
                        reply = "EXIT", str(e)
                    except CommandError as e:
                        reply = "ERR", str(e)
                    except Exception as e:               # a bug in a command must not kill the session
                        logger.exception("Praman command %s failed", name)
                        reply = "ERR", f"internal error in {name}: {e}"
                    self._write(f"{reply[0]} {_enc(reply[1])}")
                elif kind == "OUT":
                    on_out(_dec(rest[1]), rest[0] == "1")
                elif kind == "ECHO":
                    on_echo(int(rest[0]), _dec(rest[1]))
                elif kind == "RET":
                    value = _dec(rest[1])
                    if rest[0] == "error":
                        raise TclError(value)
                    if rest[0] == "exit":
                        raise ExitRequested(value)
                    return value

    def close(self) -> None:
        try:
            if self.alive():
                self._proc.kill()
            self._proc.wait(timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            pass
        for stream in (self._proc.stdin, self._proc.stdout):
            try:
                stream.close()
            except OSError:
                pass
