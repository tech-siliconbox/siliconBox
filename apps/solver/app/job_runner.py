"""Entry point inside the sandbox: a job as JSON on stdin, its result as JSON on stdout.

The runner starts this as a separate process (later, a separate container) per job, so a
hostile design that hangs the parser or the solver is killed with everything it started.
This process receives no secrets: only PATH and the work root (see app.runners).
"""

import os
import sys
import tempfile
from pathlib import Path

from pydantic import ValidationError

from app.models import JobResult, JobSpec, error_result
from app.pipeline import run_pipeline
from app.tools import SbyTool
from app.workspace import job_folder

MAX_INPUT_BYTES = 1024 * 1024


def run_job(raw: bytes) -> JobResult:
    try:
        spec = JobSpec.model_validate_json(raw)
    except ValidationError:
        return error_result("The job was not valid.")
    sby = SbyTool.locate()
    if sby is None:
        return error_result("The formal tools are not installed on this runner.")
    work_root = Path(os.environ.get("SOLVER_WORK_ROOT") or tempfile.gettempdir())
    with job_folder(work_root) as folder:
        return run_pipeline(spec, folder, sby)


def main() -> None:
    raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    result = error_result("The job is too large.") if len(raw) > MAX_INPUT_BYTES else run_job(raw)
    sys.stdout.write(result.model_dump_json(by_alias=True))


if __name__ == "__main__":
    main()
