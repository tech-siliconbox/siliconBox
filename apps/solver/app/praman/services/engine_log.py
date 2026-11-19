"""
Live solver output: what the engines of a running sby check are doing,
condensed for the log ("Engine detail") and the property table.

sby writes a log per run (<run>/<run>_<task>/logfile.txt) as the engines
work.  `follow_run` reads it while the run goes on and passes on the lines
that say something about the proof:
  - which engines started (`engine_0: abc pdr`, `engine_1: smtbmc yices`),
  - progress: the step a bounded check or a base case reached, the step of
    an induction, the frame of PDR - at most one line every PROGRESS_EVERY
    seconds for each engine,
  - results: an induction that succeeded, a failed assertion, a reached
    cover, the status an engine returned, and the end of the run.
Process starts, copies, warnings of the converters and solver statistics are
left out.
"""

from __future__ import annotations

import re
import threading
import time
from pathlib import Path
from typing import Callable, Optional

PROGRESS_EVERY = 2.0           # seconds between two progress lines of one engine
LOOK_EVERY = 0.5               # seconds between two reads of the log

_PREFIX = re.compile(r"^SBY\s+\d+:\d+:\d+\s+\[[^\]]*\]\s")      # before 10:00 the hour is padded: "SBY  1:25:53"
_SMTBMC = re.compile(r"^##\s+\d+:\d+:\d+\s+")
_ENGINE_SPEC = re.compile(r"^(engine_\d+): ((?:abc|smtbmc|aiger|btor|none)\b.*)$")

# (pattern on the message, how it is shown, progress?)
_KEEP: list[tuple[re.Pattern, Callable[[re.Match], str], bool]] = [
    (re.compile(r"^Checking assertions in step (\d+)"), lambda m: f"step {m[1]}", True),
    (re.compile(r"^Checking cover reachability in step (\d+)"), lambda m: f"cover step {m[1]}", True),
    (re.compile(r"^Trying induction in step (\d+)"), lambda m: f"induction step {m[1]}", True),
    (re.compile(r"^(\d+) : [-~\d ]+\s+\d+\s+\d+\s+[\d.]+ sec"), lambda m: f"frame {m[1]}", True),
    (re.compile(r"^Solver: (\w+)"), lambda m: f"solver {m[1]}", False),
    (re.compile(r"^Temporal induction successful"), lambda m: "induction successful", False),
    (re.compile(r"^Assert failed in [^:]*: (\S+)"), lambda m: f"{m[1]} failed", False),
    (re.compile(r"^Reached cover statement in step (\d+) at [^:]*: (\S+)"),
     lambda m: f"{m[2]} reached in step {m[1]}", False),
    (re.compile(r"^Unreached cover statement at [^:]*: (\S+)"), lambda m: f"{m[1]} not reached", False),
    (re.compile(r"^Status: (\w+)"), lambda m: f"status: {m[1]}", False),
    (re.compile(r"^Property proved\.|^Output \d+ of miter .* was asserted in frame (\d+)"),
     lambda m: m[0], False),
    (re.compile(r"^Properties:\s+All = (\d+)\. Proved = (\d+)\. Disproved = (\d+)\. Undecided = (\d+)"),
     lambda m: f"{m[2]} of {m[1]} proved, {m[3]} disproved, {m[4]} undecided", False),
]


def condense(line: str) -> Optional[tuple[str, str, bool]]:
    """(engine, message, progress?) for a line of an sby log worth showing, else None.
    engine: e.g. "engine_1.induction"; "" for the run itself (its end)."""
    line = _PREFIX.sub("", line.rstrip("\n"))
    m = re.match(r"^DONE \((\w+), rc=\d+\)", line)
    if m:
        return "", f"done: {m[1]}", False
    m = re.match(r"^summary: (engine_\d+) \(([^)]*)\) returned (\w+(?: for \w+)?)", line)
    if m:
        return m[1], f"{m[2]} returned {m[3]}", False
    m = _ENGINE_SPEC.match(line)
    if m:
        return m[1], m[2], False
    m = re.match(r"^(engine_\d+(?:\.\w+)?): (.*)$", line)
    if not m:
        return None
    engine, text = m[1], _SMTBMC.sub("", m[2]).strip()
    for pattern, show, progress in _KEEP:
        found = pattern.match(text)
        if found:
            return engine, show(found), progress
    return None


def follow_run(run_dir: Path, emit: Callable[[str, bool], None], stop: threading.Event) -> None:
    """Read the logs of the sby run in `run_dir` until `stop` is set (then once
    more, for the last lines), calling emit(text, progress) for each line kept."""
    offsets: dict[Path, int] = {}
    partial: dict[Path, str] = {}
    last_progress: dict[str, float] = {}
    last_shown: dict[str, str] = {}          # the last progress shown of an engine (not repeated)
    held: dict[str, str] = {}                # the latest progress of an engine not shown yet

    def read_all() -> None:
        for log in sorted(run_dir.glob("*/logfile.txt")):
            try:
                with open(log, "r", errors="replace") as f:
                    f.seek(offsets.get(log, 0))
                    chunk = f.read()
                    offsets[log] = f.tell()
            except OSError:
                continue
            text = partial.pop(log, "") + chunk
            lines = text.split("\n")
            if lines and lines[-1]:
                partial[log] = lines.pop()       # an unfinished line: the rest comes later
            for line in lines:
                kept = condense(line)
                if kept is None:
                    continue
                engine, message, progress = kept
                shown = f"{engine}: {message}" if engine else message
                if progress:
                    if shown == last_shown.get(engine):
                        continue                 # no further than last time
                    now = time.monotonic()
                    if now - last_progress.get(engine, 0.0) < PROGRESS_EVERY:
                        held[engine] = shown
                        continue
                    last_progress[engine] = now
                    last_shown[engine] = shown
                    held.pop(engine, None)
                elif engine in held:
                    last_shown[engine] = held[engine]
                    emit(held.pop(engine), True)  # where it got to, before what it found
                emit(shown, progress)

    while not stop.wait(LOOK_EVERY):
        read_all()
    read_all()
