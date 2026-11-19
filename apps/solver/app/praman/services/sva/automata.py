"""
Automata for SVA sequences and properties (tool independent).

Sequences become *tick automata* (NFA): every transition consumes exactly one
clock tick and carries a guard, a conjunction of boolean atoms.  An attempt
starting at tick t sits in the initial states before consuming tick t; a
match ends at tick u when a transition into a final state fires at u.  With
this form the SVA sequence operators are standard constructions:
concatenation and fusion (##1 / ##0), delay ranges, repetition, `or` (union),
`intersect` (product) and `throughout` (guard conjunction); `and`, `within`,
goto and non-consecutive repetition are rewritten with the IEEE 1800-2017
identities (16.9).

Properties become *per-attempt deterministic automata* (PDFA): each state
has a transition table over the valuations of the atoms it reads, with
outcomes GO(state), PASS (non-vacuous or vacuous) or FAIL.  Because a
PDFA state fully determines an attempt's future, the monitor may merge all
attempts that sit in the same state (one bit per state), which keeps
failure detection exact without per-attempt storage.

Sizes are bounded (MAX_STATES, MAX_ATOMS_PER_STATE); exceeding a bound
raises AutomatonTooLarge, reported per property.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from typing import Optional

MAX_STATES = 512
MAX_ATOMS_PER_STATE = 12
MAX_UNROLL = 256          # largest repetition count / delay expanded into states


class AutomatonTooLarge(Exception):
    pass


# ── Guards: conjunctions of literals over atom ids ─────────────

Conj = frozenset          # frozenset[tuple[int, bool]]; empty = true
TRUE: Conj = frozenset()


def conj(*parts: Conj) -> Optional[Conj]:
    """Conjunction of guards; None if contradictory."""
    lits: dict[int, bool] = {}
    for part in parts:
        for atom, pol in part:
            if lits.get(atom, pol) != pol:
                return None
            lits[atom] = pol
    return frozenset(lits.items())


def lit(atom: int, pol: bool = True) -> Conj:
    return frozenset({(atom, pol)})


def holds(guard: Conj, valuation: dict[int, bool]) -> bool:
    return all(valuation[a] == p for a, p in guard)


# ── Sequence automata ────────────────────────────────────────

@dataclass
class NFA:
    n: int = 0
    trans: list[tuple[int, Conj, int]] = field(default_factory=list)
    init: set[int] = field(default_factory=set)
    final: set[int] = field(default_factory=set)

    def new_state(self) -> int:
        self.n += 1
        if self.n > MAX_STATES:
            raise AutomatonTooLarge(f"sequence needs more than {MAX_STATES} states")
        return self.n - 1

    def absorb(self, other: "NFA") -> int:
        """Copy `other`'s states in; returns the offset of its states."""
        off = self.n
        self.n += other.n
        if self.n > MAX_STATES:
            raise AutomatonTooLarge(f"sequence needs more than {MAX_STATES} states")
        self.trans.extend((p + off, g, q + off) for p, g, q in other.trans)
        return off

    def out(self, states) -> list[tuple[int, Conj, int]]:
        return [t for t in self.trans if t[0] in states]

    def atoms(self) -> set[int]:
        return {a for _, g, _ in self.trans for a, _ in g}

    def trimmed(self) -> "NFA":
        """Drop states that cannot reach a final state or be reached."""
        fwd = set(self.init)
        frontier = list(self.init)
        while frontier:
            p = frontier.pop()
            for s, _, q in self.trans:
                if s == p and q not in fwd:
                    fwd.add(q)
                    frontier.append(q)
        bwd = set(self.final)
        frontier = list(self.final)
        while frontier:
            q = frontier.pop()
            for p, _, d in self.trans:
                if d == q and p not in bwd:
                    bwd.add(p)
                    frontier.append(p)
        keep = sorted(fwd & bwd)
        index = {s: i for i, s in enumerate(keep)}
        out = NFA(n=len(keep))
        out.trans = [(index[p], g, index[q]) for p, g, q in self.trans if p in index and q in index]
        out.init = {index[s] for s in self.init if s in index}
        out.final = {index[s] for s in self.final if s in index}
        return out


def atom_nfa(guard: Conj) -> NFA:
    a = NFA(n=2)
    a.trans = [(0, guard, 1)]
    a.init, a.final = {0}, {1}
    return a


def empty_nfa() -> NFA:
    """Matches nothing."""
    return NFA()


def union(x: NFA, y: NFA) -> NFA:
    out = NFA()
    ox, oy = out.absorb(x), out.absorb(y)
    out.init = {s + ox for s in x.init} | {s + oy for s in y.init}
    out.final = {s + ox for s in x.final} | {s + oy for s in y.final}
    return out


def concat1(x: NFA, y: NFA) -> NFA:
    """x ##1 y: y's first tick is the tick after x ends."""
    out = NFA()
    ox, oy = out.absorb(x), out.absorb(y)
    y_first = [(g, q + oy) for p, g, q in y.trans if p in y.init]
    for f in x.final:
        for g, q in y_first:
            out.trans.append((f + ox, g, q))
    out.init = {s + ox for s in x.init}
    out.final = {s + oy for s in y.final}
    return out.trimmed()


def fuse(x: NFA, y: NFA) -> NFA:
    """x ##0 y: y's first tick is x's last tick."""
    out = NFA()
    ox, oy = out.absorb(x), out.absorb(y)
    y_first = [(g, q + oy) for p, g, q in y.trans if p in y.init]
    for p, gx, f in x.trans:
        if f in x.final:
            for gy, q in y_first:
                g = conj(gx, gy)
                if g is not None:
                    out.trans.append((p + ox, g, q))
    out.init = {s + ox for s in x.init}
    out.final = {s + oy for s in y.final}
    return out.trimmed()


def trues(lo: int, hi: Optional[int]) -> NFA:
    """1[*lo:hi] for lo >= 1 (hi None = $)."""
    if lo < 1:
        raise ValueError("trues needs lo >= 1")
    count = lo if hi is None else hi
    if count > MAX_UNROLL:
        raise AutomatonTooLarge(f"range up to {count} is too long to unroll")
    a = NFA(n=count + 1)
    a.trans = [(i, TRUE, i + 1) for i in range(count)]
    a.init = {0}
    if hi is None:
        a.trans.append((count, TRUE, count))
        a.final = {count}
    else:
        a.final = set(range(lo, hi + 1))
    return a


def loop(x: NFA) -> NFA:
    """x[*1:$]: x repeated one or more times, back to back."""
    out = NFA()
    ox = out.absorb(x)
    out.init = {s + ox for s in x.init}
    out.final = {s + ox for s in x.final}
    first = [(g, q + ox) for p, g, q in x.trans if p in x.init]
    for f in out.final:
        for g, q in first:
            out.trans.append((f, g, q))
    return out


def repeat(x: NFA, lo: int, hi: Optional[int]) -> NFA:
    """x[*lo:hi] for lo >= 1 (hi None = $)."""
    if lo < 1:
        raise ValueError("repeat needs lo >= 1")
    if hi is None:
        # x[*lo:$] = x[*lo-1] ##1 x[*1:$]
        tail = loop(x)
        return tail if lo == 1 else concat1(_prefix(x, lo - 1), tail)
    if hi > MAX_UNROLL:
        raise AutomatonTooLarge(f"repetition up to {hi} is too long to unroll")
    result = _prefix(x, lo)
    out = result
    for _ in range(lo, hi):
        result = concat1(result, x)
        out = union(out, result)
    return out


def _prefix(x: NFA, k: int) -> NFA:
    """x concatenated k times (k >= 1)."""
    if k > MAX_UNROLL:
        raise AutomatonTooLarge(f"repetition of {k} is too long to unroll")
    result = x
    for _ in range(k - 1):
        result = concat1(result, x)
    return result


def delay_then(y: NFA, lo: int, hi: Optional[int]) -> NFA:
    """Automaton for "##[lo:hi] y" relative to a tick boundary, lo >= 1:
    y starts lo..hi ticks after the end of what precedes it."""
    parts = []
    if lo == 1:
        parts.append(y)
    if hi is None or hi >= 2:
        skip_lo = max(lo - 1, 1)
        skip_hi = None if hi is None else hi - 1
        parts.append(concat1(trues(skip_lo, skip_hi), y))
    out = parts[0]
    for p in parts[1:]:
        out = union(out, p)
    return out


def concat_delay(x: NFA, lo: int, hi: Optional[int], y: NFA) -> NFA:
    """x ##[lo:hi] y."""
    parts = []
    if lo == 0:
        parts.append(fuse(x, y))
    if hi is None or hi >= 1:
        parts.append(concat1(x, delay_then(y, max(lo, 1), hi)))
    out = parts[0]
    for p in parts[1:]:
        out = union(out, p)
    return out


def pad(x: NFA) -> NFA:
    """x ##1 1[*0:$]: x, then any number of extra ticks."""
    return union(x, concat1(x, trues(1, None)))


def prepad(x: NFA) -> NFA:
    """1[*0:$] ##1 x: x starting at the attempt or any later tick."""
    return union(x, concat1(trues(1, None), x))


def intersect(x: NFA, y: NFA) -> NFA:
    """Both match, starting and ending on the same ticks (product)."""
    out = NFA()
    index: dict[tuple[int, int], int] = {}

    def state(p: int, q: int) -> int:
        if (p, q) not in index:
            index[(p, q)] = out.new_state()
            frontier.append((p, q))
        return index[(p, q)]

    frontier: list[tuple[int, int]] = []
    out.init = {state(p, q) for p in x.init for q in y.init}
    by_src_x: dict[int, list] = {}
    for p, g, q in x.trans:
        by_src_x.setdefault(p, []).append((g, q))
    by_src_y: dict[int, list] = {}
    for p, g, q in y.trans:
        by_src_y.setdefault(p, []).append((g, q))
    while frontier:
        p, q = frontier.pop()
        src = index[(p, q)]
        for gx, px in by_src_x.get(p, []):
            for gy, qy in by_src_y.get(q, []):
                g = conj(gx, gy)
                if g is not None:
                    out.trans.append((src, g, state(px, qy)))
    out.final = {s for (p, q), s in index.items() if p in x.final and q in y.final}
    return out.trimmed()


def seq_and(x: NFA, y: NFA) -> NFA:
    """IEEE: both match from the same start; the match ends with the later one."""
    return union(intersect(pad(x), y), intersect(x, pad(y)))


def within(x: NFA, y: NFA) -> NFA:
    """IEEE: (1[*0:$] ##1 x ##1 1[*0:$]) intersect y."""
    return intersect(pad(prepad(x)), y)


def throughout(cond: Conj, x: NFA) -> NFA:
    out = NFA(n=x.n, init=set(x.init), final=set(x.final))
    for p, g, q in x.trans:
        c = conj(cond, g)
        if c is not None:
            out.trans.append((p, c, q))
    return out.trimmed()


def goto(b: int, lo: int, hi: Optional[int]) -> NFA:
    """b[->lo:hi] = (!b[*0:$] ##1 b)[*lo:hi]."""
    one = NFA(n=2)
    one.trans = [(0, lit(b, False), 0), (0, lit(b, True), 1)]
    one.init, one.final = {0}, {1}
    return repeat(one, lo, hi)


def nonconsecutive(b: int, lo: int, hi: Optional[int]) -> NFA:
    """b[=lo:hi] = b[->lo:hi] ##1 !b[*0:$]."""
    g = goto(b, lo, hi)
    tail = NFA(n=2)
    tail.trans = [(0, lit(b, False), 1), (1, lit(b, False), 1)]
    tail.init, tail.final = {0}, {1}
    return union(g, concat1(g, tail))


def first_match(x: NFA) -> NFA:
    """first_match(x) (IEEE 1800 16.9.8): for each attempt, only the matches
    that end first.  The per-attempt deterministic automaton of x stops at
    an attempt's first match; read back as a tick automaton."""
    p = pdfa_from_sequence(x)
    out = NFA(n=p.n + 1)
    if out.n > MAX_STATES:
        raise AutomatonTooLarge(f"sequence needs more than {MAX_STATES} states")
    final = p.n
    out.init, out.final = {0}, {final}
    for s, (atoms, rows) in enumerate(p.table):
        for values, outcome in rows.items():
            guard = frozenset(zip(atoms, values))
            if outcome[0] == GO:
                out.trans.append((s, guard, outcome[1]))
            elif outcome[0] == PASS:
                out.trans.append((s, guard, final))
    return out.trimmed()


def union_all(parts: list[NFA]) -> Optional[NFA]:
    """Union of any number of automata (None if there are none)."""
    out: Optional[NFA] = None
    for part in parts:
        out = part if out is None else union(out, part)
    return out


def is_bounded(x: NFA) -> bool:
    """True if every match has bounded length (no cycles)."""
    adj: dict[int, list[int]] = {}
    for p, _, q in x.trans:
        adj.setdefault(p, []).append(q)
    color: dict[int, int] = {}

    def has_cycle(s: int) -> bool:
        color[s] = 1
        for t in adj.get(s, []):
            if color.get(t) == 1 or (color.get(t) is None and has_cycle(t)):
                return True
        color[s] = 2
        return False

    return not any(color.get(s) is None and has_cycle(s) for s in range(x.n))


# ── Property automata ────────────────────────────────────────

GO, PASS, VPASS, FAIL = "go", "pass", "vpass", "fail"
Outcome = tuple        # (GO, state) | (PASS,) | (VPASS,) | (FAIL,)


@dataclass
class PDFA:
    """Per-attempt deterministic automaton; state 0 is the initial state.

    table[s] = (atoms, {valuation tuple: outcome}) where the valuation
    tuple lists the atoms' values in order.
    """
    table: list[tuple[tuple[int, ...], dict[tuple[bool, ...], Outcome]]] = field(default_factory=list)

    @property
    def n(self) -> int:
        return len(self.table)


class _Builder:
    """Explore a deterministic automaton from abstract states."""

    def __init__(self, atoms_of, step):
        self.atoms_of = atoms_of     # state -> set of atom ids it reads
        self.step = step             # (state, valuation dict) -> outcome with abstract state

    def build(self, initial) -> PDFA:
        index = {initial: 0}
        order = [initial]
        table = []
        i = 0
        while i < len(order):
            state = order[i]
            atoms = tuple(sorted(self.atoms_of(state)))
            if len(atoms) > MAX_ATOMS_PER_STATE:
                raise AutomatonTooLarge(
                    f"a property state depends on {len(atoms)} conditions (limit {MAX_ATOMS_PER_STATE})")
            rows = {}
            for values in itertools.product((False, True), repeat=len(atoms)):
                outcome = self.step(state, dict(zip(atoms, values)))
                if outcome[0] == GO:
                    nxt = outcome[1]
                    if nxt not in index:
                        if len(order) >= MAX_STATES:
                            raise AutomatonTooLarge(f"property needs more than {MAX_STATES} states")
                        index[nxt] = len(order)
                        order.append(nxt)
                    outcome = (GO, index[nxt])
                rows[values] = outcome
            table.append((atoms, rows))
            i += 1
        return PDFA(table)


def _step_nfa(nfa: NFA, states: frozenset, valuation: dict[int, bool]) -> tuple[frozenset, bool]:
    nxt, matched = set(), False
    for p, g, q in nfa.trans:
        if p in states and holds(g, valuation):
            nxt.add(q)
            if q in nfa.final:
                matched = True
    return frozenset(nxt), matched


def _nfa_atoms(nfa: NFA, states) -> set[int]:
    return {a for p, g, _ in nfa.trans if p in states for a, _ in g}


def pdfa_from_sequence(nfa: NFA, negate: bool = False) -> PDFA:
    """Weak sequence property: PASS at the first match, FAIL when no thread
    can still match.  negate swaps the outcomes (property `not s`)."""
    def step(states, valuation):
        nxt, matched = _step_nfa(nfa, states, valuation)
        if matched:
            return (FAIL,) if negate else (PASS,)
        if not nxt:
            return (PASS,) if negate else (FAIL,)
        return (GO, nxt)
    return _Builder(lambda s: _nfa_atoms(nfa, s), step).build(frozenset(nfa.init))


# Generic composition over component PDFAs.  An abstract composite state
# references component PDFA state indices.

def _atoms(p: PDFA, s: int) -> set[int]:
    return set(p.table[s][0])


def _outcome(p: PDFA, s: int, valuation: dict[int, bool]) -> Outcome:
    atoms, rows = p.table[s]
    return rows[tuple(valuation[a] for a in atoms)]


def pdfa_not(p: PDFA) -> PDFA:
    swap = {PASS: (FAIL,), VPASS: (FAIL,), FAIL: (PASS,)}
    table = []
    for atoms, rows in p.table:
        table.append((atoms, {v: (o if o[0] == GO else swap[o[0]]) for v, o in rows.items()}))
    return PDFA(table)


DONE = -1   # component already decided (passed)


def pdfa_and(x: PDFA, y: PDFA) -> PDFA:
    """Both must hold; FAIL as soon as either fails."""
    def atoms_of(state):
        (a, av), (b, bv) = state
        return (set() if a == DONE else _atoms(x, a)) | (set() if b == DONE else _atoms(y, b))

    def step(state, valuation):
        (a, av), (b, bv) = state
        na, nav = _advance(x, a, av, valuation)
        nb, nbv = _advance(y, b, bv, valuation)
        if na is None or nb is None:
            return (FAIL,)
        if na == DONE and nb == DONE:
            return (PASS,) if (nav or nbv) else (VPASS,)
        return (GO, ((na, nav), (nb, nbv)))
    return _Builder(atoms_of, step).build(((0, False), (0, False)))


def pdfa_or(x: PDFA, y: PDFA) -> PDFA:
    """Either must hold; PASS as soon as either passes."""
    FAILED = -2

    def atoms_of(state):
        a, b = state
        return (set() if a < 0 else _atoms(x, a)) | (set() if b < 0 else _atoms(y, b))

    def step(state, valuation):
        a, b = state
        na = FAILED if a == FAILED else _decide(x, a, valuation)
        nb = FAILED if b == FAILED else _decide(y, b, valuation)
        for n in (na, nb):
            if n in (PASS, VPASS):
                return (n,)
        if na == FAILED and nb == FAILED:
            return (FAIL,)
        return (GO, (na, nb))
    return _Builder(atoms_of, step).build((0, 0))


def _advance(p: PDFA, s: int, vac: bool, valuation) -> tuple[Optional[int], bool]:
    """Step a component that may already be DONE; None = failed."""
    if s == DONE:
        return DONE, vac
    o = _outcome(p, s, valuation)
    if o[0] == GO:
        return o[1], vac
    if o[0] == FAIL:
        return None, vac
    return DONE, vac or o[0] == PASS


def _decide(p: PDFA, s: int, valuation):
    o = _outcome(p, s, valuation)
    if o[0] == GO:
        return o[1]
    return -2 if o[0] == FAIL else o[0]


def pdfa_implication(ante: NFA, cons: PDFA, overlapped: bool) -> PDFA:
    """ante |-> cons (overlapped) / ante |=> cons, per attempt.

    State: (ante thread set, pending consequent states, matched-flag).
    """
    def atoms_of(state):
        threads, pending, _ = state
        out = _nfa_atoms(ante, threads)
        for c in pending:
            out |= _atoms(cons, c)
        if overlapped and threads:
            out |= _atoms(cons, 0)
        return out

    def step(state, valuation):
        threads, pending, matched = state
        nxt_threads, ante_match = _step_nfa(ante, threads, valuation)
        new_pending = set()
        for c in pending:
            o = _outcome(cons, c, valuation)
            if o[0] == FAIL:
                return (FAIL,)
            if o[0] == GO:
                new_pending.add(o[1])
        if ante_match:
            matched = True
            if overlapped:
                o = _outcome(cons, 0, valuation)
                if o[0] == FAIL:
                    return (FAIL,)
                if o[0] == GO:
                    new_pending.add(o[1])
            else:
                new_pending.add(0)
        if not nxt_threads and not new_pending:
            return (PASS,) if matched else (VPASS,)
        return (GO, (nxt_threads, frozenset(new_pending), matched))
    return _Builder(atoms_of, step).build((frozenset(ante.init), frozenset(), False))


def pdfa_delay(p: PDFA, ticks: int) -> PDFA:
    """nexttime[ticks] p: p starts `ticks` ticks after the attempt."""
    if ticks > MAX_UNROLL:
        raise AutomatonTooLarge(f"nexttime[{ticks}] is too long to unroll")
    table: list[tuple[tuple[int, ...], dict[tuple[bool, ...], Outcome]]] = [
        ((), {(): (GO, i + 1)}) for i in range(ticks)]
    for atoms, rows in p.table:
        table.append((atoms, {v: ((GO, o[1] + ticks) if o[0] == GO else o) for v, o in rows.items()}))
    return PDFA(table)


def pdfa_if(cond: int, then: PDFA, otherwise: Optional[PDFA]) -> PDFA:
    """if (cond) then else otherwise, decided at the attempt's first tick."""
    other = otherwise or PDFA([((), {(): (VPASS,)})])
    n_then = then.n
    table = []
    atoms0 = tuple(sorted({cond} | _atoms(then, 0) | _atoms(other, 0)))
    rows0 = {}
    for values in itertools.product((False, True), repeat=len(atoms0)):
        val = dict(zip(atoms0, values))
        if val[cond]:
            o = _outcome(then, 0, val)
            rows0[values] = (GO, o[1] + 1) if o[0] == GO else o
        else:
            o = _outcome(other, 0, val)
            rows0[values] = (GO, o[1] + 1 + n_then) if o[0] == GO else o
    table.append((atoms0, rows0))
    for atoms, rows in then.table:
        table.append((atoms, {v: ((GO, o[1] + 1) if o[0] == GO else o) for v, o in rows.items()}))
    for atoms, rows in other.table:
        table.append((atoms, {v: ((GO, o[1] + 1 + n_then) if o[0] == GO else o) for v, o in rows.items()}))
    return PDFA(table)


def pdfa_window(p: PDFA, lo: int, hi: int, every: bool) -> PDFA:
    """always [lo:hi] p (every=True) / eventually [lo:hi] p (every=False):
    p is started at each tick lo..hi after the attempt."""
    if hi > MAX_UNROLL:
        raise AutomatonTooLarge(f"window up to {hi} is too long to unroll")

    def atoms_of(state):
        k, pending, _ = state
        out = set()
        for c in pending:
            out |= _atoms(p, c)
        if lo <= k <= hi:
            out |= _atoms(p, 0)
        return out

    def step(state, valuation):
        k, pending, hit = state
        new_pending = set()
        starts = list(pending) + ([0] if lo <= k <= hi else [])
        for c in starts:
            o = _outcome(p, c, valuation)
            if o[0] == GO:
                new_pending.add(o[1])
            elif o[0] == FAIL and every:
                return (FAIL,)
            elif o[0] in (PASS, VPASS) and not every:
                return (PASS,)
        done_starting = k >= hi
        if done_starting and not new_pending:
            return (PASS,) if every else (FAIL,)
        return (GO, (min(k + 1, hi + 1), frozenset(new_pending), hit))
    return _Builder(atoms_of, step).build((0, frozenset(), False))


def pdfa_until(hold: int, release: int, strong: bool, with_: bool) -> PDFA:
    """hold until release, for boolean operands (weak / strong / _with)."""
    if strong:
        raise AutomatonTooLarge("s_until needs liveness checking, which is not supported")
    atoms = tuple(sorted({hold, release}))
    rows = {}
    for values in itertools.product((False, True), repeat=len(atoms)):
        val = dict(zip(atoms, values))
        if with_:
            if val[release] and val[hold]:
                rows[values] = (PASS,)
            elif not val[hold]:
                rows[values] = (FAIL,)
            else:
                rows[values] = (GO, 0)
        else:
            if val[release]:
                rows[values] = (PASS,)
            elif not val[hold]:
                rows[values] = (FAIL,)
            else:
                rows[values] = (GO, 0)
    return PDFA([(atoms, rows)])
