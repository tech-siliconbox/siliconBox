"""Reads a counterexample or cover trace (VCD) into JSON for the waveform view.

Imported from formal-verify-backend (formal_service.read_counterexample_vcd). Changes: the
result no longer carries the file path (hardening finding 9) and its size is capped.
"""

import logging
from pathlib import Path

from app.limits import MAX_TRACE_SIGNALS, MAX_TRACE_TRANSITIONS

logger = logging.getLogger("solver.vcd")


def read_counterexample_vcd(vcd_path: Path, max_signals: int = MAX_TRACE_SIGNALS) -> dict:
    """
    Read a counterexample VCD file and extract waveform-friendly signal data.
    Returns a compact representation that is still usable by the debug assistant.
    """
    if not vcd_path.is_file():
        return {"error": "trace file not found"}

    try:
        lines = vcd_path.read_text(encoding="utf-8", errors="replace").splitlines()

        var_map: dict[str, dict] = {}
        transitions: list[dict] = []
        timepoints: list[int] = []
        current_time = 0
        definitions_complete = False
        scope_stack: list[str] = []
        timescale = ""

        def normalize_value(raw_value: str) -> str:
            value = raw_value.strip()
            return value.lower() if value else "x"

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if not definitions_complete and line.startswith("$timescale"):
                timescale = line.replace("$timescale", "").replace("$end", "").strip()
                continue

            if not definitions_complete and line.startswith("$scope"):
                parts = line.split()
                if len(parts) >= 3:
                    scope_stack.append(parts[2])
                continue

            if not definitions_complete and line.startswith("$upscope"):
                if scope_stack:
                    scope_stack.pop()
                continue

            if line.startswith("$var"):
                parts = line.split()
                if len(parts) >= 6:
                    var_type = parts[1]
                    try:
                        width = int(parts[2])
                    except ValueError:
                        width = 1
                    symbol = parts[3]
                    name = " ".join(parts[4:-1])
                    full_name = ".".join([*scope_stack, name]) if scope_stack else name
                    scope = ".".join(scope_stack)
                    var_map[symbol] = {
                        "name": name,
                        "full_name": full_name,
                        "scope": scope,
                        "width": width,
                        "type": var_type,
                    }
                continue

            if line.startswith("$enddefinitions"):
                definitions_complete = True
                continue

            if not definitions_complete:
                continue

            if line.startswith("#"):
                try:
                    current_time = int(line[1:])
                    if not timepoints or timepoints[-1] != current_time:
                        timepoints.append(current_time)
                except ValueError:
                    continue
                continue

            if line.startswith("$"):
                continue

            value = ""
            symbol = ""
            if line[0] in "01xXzZuUwWlLhH-":
                value = normalize_value(line[0])
                symbol = line[1:].strip()
            elif line[0] in "bBrR":
                parts = line.split(maxsplit=1)
                if len(parts) == 2:
                    value = normalize_value(parts[0][1:])
                    symbol = parts[1].strip()

            if not symbol or symbol not in var_map:
                continue

            sig = var_map[symbol]
            transitions.append(
                {
                    "time": current_time,
                    "signal": sig["full_name"],
                    "name": sig["name"],
                    "value": value,
                    "width": sig["width"],
                    "type": sig["type"],
                }
            )

        signal_defs = sorted(var_map.values(), key=lambda item: item["full_name"])[:max_signals]
        by_signal: dict[str, list[dict]] = {sig["full_name"]: [] for sig in signal_defs}
        for transition in transitions:
            changes = by_signal.get(transition["signal"])
            if changes is not None and len(changes) < MAX_TRACE_TRANSITIONS:
                changes.append({"time": transition["time"], "value": transition["value"]})

        # Compact shape for the waveform view: one entry per signal with its value changes.
        return {
            "timescale": timescale or "1ns",
            "end_time": max(timepoints, default=0),
            "timepoints": timepoints[:MAX_TRACE_TRANSITIONS],
            "signals": [
                {
                    "name": sig["name"],
                    "full_name": sig["full_name"],
                    "width": sig["width"],
                    "transitions": by_signal[sig["full_name"]],
                }
                for sig in signal_defs
            ],
        }

    except Exception as e:
        logger.error(f"Failed to parse VCD: {e}")
        return {"error": "the trace could not be read"}
