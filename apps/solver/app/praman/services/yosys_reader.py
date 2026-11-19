"""
Which Yosys front end reads the design for SymbiYosys.

- "slang": the yosys-slang plugin (bundled with the OSS CAD Suite).  Full
  SystemVerilog elaboration including `bind` and hierarchical references,
  so monitors can read signals of sub-instances and of bound checker
  modules (helper logic written next to the assertions).
- "sv": Yosys's built-in `read -sv`.  No bind or hierarchical references:
  bound checkers are instantiated by hand and signals below the checked
  module are connected after flattening (pipeline.prepare).  Used when the
  plugin is not installed, or as a fallback for designs the plugin cannot
  read.

FORMAL_YOSYS_READER=auto|slang|sv overrides the choice (default auto).
"""

from __future__ import annotations

import os
import shutil
import subprocess
from functools import lru_cache

SLANG = "slang"
VERILOG = "sv"
RTLIL = "rtlil"                      # a design Yosys has already read and prepared (one .il file)

# The generated monitors are always read by Yosys's own reader: it maps
# `assert property (s_eventually x)` to liveness cells, and yosys-slang can
# instantiate modules that are already loaded.
MONITOR_FILE = "va_monitors.sv"      # unchanged by sby_generator.sanitize_filename
HARNESS_FILE = "va_harness.sv"       # reset sequence, sanity cover, clock fairness
MONITOR_INSTANCE = "__va_mon"        # the monitor's instance name in the checked module
_OWN_READER = (MONITOR_FILE, HARNESS_FILE)


@lru_cache(maxsize=1)
def slang_available() -> bool:
    if shutil.which("yosys") is None:
        return False
    try:
        result = subprocess.run(["yosys", "-q", "-m", "slang", "-p", "help read_slang"],
                                capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def preferred_reader() -> str:
    choice = os.environ.get("FORMAL_YOSYS_READER", "auto").lower()
    if choice in (SLANG, VERILOG):
        return choice
    return SLANG if slang_available() else VERILOG


def read_commands(files: list[str], top: str, reader: str) -> list[str]:
    """Yosys commands that read `files` (one compilation, so `bind` and
    hierarchical references across files resolve) for top module `top`."""
    # read_verilog, not read: `read` defers elaboration, and yosys-slang only
    # sees modules that are already elaborated
    if reader == RTLIL:
        return [f"read_rtlil {name}" for name in files]
    monitors = [f"read_verilog -sv -formal {name}" for name in files if name in _OWN_READER]
    design = [name for name in files if name not in _OWN_READER]
    if reader == SLANG:
        return monitors + ["plugin -i slang", f"read_slang -D FORMAL {' '.join(design)} --top {top}"]
    return monitors + [f"read -sv -formal {name}" for name in design]
