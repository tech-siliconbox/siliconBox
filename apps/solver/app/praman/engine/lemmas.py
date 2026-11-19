"""
E4 (M5): invariants mined from the design, for what k-induction alone cannot prove.

k-induction fails when the step can start from an unreachable state: a
FIFO's count that disagrees with its pointers, an FSM state no transition
reaches.  The step needs a strengthening invariant that rules those states
out.  Candidates come from simple templates over the registers:

  - a small register (2 to 4 bits) never holds a value: `state != 3`, `count != 5`
  - a 1-bit register is constant, or two of them are equal or opposite
  - two registers of the same width are equal
  - a register's low bits are the difference of two others: `count[1:0] == wptr - rptr`
  - while a small register holds a value, two others are equal: `count == 0 -> wptr == rptr`

Each is claimed only once the harness's reset sequence is over (before it,
the registers are still unconstrained):  "after reset: count != 5".  They
are filtered as Houdini does:
  1. base: drop every candidate false in some state reachable within the k
     steps BMC checked (a solver model of the unrolling falsifies a batch at once);
  2. step: drop every candidate the k-induction step of the whole remaining
     set cannot keep (assuming the invariants already proven); repeat.
What survives is proven together by k-induction - base and step - so it
holds in every reachable state and may be assumed in every frame when the
properties are tried again.  Sound for the same reason k-induction is:
nothing unproven is assumed.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional

MAX_REGISTERS = 200           # larger designs: no mining (the candidate set grows quadratically)
MAX_CANDIDATES = 3000
STATE = "\x00"                # placeholder for the state name in a candidate's SMT


@dataclass(frozen=True)
class Candidate:
    text: str                 # readable: "count != 5"
    smt: str                  # Bool SMT over one state, STATE for its name

    def at(self, step: int) -> str:
        return self.smt.replace(STATE, f"s{step}")


def _bits(value: int, width: int) -> str:
    return "#b" + format(value, f"0{width}b")


def candidates(session, limit: int = MAX_CANDIDATES) -> list[Candidate]:
    """Template candidates over the design's registers (not Yosys's own `$...` ones)."""
    smt, top = session.smt, session.top
    regs = []
    for path in session.registers():
        if str(path[-1]).startswith("$"):
            continue
        width = smt.net_width(top, path)
        if width:
            regs.append((".".join(map(str, path)), width, smt.net_expr(top, STATE, path)))
    if len(regs) > MAX_REGISTERS:
        return []
    after = _after_reset(session)
    bools = [r for r in regs if r[1] == 1 and not r[0].startswith(_HARNESS)]
    vectors = [r for r in regs if r[1] > 1 and not r[0].startswith(_HARNESS)]
    out: list[Candidate] = []
    for name, width, e in vectors:                                    # unreachable values
        if width <= 4:
            out += [Candidate(f"{name} != {v}", f"(not (= {e} {_bits(v, width)}))") for v in range(2 ** width)]
    for name, _, e in bools:                                          # constants
        out += [Candidate(f"{name} == 0", f"(not {e})"), Candidate(f"{name} == 1", e)]
    for i, (a, wa, ea) in enumerate(vectors):                         # equal registers
        out += [Candidate(f"{a} == {b}", f"(= {ea} {eb})") for b, wb, eb in vectors[i + 1:] if wb == wa]
    for i, (a, _, ea) in enumerate(bools):
        for b, _, eb in bools[i + 1:]:
            out += [Candidate(f"{a} == {b}", f"(= {ea} {eb})"), Candidate(f"{a} == !{b}", f"(= {ea} (not {eb}))")]
    pairs = [(a, ea, b, eb) for i, (a, wa, ea) in enumerate(vectors) for b, wb, eb in vectors[i + 1:] if wb == wa]
    for x, wx, ex in vectors:                                         # equal while a small register holds a value
        if wx <= 3:
            for v in range(2 ** wx):
                out += [Candidate(f"{x} == {v} -> {a} == {b}", f"(or (not (= {ex} {_bits(v, wx)})) (= {ea} {eb}))")
                        for a, ea, b, eb in pairs if x not in (a, b)]
    for a, wa, ea in vectors:                                         # pointer differences
        if wa > 8:
            continue
        for b, wb, eb in vectors:
            if b == a or wb != wa:
                continue
            for c, wc, ec in vectors:
                if c in (a, b) or wc < wa:
                    continue
                low = ec if wc == wa else f"((_ extract {wa - 1} 0) {ec})"
                out.append(Candidate(f"{c}[{wa - 1}:0] == {a} - {b}", f"(= {low} (bvsub {ea} {eb}))"))
    if after:
        out = [Candidate(f"after reset: {c.text}", f"(or (not {after}) {c.smt})") for c in out]
    return out[:limit]


_HARNESS = "__va_harness."


def _after_reset(session) -> str:
    """The harness's "reset sequence over" (app/services/sva/pipeline.py): its
    counter at RESET_CYCLES (one clock) or in_reset_r low (several); '' if the
    design has no reset."""
    from app.praman.services.sva.compiler import RESET_CYCLES
    smt, top = session.smt, session.top
    for path in session.registers():
        name = ".".join(map(str, path))
        if name == _HARNESS + "reset_cycles":
            return f"(= {smt.net_expr(top, STATE, path)} {_bits(RESET_CYCLES, smt.net_width(top, path))})"
        if name == _HARNESS + "in_reset_r":
            return f"(not {smt.net_expr(top, STATE, path)})"
    return ""


def _and(terms: list[str]) -> str:
    return terms[0] if len(terms) == 1 else f"(and {' '.join(terms)})"


def _holds_everywhere(session, cands: list[Candidate], steps: range) -> list[bool]:
    terms = [_and([c.at(i) for i in steps]) for c in cands]
    return [v in ("true", "#b1") for v in session.smt.get_list(terms)]


def filter_base(base, cands: list[Candidate], k: int, deadline: float) -> Optional[list[Candidate]]:
    """The candidates true in every state reachable within k steps.  `base`
    is a fresh session; frames 0..k-1 are added from the initial state.
    None: the solver gave up or time ran out."""
    for step in range(k):
        base.frame(step)
    alive = list(cands)
    while alive:
        if time.monotonic() > deadline:
            return None
        answer = base.check(f"(not {_and([c.at(i) for c in alive for i in range(k)])})")
        if answer == "unsat":
            base.pop()
            return alive
        if answer != "sat":
            base.pop()
            return None
        keep = _holds_everywhere(base, alive, range(k))
        base.pop()
        alive = [c for c, ok in zip(alive, keep) if ok]
    return alive


def filter_step(session, cands: list[Candidate], k: int, deadline: float,
                extra: list[str]) -> Optional[list[Candidate]]:
    """The largest subset that is k-inductive together, under `extra` (the
    invariants already proven, simple-path constraints).  `session` holds
    frames 0..k without an initial state."""
    alive = list(cands)
    while alive:
        if time.monotonic() > deadline:
            return None
        hypotheses = [c.at(i) for c in alive for i in range(k)]
        answer = session.check(*extra, *hypotheses, f"(not {_and([c.at(k) for c in alive])})")
        if answer == "unsat":
            session.pop()
            return alive
        if answer != "sat":
            session.pop()
            return None
        keep = _holds_everywhere(session, alive, range(k, k + 1))
        session.pop()
        alive = [c for c, ok in zip(alive, keep) if ok]
    return alive
