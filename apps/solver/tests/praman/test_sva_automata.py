"""
Differential test of the sequence automata against a direct implementation
of IEEE 1800-2017 sequence semantics (16.7-16.9): for random sequences over
three boolean atoms and random traces, the set of ticks at which a match
ends must be identical.
"""

import random
from typing import Optional

import pytest

from app.praman.services.sva import automata as A

ATOMS = (0, 1, 2)


# ── Mini sequence language (tuples) and its reference semantics ─────────

def ends(seq, trace, t) -> set[int]:
    """Ticks at which a match of `seq` starting at tick t ends."""
    n = len(trace)
    if t >= n:
        return set()
    op = seq[0]
    if op == "b":                       # ("b", atom, polarity)
        return {t} if trace[t][seq[1]] == seq[2] else set()
    if op == "cat":                     # ("cat", s1, lo, hi, s2)
        _, s1, lo, hi, s2 = seq
        out = set()
        for e1 in ends(s1, trace, t):
            top = n - 1 - e1 if hi is None else hi
            for k in range(lo, top + 1):
                out |= ends(s2, trace, e1 + k)
        return out
    if op == "rep":                     # ("rep", s, lo, hi)  lo >= 1
        _, s, lo, hi = seq
        out, frontier, k = set(), ends(s, trace, t), 1
        limit = n if hi is None else hi
        while frontier and k <= limit:
            if k >= lo:
                out |= frontier
            frontier = {e2 for e1 in frontier for e2 in ends(s, trace, e1 + 1)}
            k += 1
        return out
    if op == "or":
        return ends(seq[1], trace, t) | ends(seq[2], trace, t)
    if op == "intersect":
        return ends(seq[1], trace, t) & ends(seq[2], trace, t)
    if op == "and":
        return {max(a, b) for a in ends(seq[1], trace, t) for b in ends(seq[2], trace, t)}
    if op == "within":                  # s1 within s2
        out = set()
        for e2 in ends(seq[2], trace, t):
            for t1 in range(t, e2 + 1):
                if any(e1 <= e2 for e1 in ends(seq[1], trace, t1)):
                    out.add(e2)
                    break
        return out
    if op == "throughout":              # ("throughout", atom, s)
        _, b, s = seq
        return {e for e in ends(s, trace, t) if all(trace[k][b] for k in range(t, e + 1))}
    if op == "goto":                    # ("goto", atom, lo, hi)
        _, b, lo, hi = seq
        out, count = set(), 0
        for k in range(t, n):
            if trace[k][b]:
                count += 1
                if count >= lo and (hi is None or count <= hi):
                    out.add(k)
        return out
    if op == "noncons":                 # ("noncons", atom, lo, hi)
        _, b, lo, hi = seq
        out, count = set(), 0
        for k in range(t, n):
            if trace[k][b]:
                count += 1
            if count >= lo and (hi is None or count <= hi) and count >= 1:
                out.add(k)
        return out
    if op == "first":                   # first_match(s): the earliest end only
        found = ends(seq[1], trace, t)
        return {min(found)} if found else set()
    raise ValueError(op)


def build(seq) -> A.NFA:
    op = seq[0]
    if op == "b":
        return A.atom_nfa(A.lit(seq[1], seq[2]))
    if op == "cat":
        _, s1, lo, hi, s2 = seq
        return A.concat_delay(build(s1), lo, hi, build(s2))
    if op == "rep":
        return A.repeat(build(seq[1]), seq[2], seq[3])
    if op == "or":
        return A.union(build(seq[1]), build(seq[2]))
    if op == "intersect":
        return A.intersect(build(seq[1]), build(seq[2]))
    if op == "and":
        return A.seq_and(build(seq[1]), build(seq[2]))
    if op == "within":
        return A.within(build(seq[1]), build(seq[2]))
    if op == "throughout":
        return A.throughout(A.lit(seq[1]), build(seq[2]))
    if op == "goto":
        return A.goto(seq[1], seq[2], seq[3])
    if op == "noncons":
        return A.nonconsecutive(seq[1], seq[2], seq[3])
    if op == "first":
        return A.first_match(build(seq[1]))
    raise ValueError(op)


def nfa_ends(nfa: A.NFA, trace, t) -> set[int]:
    states, out = frozenset(nfa.init), set()
    for k in range(t, len(trace)):
        states, matched = A._step_nfa(nfa, states, trace[k])
        if matched:
            out.add(k)
        if not states:
            break
    return out


# ── Random generation ───────────────────────────────────────────────

def rand_range(rng, lo_max=2, span=2) -> tuple[int, Optional[int]]:
    lo = rng.randint(0, lo_max)
    hi = None if rng.random() < 0.2 else lo + rng.randint(0, span)
    return lo, hi


def rand_seq(rng, depth: int):
    if depth == 0 or rng.random() < 0.3:
        return ("b", rng.choice(ATOMS), rng.random() < 0.7)
    op = rng.choice(["cat", "cat", "rep", "or", "intersect", "and", "within",
                     "throughout", "goto", "noncons", "first"])
    if op == "cat":
        lo, hi = rand_range(rng)
        return ("cat", rand_seq(rng, depth - 1), lo, hi, rand_seq(rng, depth - 1))
    if op == "rep":
        lo = rng.randint(1, 2)
        hi = None if rng.random() < 0.3 else lo + rng.randint(0, 1)
        return ("rep", rand_seq(rng, depth - 1), lo, hi)
    if op in ("goto", "noncons"):
        lo = rng.randint(1, 2)
        hi = None if rng.random() < 0.3 else lo + rng.randint(0, 1)
        return (op, rng.choice(ATOMS), lo, hi)
    if op == "throughout":
        return ("throughout", rng.choice(ATOMS), rand_seq(rng, depth - 1))
    if op == "first":
        return ("first", rand_seq(rng, depth - 1))
    return (op, rand_seq(rng, depth - 1), rand_seq(rng, depth - 1))


def rand_trace(rng, length: int):
    return [{a: rng.random() < 0.5 for a in ATOMS} for _ in range(length)]


@pytest.mark.parametrize("seed", range(40))
def test_sequence_automata_match_reference_semantics(seed):
    rng = random.Random(seed)
    for _ in range(25):
        seq = rand_seq(rng, depth=3)
        try:
            nfa = build(seq)
        except A.AutomatonTooLarge:
            continue
        for _ in range(8):
            trace = rand_trace(rng, rng.randint(1, 9))
            for t in range(len(trace)):
                assert nfa_ends(nfa, trace, t) == ends(seq, trace, t), (seq, trace, t)


def test_weak_sequence_property_outcomes():
    # a ##1 b as a property: PASS when b follows a, FAIL otherwise
    nfa = A.concat_delay(A.atom_nfa(A.lit(0)), 1, 1, A.atom_nfa(A.lit(1)))
    p = A.pdfa_from_sequence(nfa)

    def run(trace):
        s = 0
        for valuation in trace:
            o = A._outcome(p, s, valuation)
            if o[0] != A.GO:
                return o[0]
            s = o[1]
        return "pending"

    assert run([{0: True, 1: False}, {0: False, 1: True}]) == A.PASS
    assert run([{0: True, 1: False}, {0: False, 1: False}]) == A.FAIL
    assert run([{0: False, 1: True}]) == A.FAIL
    assert run([{0: True, 1: False}]) == "pending"
    assert A.pdfa_not(p).table[0][1] != p.table[0][1]
