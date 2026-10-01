"""Runs one job in isolation and returns its result.

LocalRunner: a separate process group with a hard time limit and no secrets in its
environment. Used for development and tests. The container runner (one container per job,
no network, read-only root, CPU and memory caps) comes with the runner image in phase 3.
"""

import os
import sys
import tempfile
from pathlib import Path
from typing import Protocol

from pydantic import ValidationError

from app.models import JobResult, JobSpec, error_result
from app.process import run_bounded
from app.tools import tool_path

# Time for lowering, staging and reading results on top of the solver budget.
RUNNER_GRACE_SECONDS = 20
APP_ROOT = Path(__file__).resolve().parent.parent


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


class LocalRunner:
    def run(self, spec: JobSpec) -> JobResult:
        budget = spec.settings.timeout_seconds + RUNNER_GRACE_SECONDS
        outcome = run_bounded(
            [sys.executable, "-m", "app.job_runner"],
            cwd=APP_ROOT,
            env=job_environment(),
            timeout_seconds=budget,
            stdin_text=spec.model_dump_json(by_alias=True),
        )
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
