"""Runs a tool as its own process group and kills the whole group when time is up.

Hardening finding 3: subprocess.run(timeout=...) only killed sby, so the Yosys and solver
processes it started kept the CPU busy. Here every child shares one process group, and the
group is killed on timeout and again after a normal exit to catch strays.
"""

import contextlib
import os
import signal
import subprocess  # noqa: S404  Fixed argument lists only; never a shell.
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ProcessOutcome:
    stdout: str
    stderr: str
    returncode: int
    timed_out: bool


def _kill_group(pid: int) -> None:
    with contextlib.suppress(ProcessLookupError, PermissionError):
        os.killpg(pid, signal.SIGKILL)


def run_bounded(
    argv: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
    timeout_seconds: float,
    stdin_text: str | None = None,
) -> ProcessOutcome:
    """Runs `argv` with a hard wall-clock limit. The environment is exactly `env`."""
    with subprocess.Popen(  # noqa: S603  argv is built by the solver, not taken from a request.
        argv,
        cwd=cwd,
        env=env,
        stdin=subprocess.PIPE if stdin_text is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    ) as proc:
        try:
            stdout, stderr = proc.communicate(stdin_text, timeout=max(timeout_seconds, 0.1))
        except subprocess.TimeoutExpired:
            # If the tool itself had exited, a stray child was only holding the pipe open.
            exited = proc.poll() is not None
            _kill_group(proc.pid)
            stdout, stderr = proc.communicate()
            return ProcessOutcome(stdout, stderr, proc.returncode, timed_out=not exited)
        finally:
            _kill_group(proc.pid)
    return ProcessOutcome(stdout, stderr, proc.returncode, timed_out=False)
