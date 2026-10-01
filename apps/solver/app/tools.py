"""Finds and runs SymbiYosys with a minimal environment: no secrets reach the tool."""

import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from app.process import ProcessOutcome, run_bounded

# Seconds sby gets beyond its own [options] timeout to shut down cleanly before the kill.
SBY_GRACE_SECONDS = 5


def tool_path() -> str:
    """PATH for the tools: the OSS CAD Suite path in the image, plus this Python for sby."""
    configured = os.environ.get("SOLVER_TOOL_PATH") or os.environ.get("PATH", "")
    return os.pathsep.join([str(Path(sys.executable).parent), configured])


@dataclass(frozen=True)
class SbyTool:
    executable: str
    path: str

    @classmethod
    def locate(cls) -> "SbyTool | None":
        path = tool_path()
        executable = shutil.which("sby", path=path)
        return cls(executable, path) if executable else None

    def run(self, sby_file: Path, timeout_seconds: int) -> ProcessOutcome:
        folder = sby_file.parent
        return run_bounded(
            [self.executable, "-f", sby_file.name],
            cwd=folder,
            env={"PATH": self.path, "HOME": str(folder), "LANG": "C.UTF-8"},
            timeout_seconds=timeout_seconds + SBY_GRACE_SECONDS,
        )
