"""Starts the process that holds one open Praman session (ADR 0031).

Both runners start `app.praman.host` with pipes to its stdin and stdout, and pass it no secret:
no Redis URL, no signing key.

- LocalSessionRunner: a process group on this machine with a UUID work folder of its own.
  Development and tests.
- ContainerSessionRunner: a container per session with the isolation of a job container
  (runners.isolation_flags) and PRAMAN_SESSION_MEMORY; gVisor when the runtime is runsc.
"""

import contextlib
import os
import signal
import subprocess  # noqa: S404  Fixed argument lists only; never a shell.
import sys
import tempfile
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Protocol

from app.limits import PRAMAN_SESSION_MEMORY, PRAMAN_SESSION_TUNING
from app.runners import APP_ROOT, docker_client_env, isolation_flags, remove_container
from app.tools import tool_path
from app.workspace import new_folder, remove_inside

HOST = ["-m", "app.praman.host"]
# Inside the image: the OSS CAD Suite first, so sby runs with the suite's own Python.
CONTAINER_PATH = "/opt/oss-cad-suite/bin:/usr/local/bin:/usr/bin:/bin"
CONTAINER_PYTHON = "/usr/local/bin/python"
STOP_GRACE_SECONDS = 10


class SessionGone(Exception):
    """The session's process has ended."""


def session_environment(work_dir: str, path: str) -> dict[str, str]:
    """Everything a session host sees."""
    return {
        "PATH": path,
        "FORMAL_WORK_DIR": work_dir,
        "LANG": "C.UTF-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        **PRAMAN_SESSION_TUNING,
    }


class SessionProcess:
    """A running session host: request lines in, reply lines out."""

    def __init__(self, process: subprocess.Popen[str], cleanup: Callable[[], None]) -> None:
        self._process = process
        self._cleanup = cleanup

    def send(self, line: str) -> None:
        stdin = self._process.stdin
        try:
            if stdin is None:
                raise SessionGone
            stdin.write(line + "\n")
            stdin.flush()
        except (BrokenPipeError, OSError, ValueError) as error:
            raise SessionGone from error

    def replies(self) -> Iterator[str]:
        """Reply lines until the process ends."""
        stdout = self._process.stdout
        if stdout is not None:
            yield from iter(stdout.readline, "")

    def stop(self) -> None:
        """End the process (it closes the session when its stdin closes), then clean up."""
        with contextlib.suppress(OSError, ValueError):
            if self._process.stdin is not None:
                self._process.stdin.close()
        try:
            self._process.wait(timeout=STOP_GRACE_SECONDS)
        except subprocess.TimeoutExpired:
            with contextlib.suppress(ProcessLookupError, PermissionError):
                os.killpg(self._process.pid, signal.SIGKILL)
            self._process.wait()
        self._cleanup()


class SessionRunner(Protocol):
    def start(self, session_id: str) -> SessionProcess: ...


def _start(argv: list[str], env: dict[str, str], *, stderr: int | None) -> subprocess.Popen[str]:
    return subprocess.Popen(  # noqa: S603  argv is built by the solver, not taken from a request.
        argv,
        cwd=APP_ROOT,
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=stderr,
        text=True,
        start_new_session=True,
    )


class LocalSessionRunner:
    def __init__(self, work_root: Path | None = None) -> None:
        self._root = work_root or Path(os.environ.get("SOLVER_WORK_ROOT") or tempfile.gettempdir())

    def start(self, _session_id: str) -> SessionProcess:
        folder = new_folder(self._root)
        env = session_environment(str(folder), tool_path())
        # Development: the host's log goes to this terminal.
        process = _start([sys.executable, *HOST], env, stderr=None)
        return SessionProcess(process, lambda: remove_inside(folder, self._root))


def session_container_command(name: str, image: str, runtime: str | None) -> list[str]:
    """The `docker run` line for one session."""
    env = session_environment("/work", CONTAINER_PATH)
    flags = isolation_flags(runtime, PRAMAN_SESSION_MEMORY, env)
    entry = [CONTAINER_PYTHON, *HOST]
    return ["docker", "run", "--rm", "--interactive", "--name", name, *flags, image, *entry]


class ContainerSessionRunner:
    def __init__(self, image: str, runtime: str | None = None) -> None:
        self._image = image
        self._runtime = runtime

    def start(self, session_id: str) -> SessionProcess:
        name = f"siliconbox-session-{session_id}"
        client_env = docker_client_env()
        argv = session_container_command(name, self._image, self._runtime)
        # The host's log stays in the container: it may quote learner code (ADR 0031: logs hold
        # ids, timings and outcomes only).
        process = _start(argv, client_env, stderr=subprocess.DEVNULL)
        return SessionProcess(process, lambda: remove_container(name, client_env))
