"""The one place work folders are named, made and removed (hardening finding 1).

The old service joined a request's `project_name` onto the work folder and passed the result
to shutil.rmtree, so "../../something" deleted other directories. Here folder names are
server-made UUIDs, and a delete happens only after the resolved path is confirmed to sit
strictly inside the work root.
"""

import shutil
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


class UnsafePathError(ValueError):
    """A path resolved outside the work root (or to the root itself)."""


def remove_inside(path: Path, root: Path) -> None:
    resolved_root = root.resolve()
    resolved = path.resolve()
    if resolved == resolved_root or not resolved.is_relative_to(resolved_root):
        raise UnsafePathError(str(path))
    shutil.rmtree(resolved)


@contextmanager
def job_folder(work_root: Path) -> Iterator[Path]:
    """A fresh folder for one job, removed afterwards whatever happens."""
    folder = work_root.resolve() / str(uuid.uuid4())
    folder.mkdir(mode=0o700)
    try:
        yield folder
    finally:
        remove_inside(folder, work_root)


def check_folder(job_dir: Path, index: int) -> Path:
    """Where check number `index` of a job is staged; created by the stager."""
    return job_dir / f"check-{index:03d}"
