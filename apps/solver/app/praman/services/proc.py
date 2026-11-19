"""
Running a tool whose children do the work (sby -> yosys-smtbmc -> yices, the
native engine's worker -> yices) so that none of them outlives it.

`subprocess.run(..., timeout=...)` kills only the process it started; the
solver underneath is orphaned and keeps a CPU core busy (one ran for 27 hours
after its job had timed out).  `run_tree` starts the command in a process
group of its own and, on a timeout or any error, kills the whole group.
"""

from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
import threading
import time

from app.praman import ceilings

logger = logging.getLogger("veriassist.proc")


def _kill_group(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        pass
    try:
        proc.kill()
    except OSError:
        pass


GRACE_SECONDS = 2.0


def _stop(proc: subprocess.Popen) -> None:
    """End the command and everything under it.  SIGTERM first: sby starts
    each solver in a process group of its own, which killing sby's group does
    not reach, but on SIGTERM sby stops them itself.  Then the group is killed."""
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=GRACE_SECONDS)
    except (ProcessLookupError, PermissionError, OSError, subprocess.TimeoutExpired):
        pass
    _kill_group(proc)


class MemoryLimitExceeded(subprocess.SubprocessError):
    """A command and the processes under it used more memory than allowed."""

    def __init__(self, cmd, used_mb: float, limit_mb: int):
        super().__init__(f"used {used_mb:.0f} MB, more than the {limit_mb} MB allowed")
        self.cmd, self.used_mb, self.limit_mb = cmd, used_mb, limit_mb


def memory_limit_mb() -> int:
    """PRAMAN_JOB_MEMORY_MB: the most memory a check's tools may use together (0: no limit)."""
    try:
        return max(0, int(os.environ.get("PRAMAN_JOB_MEMORY_MB", "") or 0))
    except ValueError:
        return 0


MEMORY_LOOK = 1.0          # seconds between two measurements of a command's memory


def tree_rss_mb(root: int) -> float:
    """Resident memory (MB) of a process and every process under it (Linux; 0 where
    there is no /proc).  Real memory, not address space: a limit on address space
    (RLIMIT_AS) also stops a process from starting threads long before it uses
    the memory, which is how it broke every proof on a small server."""
    if not os.path.isdir("/proc"):
        return 0.0
    children: dict[int, list[int]] = {}
    for entry in os.scandir("/proc"):
        if not entry.name.isdigit():
            continue
        try:
            with open(f"/proc/{entry.name}/stat") as f:
                ppid = int(f.read().rsplit(")", 1)[1].split()[1])
        except (OSError, ValueError, IndexError):
            continue
        children.setdefault(ppid, []).append(int(entry.name))
    total_kb, stack, seen = 0, [root], set()
    while stack:
        pid = stack.pop()
        if pid in seen:
            continue
        seen.add(pid)
        try:
            with open(f"/proc/{pid}/status") as f:
                for line in f:
                    if line.startswith("VmRSS:"):
                        total_kb += int(line.split()[1])
                        break
        except (OSError, ValueError, IndexError):
            pass
        stack.extend(children.get(pid, []))
    return total_kb / 1024


def _communicate(proc: subprocess.Popen, cmd, timeout, cancel):
    """proc.communicate(timeout), giving up early (TimeoutExpired) once `cancel` is set,
    and (MemoryLimitExceeded) when the command uses more than PRAMAN_JOB_MEMORY_MB."""
    limit = memory_limit_mb() if os.path.isdir("/proc") else 0
    if cancel is None and not limit:
        return proc.communicate(timeout=timeout)
    deadline = None if timeout is None else time.monotonic() + timeout
    next_look = time.monotonic() + MEMORY_LOOK
    while True:
        if cancel is not None and cancel.is_set():
            raise subprocess.TimeoutExpired(cmd, timeout or 0)
        if limit and time.monotonic() >= next_look:
            next_look = time.monotonic() + MEMORY_LOOK
            used = tree_rss_mb(proc.pid)
            if used > limit:
                raise MemoryLimitExceeded(cmd, used, limit)
        step = 0.2 if deadline is None else min(0.2, max(0.0, deadline - time.monotonic()))
        try:
            return proc.communicate(timeout=step)
        except subprocess.TimeoutExpired:
            if deadline is not None and time.monotonic() >= deadline:
                raise


def run_tree(cmd, timeout=None, cancel=None, **kwargs) -> subprocess.CompletedProcess:
    """`subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, **kwargs)`, with the
    command and all its children killed together on a timeout (TimeoutExpired is raised as usual).

    cancel: a threading.Event; once it is set the command is stopped the same
    way (TimeoutExpired), so a run can be stopped by the user."""
    if cancel is not None and cancel.is_set():
        raise subprocess.TimeoutExpired(cmd, timeout or 0)
    timeout = ceilings.engine_timeout(timeout)      # SiliconBox: the learner's ceilings (ADR 0031)
    if timeout is not None and timeout <= 0:        # no proof time left today: nothing starts
        raise subprocess.TimeoutExpired(cmd, 0)
    kwargs.setdefault("text", True)
    kwargs.setdefault("stdout", subprocess.PIPE)
    kwargs.setdefault("stderr", subprocess.PIPE)
    kwargs.pop("capture_output", None)
    posix = os.name == "posix"
    with ceilings.engine_running(), subprocess.Popen(cmd, start_new_session=posix, **kwargs) as proc:
        try:
            out, err = _communicate(proc, cmd, timeout, cancel)
        except MemoryLimitExceeded:
            if posix:
                _stop(proc)
            else:
                proc.kill()
            proc.communicate()
            raise
        except subprocess.TimeoutExpired:
            if posix:
                _stop(proc)
            else:
                proc.kill()
            out, err = proc.communicate()
            raise subprocess.TimeoutExpired(cmd, timeout, output=out, stderr=err)
        except BaseException:
            if posix:
                _kill_group(proc)
            else:
                proc.kill()
            raise
        if posix:                       # a child left behind by a tool that exited (none expected)
            _kill_group(proc)
    return subprocess.CompletedProcess(cmd, proc.returncode, out, err)


# ── sby ───────────────────────────────────────────────────────
# sby is a Python script run by whichever `python3` is first on PATH.  When
# the server was started without its environment on PATH (venv/bin/python -m
# uvicorn ...), that python3 may lack sby's modules (click) and every run
# ends in a traceback.  The interpreter running the server has them, so sby
# is then started with this interpreter's directory first on PATH.

_sby_lock = threading.Lock()
_sby_state: "tuple[dict | None, str] | None" = None


def _sby_starts(env) -> tuple[bool, str]:
    try:
        done = subprocess.run(["sby", "--help"], capture_output=True, text=True, timeout=60, env=env)
    except FileNotFoundError:
        return False, "sby was not found on PATH (install the OSS CAD Suite)"
    except (OSError, subprocess.TimeoutExpired) as e:
        return False, f"sby did not start: {e}"
    if done.returncode == 0:
        return True, ""
    lines = (done.stderr or done.stdout or "").strip().splitlines()
    return False, lines[-1] if lines else f"sby --help ended with code {done.returncode}"


def sby_environment(refresh: bool = False) -> tuple["dict | None", str]:
    """(environment to start sby with, problem).  The environment is None
    when sby starts as it is; the problem is "" when it can be started, else
    what stops it (shown to the user instead of a traceback per property)."""
    global _sby_state
    with _sby_lock:
        if _sby_state is None or refresh:
            ok, problem = _sby_starts(None)
            if ok:
                _sby_state = (None, "")
            else:
                env = dict(os.environ)
                env["PATH"] = os.path.dirname(sys.executable) + os.pathsep + env.get("PATH", "")
                ok_here, _ = _sby_starts(env)
                if ok_here:
                    logger.warning("sby does not start with the python3 on PATH (%s); "
                                   "starting it with %s first on PATH", problem, os.path.dirname(sys.executable))
                    _sby_state = (env, "")
                else:
                    _sby_state = (None, problem)
        return _sby_state
