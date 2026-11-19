"""Runs one job in isolation and returns its result.

Both runners start `app.job_runner` (job JSON on stdin, result JSON on stdout) and enforce a hard
time limit; neither passes a secret to the job.

- LocalRunner: a separate process group on this machine. Development and tests.
- ContainerRunner: a fresh container per job with no network, a read-only root, CPU, memory and
  process caps, no capabilities and a non-root user; gVisor when SOLVER_CONTAINER_RUNTIME=runsc.
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Protocol

from pydantic import ValidationError

from app.limits import (
    RUNNER_CPUS,
    RUNNER_MEMORY,
    RUNNER_PIDS,
    RUNNER_TMP_MB,
    RUNNER_WORK_MB,
)
from app.models import JobResult, JobSpec, error_result
from app.process import ProcessOutcome, run_bounded
from app.tools import tool_path

# Time for lowering, staging and reading results on top of the solver budget.
RUNNER_GRACE_SECONDS = 20
# Starting and removing a container, on top of that.
CONTAINER_GRACE_SECONDS = 15
APP_ROOT = Path(__file__).resolve().parent.parent
CONTAINER_USER = "65534:65534"
# Settings the docker client needs from the worker's environment; nothing reaches the job.
DOCKER_CLIENT_ENV = ("PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG")


class Runner(Protocol):
    def run(self, spec: JobSpec) -> JobResult: ...


def job_environment() -> dict[str, str]:
    """Everything the job process sees. Deliberately no Redis URL, signing key or HOME."""
    return {
        "PATH": tool_path(),
        "SOLVER_WORK_ROOT": os.environ.get("SOLVER_WORK_ROOT") or tempfile.gettempdir(),
        "LANG": "C.UTF-8",
        "PYTHONDONTWRITEBYTECODE": "1",
    }


def _result(outcome: ProcessOutcome, budget: float) -> JobResult:
    if outcome.timed_out:
        return JobResult(
            status="TIMEOUT",
            elapsed_seconds=budget,
            message="The run went over its time limit and was stopped.",
        )
    try:
        return JobResult.model_validate_json(outcome.stdout)
    except ValidationError:
        return error_result("The run stopped unexpectedly.")


def _budget(spec: JobSpec) -> int:
    return spec.settings.timeout_seconds + RUNNER_GRACE_SECONDS


class LocalRunner:
    def run(self, spec: JobSpec) -> JobResult:
        budget = _budget(spec)
        outcome = run_bounded(
            [sys.executable, "-m", "app.job_runner"],
            cwd=APP_ROOT,
            env=job_environment(),
            timeout_seconds=budget,
            stdin_text=spec.model_dump_json(by_alias=True),
        )
        return _result(outcome, budget)


def isolation_flags(runtime: str | None, memory: str, env: dict[str, str]) -> list[str]:
    """The `docker run` flags every job and session container gets; every isolation flag lives
    here: no network, read-only root, tmpfs work and tmp folders, memory without swap, CPU and
    process caps, no capabilities, non-root, and gVisor when `runtime` is runsc."""
    return [
        "--network",
        "none",
        "--read-only",
        "--tmpfs",
        f"/work:rw,nosuid,nodev,size={RUNNER_WORK_MB}m,uid=65534,gid=65534,mode=0700",
        "--tmpfs",
        f"/tmp:rw,nosuid,nodev,noexec,size={RUNNER_TMP_MB}m",  # noqa: S108  Inside the container.
        "--memory",
        memory,
        "--memory-swap",
        memory,
        "--cpus",
        RUNNER_CPUS,
        "--pids-limit",
        str(RUNNER_PIDS),
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--user",
        CONTAINER_USER,
        *[flag for key, value in env.items() for flag in ("--env", f"{key}={value}")],
        *(["--runtime", runtime] if runtime else []),
    ]


def container_command(name: str, image: str, runtime: str | None) -> list[str]:
    """The `docker run` line for one job."""
    flags = isolation_flags(runtime, RUNNER_MEMORY, {"SOLVER_WORK_ROOT": "/work"})
    entry = ["python", "-m", "app.job_runner"]
    return ["docker", "run", "--rm", "--interactive", "--name", name, *flags, image, *entry]


def docker_client_env() -> dict[str, str]:
    """What the docker client needs from this process's environment; nothing reaches a job."""
    return {key: os.environ[key] for key in DOCKER_CLIENT_ENV if key in os.environ}


def remove_container(name: str, client_env: dict[str, str]) -> None:
    """Killing the docker client does not stop its container; remove it by name."""
    run_bounded(
        ["docker", "rm", "--force", name],
        cwd=APP_ROOT,
        env=client_env,
        timeout_seconds=CONTAINER_GRACE_SECONDS,
    )


class ContainerRunner:
    def __init__(self, image: str, runtime: str | None = None) -> None:
        self._image = image
        self._runtime = runtime

    def run(self, spec: JobSpec) -> JobResult:
        name = f"siliconbox-job-{uuid.uuid4()}"
        budget = _budget(spec)
        client_env = docker_client_env()
        try:
            outcome = run_bounded(
                container_command(name, self._image, self._runtime),
                cwd=APP_ROOT,
                env=client_env,
                timeout_seconds=budget + CONTAINER_GRACE_SECONDS,
                stdin_text=spec.model_dump_json(by_alias=True),
            )
        finally:
            remove_container(name, client_env)
        return _result(outcome, budget)
