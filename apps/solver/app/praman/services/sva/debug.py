"""
Explain a counterexample (or cover witness) in terms of the property.

The compiled monitor keeps named wires for every condition of a property,
for the antecedent match and for the failure (see CompiledProperty.debug).
SymbiYosys traces record them, so the explanation reads what the checker
itself computed: the cycle where the antecedent matched, the cycle where
the property failed, and which conditions were false there.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from app.praman.services.yosys_reader import MONITOR_INSTANCE


def explain_trace(vcd_path: str, debug: dict, label: str, kind: str = "ASSERT",
                  live_index: int = 0) -> dict:
    """Per-cycle view of a property's conditions and signals, plus a short
    explanation.  `kind` is "ASSERT" (counterexample), "COVER" (witness) or
    "LIVE" (a liveness obligation still pending at the end of the trace)."""
    live = debug.get("live", [])
    pending_wire = live[live_index]["pending"] if kind == "LIVE" and live_index < len(live) else ""
    scope = debug.get("scope", "")
    mon = f"{scope}.{MONITOR_INSTANCE}"
    replica_wires = debug.get("replica_fail", [])
    locals_ = debug.get("locals", [])
    wanted = {f"{mon}.{c['wire']}" for c in debug.get("conditions", [])}
    wanted |= {f"{mon}.{w}" for w in debug.get("match", []) + replica_wires
               + [debug.get("fail", ""), debug.get("pass", "")] if w}
    wanted |= {f"{mon}.{v['wire']}" for v in locals_}
    if pending_wire:
        wanted.add(f"{mon}.{pending_wire}")
    clock = debug.get("clock", "")
    signal_paths = {port: f"{scope}.{rel}" for port, rel in debug.get("signals", {}).items()
                    if port != clock}
    wanted |= set(signal_paths.values())

    trace = _read_steps(vcd_path, wanted)
    steps = trace["steps"]
    if not steps:
        return {"error": "the trace has no cycles"}

    def bits(path: str) -> list[Optional[int]]:
        return [_as_int(v) for v in trace["values"].get(path, [None] * len(steps))]

    outcome_wire = debug.get("pass" if kind == "COVER" else "fail", "")
    outcome = bits(f"{mon}.{outcome_wire}") if outcome_wire else [None] * len(steps)
    event = next((i for i, v in enumerate(outcome) if v), len(steps) - 1)
    pending_since = None
    if kind == "LIVE":
        # The witness cover fires once the obligation has been pending long
        # enough; the trace may run on a little after that.
        pending = bits(f"{mon}.{pending_wire}") if pending_wire else []
        ends = [i for i, v in enumerate(pending) if v]
        event = ends[-1] if ends else len(steps) - 1
        if ends:
            pending_since = event
            while pending_since > 0 and pending[pending_since - 1]:
                pending_since -= 1

    # Properties with local variables run one replica per start phase; only
    # the replica that produced the event is relevant.
    replica = next((r for r, w in enumerate(replica_wires) if bits(f"{mon}.{w}")[event]), None)

    match_values = [bits(f"{mon}.{w}") for w in debug.get("match", [])]
    triggers = [i for i in range(len(steps)) if any(m[i] for m in match_values)]
    limit = pending_since if pending_since is not None else event
    trigger = max((t for t in triggers if t <= limit), default=None)

    antecedent = None
    for a in debug.get("antecedents", []):
        values = bits(f"{mon}.{a['match']}")
        if trigger is not None and values[trigger] and a.get("text"):
            length = a.get("length")
            antecedent = {"text": a["text"], "end": trigger,
                          "start": trigger - length + 1 if length else None}
            break

    conditions = []
    for c in debug.get("conditions", []):
        if c.get("replica") not in (None, replica) or _constant(c["text"]):
            continue
        if clock and c["text"] in (clock, f"!{clock}"):
            continue
        values = bits(f"{mon}.{c['wire']}")[: event + 1]
        row = {"text": c["text"], "role": c["role"], "values": values}
        if any(r["text"] == row["text"] and r["role"] == row["role"] for r in conditions):
            # same condition at another position in the sequence: keep one row,
            # true whenever any of them is
            prev = next(r for r in conditions if r["text"] == row["text"] and r["role"] == row["role"])
            prev["values"] = [_any(a, b) for a, b in zip(prev["values"], values)]
            continue
        conditions.append(row)

    signals = []
    for port, path in signal_paths.items():
        raw = trace["values"].get(path)
        if raw is None:
            continue
        width = trace["widths"].get(path, 1)
        signals.append({"name": port, "path": path, "width": width,
                        "values": [_fmt(v, width) for v in raw[: event + 1]]})
    local_values = []
    for v in locals_:
        if v["replica"] != replica:
            continue
        path = f"{mon}.{v['wire']}"
        raw = trace["values"].get(path)
        if raw is None:
            continue
        width = trace["widths"].get(path, v.get("width", 1))
        local_values.append({"name": v["var"], "width": width,
                             "values": [_fmt(x, width) for x in raw[: event + 1]]})

    if kind == "LIVE":
        lines = _explain_live(label, event, pending_since, antecedent, conditions, signals)
    else:
        lines = _explain(label, kind, event, trigger, antecedent, conditions, signals, local_values)
    return {
        "cycles": list(range(event + 1)),
        "event_cycle": event,
        "trigger_cycle": trigger,
        "pending_since": pending_since,
        "antecedent": antecedent,
        "conditions": conditions,
        "signals": signals,
        "locals": local_values,
        "signal_paths": [s["path"] for s in signals],
        "explanation": lines,
    }


def _explain(label, kind, event, trigger, antecedent, conditions, signals, local_values) -> list[str]:
    named = signals + local_values

    def value_of(name: str, cycle: int) -> str:
        sig = next((s for s in named if s["name"] == name), None)
        return sig["values"][cycle] if sig and cycle < len(sig["values"]) else "?"

    def mentioned(text: str) -> list[str]:
        return [s["name"] for s in named if re.search(rf'\b{re.escape(s["name"])}\b', text)]

    def describe(cond, cycle: int) -> str:
        shown = [f"{n} = {value_of(n, cycle)}" for n in mentioned(cond["text"])]
        return f"`{cond['text']}`" + (f" ({', '.join(shown)})" if shown else "")

    lines = []
    if kind == "COVER":
        lines.append(f"`{label}` is reached at cycle {event}.")
        # each condition at the last cycle it held: the steps of the sequence
        by_cycle: dict[int, list[str]] = {}
        for c in conditions:
            last = max((i for i, v in enumerate(c["values"]) if v == 1), default=None)
            if last is not None:
                by_cycle.setdefault(last, []).append(describe(c, last))
        for cycle in sorted(by_cycle):
            lines.append(f"Cycle {cycle}: " + "; ".join(by_cycle[cycle]) + " held.")
        return lines

    lines.append(f"`{label}` fails at cycle {event}.")
    ante = [c for c in conditions if c["role"] == "antecedent"]
    cons = [c for c in conditions if c["role"] == "consequent"]
    if antecedent is not None:
        span = (f"cycles {antecedent['start']}-{antecedent['end']}"
                if antecedent["start"] is not None and antecedent["start"] != antecedent["end"]
                else f"cycle {antecedent['end']}")
        lines.append(f"The antecedent `{antecedent['text']}` matched in {span}, "
                     "so the consequent is required.")
    elif trigger is not None and ante:
        held = [describe(c, trigger) for c in ante if _at(c, trigger) == 1]
        text = "; ".join(held) if held else "the antecedent sequence completed"
        lines.append(f"Cycle {trigger}: the antecedent matched ({text}), so the consequent is required.")
    for v in local_values:
        lines.append(f"Local variable `{v['name']}` holds {value_of(v['name'], event)} at cycle {event}.")
    focus = cons or [c for c in conditions if c["role"] != "antecedent"] or conditions
    false_now = [describe(c, event) for c in focus if _at(c, event) == 0]
    true_now = [describe(c, event) for c in focus if _at(c, event) == 1]
    if false_now:
        lines.append(f"Cycle {event}: the property needed " + " and ".join(false_now)
                     + " to be true, but " + ("it was" if len(false_now) == 1 else "they were") + " false.")
    elif true_now:
        lines.append(f"Cycle {event}: " + "; ".join(true_now)
                     + " held, but the sequence required at this point did not complete as written.")
    return lines


def _explain_live(label, event, since, antecedent, conditions, signals) -> list[str]:
    lines = [f"`{label}` has an obligation that is never fulfilled: the prover showed it "
             f"can stay pending forever."]
    if antecedent is not None:
        lines.append(f"The antecedent `{antecedent['text']}` matched at cycle {antecedent['end']}, "
                     "which started the obligation.")
    if since is not None:
        lines.append(f"In this trace it is pending from cycle {since} to cycle {event}"
                     f" ({event - since + 1} cycles).")
    waiting = [c for c in conditions if c["role"] != "antecedent"
               and all(v == 0 for v in c["values"][since or 0:event + 1])]
    if waiting:
        lines.append("Never true while pending: " + ", ".join(f"`{c['text']}`" for c in waiting) + ".")
    return lines


def _constant(text: str) -> bool:
    return bool(re.fullmatch(r"(\d+'[bBdDhH])?[01]|true|false", text.strip()))


def _any(a: Optional[int], b: Optional[int]) -> Optional[int]:
    if a == 1 or b == 1:
        return 1
    return None if a is None or b is None else 0


def _at(cond, cycle: int) -> Optional[int]:
    values = cond["values"]
    return values[cycle] if cycle < len(values) else None


# ── VCD reading ──────────────────────────────────────────────

def _read_steps(vcd_path: str, wanted: set[str]) -> dict:
    """Values of `wanted` signals at each solver step (via smt_step)."""
    ids: dict[str, list[str]] = {}       # vcd id -> full names
    widths: dict[str, int] = {}
    step_id = None
    scopes: list[str] = []
    current: dict[str, str] = {}
    samples: dict[int, dict[str, str]] = {}
    in_defs = True

    for raw in Path(vcd_path).read_text(errors="replace").splitlines():
        line = raw.strip()
        if not line:
            continue
        if in_defs:
            if line.startswith("$scope"):
                scopes.append(line.split()[2])
            elif line.startswith("$upscope"):
                if scopes:
                    scopes.pop()
            elif line.startswith("$var"):
                parts = line.split()
                width, code, name = int(parts[2]), parts[3], parts[4]
                full = ".".join(scopes + [name])
                if name == "smt_step" and not scopes:
                    step_id = code
                if full in wanted or code == step_id:
                    ids.setdefault(code, []).append(full)
                    widths[full] = width
            elif line.startswith("$enddefinitions"):
                in_defs = False
            continue
        if line.startswith("#"):
            _record(current, step_id, samples)
            continue
        if line[0] in "bB":
            value, code = line[1:].split()
        elif line[0] in "01xXzZ":
            value, code = line[0], line[1:]
        else:
            continue
        if code in ids:
            current[code] = value
    _record(current, step_id, samples)

    steps = sorted(samples)
    values: dict[str, list[str]] = {}
    for code, names in ids.items():
        if code == step_id:
            continue
        series = [samples[s].get(code, "x") for s in steps]
        for name in names:
            values[name] = series
    return {"steps": steps, "values": values, "widths": widths}


def _record(current: dict[str, str], step_id: Optional[str], samples: dict[int, dict[str, str]]) -> None:
    """Keep the first complete sample of each step."""
    if step_id is None or step_id not in current:
        return
    step = _as_int(current[step_id])
    if step is not None and step not in samples:
        samples[step] = dict(current)


def _as_int(value: Optional[str]) -> Optional[int]:
    if value is None or any(c in value.lower() for c in "xz"):
        return None
    try:
        return int(value, 2)
    except ValueError:
        return None


def _fmt(value: str, width: int) -> str:
    n = _as_int(value)
    if n is None:
        return "x"
    if width == 1:
        return str(n)
    return f"{width}'h{n:x}"
