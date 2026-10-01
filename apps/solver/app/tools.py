"""Finds and runs SymbiYosys with a minimal environment: no secrets reach the tool."""

import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from app.process import ProcessOutcome, run_bounded

# Seconds sby gets beyond its own [options] timeout to shut down cleanly before the kill.
SBY_GRACE_SECONDS = 5


SYSTEM_PATH = "/usr/local/bin:/usr/bin:/bin"


def tool_path() -> str:
    """PATH for the tools: this Python (for sby on a developer machine), the OSS CAD Suite in the
    image, then the system folders its launcher scripts need (bash, env)."""
    parts = [
        str(Path(sys.executable).parent),
        os.environ.get("SOLVER_TOOL_PATH", ""),
        os.environ.get("PATH") or SYSTEM_PATH,
    ]
    return os.pathsep.join(part for part in parts if part)


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
