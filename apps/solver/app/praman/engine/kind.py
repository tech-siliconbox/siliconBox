"""
E2: k-induction (docs/agent/PRD.md §9.3, M3.4/M3.5).

Invariants are proven jointly, as yosys-smtbmc does: from any k
consecutive states (no initial state) that satisfy the assumptions and all
invariants of the set, every invariant holds in the next state.  Together
with the bounded check of the same depth (the base case, run_bmc) this
proves them for all reachable states.  When the step fails, the
invariants the counterexample-to-induction (CTI) violates leave the set
and the rest is tried again: what remains is proven together.

An invariant is an assertion, or "this cover is never reached" (the
cover's negation) - which proves a cover UNREACHABLE and an antecedent
never matching (vacuity).

E4 (M5): an invariant the step drops is tried once more on simple paths -
the k + 1 states pairwise different - with the invariants already proven
assumed in every state (they hold in every reachable state).  A loop
through unreachable states (a counter above its bound wrapping back) is
what defeats plain k-induction; on simple paths k-induction is complete
once k exceeds the longest such path.  Sound: a counterexample on a path
that repeats a state also exists on a shorter path without the repetition.

E4, second step: what is still dropped is tried once more with invariants
mined from the design (app/engine/lemmas.py), themselves proven by
k-induction first, assumed in every frame.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable, Optional


@dataclass
class InductionResult:
    proven: set[str] = field(default_factory=set)
    k: int = 0
    timed_out: bool = False
    unknown: str = ""
    cti: dict[str, int] = field(default_factory=dict)       # label -> round it was dropped
    simple_path: set[str] = field(default_factory=set)      # proven only on simple paths (E4)
    with_lemmas: set[str] = field(default_factory=set)      # proven only with mined invariants (E4)
    lemmas: list[str] = field(default_factory=list)         # the mined invariants, proven, readable


def run_induction(session, invariants: dict[str, str], k: int, deadline: float,
                  simple_path: bool = True, base_session: Optional[Callable] = None) -> InductionResult:
    """invariants: label -> "assert" | "cover" (for a cover: never reached).
    `session` must be fresh; k + 1 frames are added without an initial state.
    `base_session`: makes a fresh session of the same model, for the base
    case of mined invariants; None: no mining."""
    result = InductionResult(k=k)
    if not invariants or k < 1:
        return result

    def holds(label: str, step: int) -> str:
        e = session.expr(label, step)
        return e if invariants[label] == "assert" else f"(not {e})"

    for step in range(k + 1):
        session.frame(step, init=False)
    _joint(session, invariants, list(invariants), k, deadline, holds, result, [])
    dropped = [l for l in invariants if l not in result.proven]
    if simple_path and dropped and not result.timed_out and not result.unknown:
        known = [holds(l, i) for l in result.proven for i in range(k + 1)]
        distinct = [f"(not {session.same_state(i, j)})" for i in range(k + 1) for j in range(i + 1, k + 1)]
        before = set(result.proven)
        _joint(session, invariants, dropped, k, deadline, holds, result, known + distinct)
        result.simple_path = result.proven - before
    dropped = [l for l in invariants if l not in result.proven]
    if base_session is not None and dropped and not result.timed_out and not result.unknown:
        _with_lemmas(session, base_session, invariants, dropped, k, deadline, holds, result, simple_path)
    return result


def _with_lemmas(session, base_session, invariants: dict, dropped: list[str], k: int, deadline: float, holds,
                 result: InductionResult, simple_path: bool) -> None:
    from app.praman.engine.lemmas import candidates, filter_base, filter_step
    cands = candidates(session)
    if not cands:
        return
    base = base_session()
    try:
        alive = filter_base(base, cands, k, deadline)
    finally:
        base.close()
    known = [holds(l, i) for l in result.proven for i in range(k + 1)]
    distinct = [f"(not {session.same_state(i, j)})" for i in range(k + 1) for j in range(i + 1, k + 1)] \
        if simple_path else []
    alive = filter_step(session, alive, k, deadline, known + distinct) if alive else alive
    if not alive:
        return
    before = set(result.proven)
    lemmas = [c.at(i) for c in alive for i in range(k + 1)]
    _joint(session, invariants, dropped, k, deadline, holds, result, known + distinct + lemmas)
    result.with_lemmas = result.proven - before
    if result.with_lemmas:
        result.lemmas = [c.text for c in alive]


def _joint(session, invariants: dict, remaining: list[str], k: int, deadline: float, holds, result: InductionResult,
           extra: list[str]) -> None:
    """Joint k-induction of `remaining` under the `extra` constraints; adds what it proves."""
    rounds = 0
    while remaining:
        if time.monotonic() > deadline:
            result.timed_out = True
            return
        rounds += 1
        hypotheses = [holds(label, i) for i in range(k) for label in remaining]
        goal = [holds(label, k) for label in remaining]
        answer = session.check(*extra, *hypotheses,
                               "(not (and %s))" % " ".join(goal) if len(goal) > 1 else f"(not {goal[0]})")
        if answer == "unsat":
            session.pop()
            result.proven |= set(remaining)
            return
        if answer != "sat":
            session.pop()
            result.unknown = answer
            return
        dropped = [label for label in remaining if not session.true_in_model(holds(label, k))]
        session.pop()
        for label in dropped:
            result.cti.setdefault(label, rounds)
        remaining = [label for label in remaining if label not in dropped]
