"""
Reset analysis: which registers the reset does not set.

The design is simulated by Yosys from an unknown state (every register x),
with the reset held for a few cycles; a register still (partly) x after it
has no reset value.  In a proof such a register starts from any value, so a
property may fail on a state no real chip powers up in - or, worse, pass
because of what it was assumed to start from.  JasperGold reports the same
after its reset analysis.

The checker's and the harness's own registers (__va_*) are left out.
"""

from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path

from app.praman.services.proc import run_tree

INTERNAL = re.compile(r"(^|\.)__va_|(^|\.)__pm_|^\$")
FLOPS = re.compile(r"^\$_?(a?l?dff|sdff|adff|dffsr|dffe|adffe|sdffe|sdffce|aldffe|dffsre)")


def analyze_reset(prepared, clock: str, reset: str, active_low: bool, cycles: int = 2, timeout: int = 300) -> dict:
    """{"registers": n, "not_reset": [{name, bits, all}]} or {"error": ...}."""
    from app.praman.services.formal_service import MONITOR_FILE
    from app.praman.services.sby_generator import sanitize_filename
    from app.praman.services.yosys_reader import read_commands
    with tempfile.TemporaryDirectory(prefix="pm_reset_") as tmp:
        files = prepared.sources(0)
        files[MONITOR_FILE] = prepared.monitor_text
        names = []
        for name, text in files.items():
            clean = sanitize_filename(name)
            (Path(tmp) / clean).write_text(text)
            names.append(clean)
        script = "; ".join([
            *read_commands(names, prepared.top, prepared.reader), *(prepared.script or []),
            f"prep -top {prepared.top}", "flatten", "chformal -remove", "opt_clean",    # (sim does not take formal cells)
            f"sim -clock {clock} -{'resetn' if active_low else 'reset'} {reset} -rstlen {cycles} -n {cycles} -w -q",
            "write_json state.json",
        ])
        done = run_tree(["yosys", "-q", "-p", script], timeout=timeout, cwd=tmp)
        state = Path(tmp) / "state.json"
        if done.returncode != 0 or not state.exists():
            why = [l for l in (done.stderr or done.stdout or "").splitlines() if "ERROR" in l]
            return {"error": "the reset could not be simulated: " + (why[-1].strip() if why else "Yosys failed")}
        design = json.loads(state.read_text())
    module = design.get("modules", {}).get(prepared.top)
    if module is None:
        return {"error": f'the top module "{prepared.top}" was not found after simulation'}
    return registers_without_reset(module)


def registers_without_reset(module: dict) -> dict:
    """From a Yosys JSON module after `sim -w`: the registers whose state is x."""
    # every bit a flip-flop drives, and the state sim wrote back (init attributes, MSB first)
    flop_bits = set()
    for cell in module.get("cells", {}).values():
        if FLOPS.match(cell.get("type", "")):
            flop_bits.update(b for b in cell.get("connections", {}).get("Q", []) if isinstance(b, int))
    init_of: dict[int, str] = {}
    for net in module.get("netnames", {}).values():
        init = net.get("attributes", {}).get("init")
        if init:
            for bit, value in zip(net["bits"], reversed(_bits(init, len(net["bits"])))):
                if isinstance(bit, int):
                    init_of[bit] = value
    registers, loose = 0, []
    seen: set[int] = set()
    # name each register by its most readable net (no $, the shortest path)
    nets = sorted(module.get("netnames", {}).items(), key=lambda kv: (kv[1].get("hide_name", 0), kv[0].count("."), kv[0]))
    for name, net in nets:
        bits = [b for b in net["bits"] if isinstance(b, int) and b in flop_bits]
        if not bits or net.get("hide_name") or INTERNAL.search(name) or all(b in seen for b in bits):
            continue
        seen.update(bits)
        registers += 1
        unknown = [b for b in bits if init_of.get(b, "x") not in ("0", "1")]
        if unknown:
            loose.append({"name": name, "bits": len(bits), "all": len(unknown) == len(bits)})
    return {"registers": registers, "not_reset": loose}


def _bits(init, width: int) -> str:
    """The init attribute as a string of bits, MSB first (JSON gives it as bits or a number)."""
    text = str(init)
    if re.fullmatch(r"[01xz]+", text):
        return text.rjust(width, "0")[-width:]
    try:
        return format(int(text), f"0{width}b")[-width:]
    except ValueError:
        return "x" * width
