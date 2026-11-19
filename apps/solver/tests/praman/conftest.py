"""Praman's tests (ported from formal-verify): skip markers for the formal tools they need."""

import os
import shutil
import subprocess

import pytest

from app.praman.tclhost import tclsh_path

# CI sets SOLVER_REQUIRE_SBY: the Praman tests then also need Tcl, never skipped by accident.
if os.environ.get("SOLVER_REQUIRE_SBY") == "1" and tclsh_path() is None:
    raise RuntimeError("SOLVER_REQUIRE_SBY is set but tclsh was not found on PATH")


def _sby_runs() -> bool:
    if shutil.which("sby") is None:
        return False
    try:
        done = subprocess.run(["sby", "--help"], capture_output=True, timeout=30, check=False)  # noqa: S607
    except (OSError, subprocess.TimeoutExpired):
        return False
    return done.returncode == 0


def _slang_plugin() -> bool:
    from app.praman.services.yosys_reader import slang_available

    return slang_available()


requires_yosys = pytest.mark.skipif(shutil.which("yosys") is None, reason="yosys not in PATH")
requires_sby = pytest.mark.skipif(
    shutil.which("yosys") is None or not _sby_runs(),
    reason="yosys/sby not available (OSS CAD Suite)",
)
requires_yosys_slang = pytest.mark.skipif(
    not _sby_runs() or not _slang_plugin(),
    reason="yosys-slang plugin not available (OSS CAD Suite)",
)
requires_suprove = pytest.mark.skipif(
    not _sby_runs() or shutil.which("suprove") is None,
    reason="suprove (OSS CAD Suite) not available",
)
