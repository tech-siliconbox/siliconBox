"""
Intermediate representation of SystemVerilog concurrent assertions.

The front end (frontend.py) converts slang's elaborated assertion AST into
these nodes; the compiler turns them into synthesizable monitors.  The node
set mirrors IEEE 1800-2017 chapter 16.  Boolean leaves keep slang's typed
Expression objects, so widths and signedness come from the real elaboration.

Anything the front end cannot represent becomes an Unsupported node carrying
the reason and source location; it is reported per property, never dropped.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional, Union


@dataclass(frozen=True)
class Location:
    file: str
    line: int

    def __str__(self) -> str:
        return f"{self.file}:{self.line}"


@dataclass(frozen=True)
class Unsupported:
    """A construct that cannot be checked; reported per property."""
    reason: str
    location: Optional[Location] = None


# ── Sequences ─────────────────────────────────────────────────

@dataclass(frozen=True)
class SeqBool:
    """One clock tick in which `expr` (a slang Expression) is true."""
    expr: Any


@dataclass(frozen=True)
class Delay:
    """##[min:max] before an element; max None means $ (unbounded)."""
    min: int
    max: Optional[int]


@dataclass(frozen=True)
class SeqConcat:
    """s0 ##[d1] s1 ##[d2] s2 ...; the first element's delay is usually ##0."""
    items: tuple[tuple[Delay, "Seq"], ...]


class RepeatKind(Enum):
    CONSECUTIVE = "[*]"
    GOTO = "[->]"
    NONCONSECUTIVE = "[=]"


@dataclass(frozen=True)
class SeqRepeat:
    seq: "Seq"
    kind: RepeatKind
    min: int
    max: Optional[int]


class SeqOp(Enum):
    AND = "and"
    OR = "or"
    INTERSECT = "intersect"
    WITHIN = "within"


@dataclass(frozen=True)
class SeqBinary:
    op: SeqOp
    left: "Seq"
    right: "Seq"


@dataclass(frozen=True)
class SeqThroughout:
    """cond throughout seq: cond holds at every tick of seq."""
    cond: Any
    seq: "Seq"


@dataclass(frozen=True)
class SeqFirstMatch:
    seq: "Seq"


@dataclass(frozen=True)
class LocalAssign:
    """Match item `var = expr` on a local assertion variable."""
    var: str
    expr: Any


@dataclass(frozen=True)
class SeqMatchItems:
    """(seq, v1 = e1, ...): assignments performed when seq matches."""
    seq: "Seq"
    assignments: tuple[LocalAssign, ...]


@dataclass(frozen=True)
class SeqSwitch:
    """`first ##1 @(clock) rest` (`##0`: overlapped): rest starts at the first
    tick of `clock` strictly after (at or after) the end of a match of
    first.  Later parts, and the consequent, stay on `clock`."""
    first: "Seq"
    overlapped: bool
    clock: Any                # Clock
    rest: "Seq"


Seq = Union[SeqBool, SeqConcat, SeqRepeat, SeqBinary, SeqThroughout,
            SeqFirstMatch, SeqMatchItems, SeqSwitch, Unsupported]


# ── Properties ────────────────────────────────────────────────

@dataclass(frozen=True)
class PropSeq:
    """A sequence used as a property (weak unless `strong`)."""
    seq: Seq
    strong: bool = False


@dataclass(frozen=True)
class PropNot:
    prop: "Prop"


class PropOp(Enum):
    AND = "and"
    OR = "or"
    IFF = "iff"
    IMPLIES = "implies"
    UNTIL = "until"
    S_UNTIL = "s_until"
    UNTIL_WITH = "until_with"
    S_UNTIL_WITH = "s_until_with"


@dataclass(frozen=True)
class PropBinary:
    op: PropOp
    left: "Prop"
    right: "Prop"


@dataclass(frozen=True)
class PropImplication:
    """ante |-> cons (overlapped) or ante |=> cons."""
    ante: Seq
    cons: "Prop"
    overlapped: bool
    ante_text: str = ""     # antecedent as written (for explanations)


@dataclass(frozen=True)
class PropFollowedBy:
    """ante #-# cons (overlapped) or ante #=# cons."""
    ante: Seq
    cons: "Prop"
    overlapped: bool


class TemporalOp(Enum):
    NEXTTIME = "nexttime"
    S_NEXTTIME = "s_nexttime"
    ALWAYS = "always"
    S_ALWAYS = "s_always"
    EVENTUALLY = "eventually"
    S_EVENTUALLY = "s_eventually"


@dataclass(frozen=True)
class PropTemporal:
    """nexttime[n] p, always [m:n] p, eventually [m:n] p (range optional)."""
    op: TemporalOp
    prop: "Prop"
    min: Optional[int] = None
    max: Optional[int] = None


@dataclass(frozen=True)
class PropIf:
    cond: Any                # slang expression, or CaseCondition
    then: "Prop"
    otherwise: Optional["Prop"]


@dataclass(frozen=True, eq=False)
class NegatedCondition:
    """`cond` is false (an else / non-matching case branch)."""
    cond: Any


@dataclass(frozen=True, eq=False)
class RangeCondition:
    """lo <= expr <= hi (an index within its array's bounds)."""
    expr: Any
    lo: int
    hi: int


@dataclass(frozen=True, eq=False)
class CaseCondition:
    """`subject` matches one of `items` (an item of a `case` property or
    statement).  match: "" equality; "z" casez (z/? item bits are don't
    care); "x" casex (x/z/? don't care); "inside" case inside (value ranges,
    and x/z/? item bits don't care)."""
    subject: Any
    items: tuple
    match: str = ""


@dataclass(frozen=True)
class PropClocked:
    """`prop` evaluated on another clock: the consequent of
    `@(c1) a |-> @(c2) b`, which starts at the first c2 tick at or after the
    c1 tick where the antecedent matched (with |=>, strictly after)."""
    clock: Any                # Clock
    prop: "Prop"


@dataclass(frozen=True)
class InitialCycle:
    """True in the first cycle only (immediate assertions in initial blocks)."""


# Values of procedural variables (immediate assertions)
#
# An immediate assertion reads variables as they are at that point of its
# procedure: a variable written earlier by a blocking assignment has the
# assigned value, not the signal's.  `Values` maps a variable's hierarchical
# path to that value; a variable not in the map reads the signal itself.

@dataclass(frozen=True, eq=False)
class ExprValue:
    """The value of `expr`, itself read with `values`."""
    expr: Any
    values: dict


@dataclass(frozen=True, eq=False)
class ConstValue:
    """A constant (a loop variable in an unrolled loop)."""
    value: int
    width: int
    signed: bool


@dataclass(frozen=True, eq=False)
class MuxValue:
    """`then` if `cond` (a Bound condition) holds, else `other`; an arm of
    None is the variable's own (signal) value."""
    cond: Any
    then: Any
    other: Any


@dataclass(frozen=True, eq=False)
class AssignValue:
    """The value after a compound (`x += e`) or partial (`x[i] = e`)
    assignment or an increment (`x++`): `assign`, the slang assignment or
    unary expression, read with `values` (those before it)."""
    assign: Any
    values: dict


@dataclass(frozen=True)
class UnknownValue:
    """Written in a way that is not followed (an array element or struct
    member, a loop that cannot be unrolled, ...)."""
    how: str


@dataclass(frozen=True, eq=False)
class Bound:
    """`expr` (a slang expression or condition) read with `values`."""
    expr: Any
    values: dict


@dataclass(frozen=True)
class PropAbort:
    """accept_on / reject_on (and sync_ variants)."""
    accept: bool
    synchronous: bool
    cond: Any
    prop: "Prop"


Prop = Union[PropSeq, PropNot, PropBinary, PropImplication, PropFollowedBy,
             PropTemporal, PropIf, PropAbort, PropClocked, Unsupported]


# ── Top-level records ─────────────────────────────────────────

class AssertionKind(Enum):
    ASSERT = "assert"
    ASSUME = "assume"
    COVER = "cover"
    RESTRICT = "restrict"


@dataclass(frozen=True)
class Clock:
    """Sampling event: `posedge` / `negedge` / `edge` of a slang Expression."""
    edge: str
    expr: Any


@dataclass(frozen=True)
class Signal:
    """A DUT signal referenced by an assertion, relative to its target scope."""
    path: str          # e.g. "din" or "u_ctrl.state" (relative to the target)
    width: int
    signed: bool


@dataclass
class AssertionRecord:
    label: str
    kind: AssertionKind
    location: Location
    target: str                    # hierarchical path of the scope it checks
    clock: Optional[Clock]         # None: no clock written or inferable
    disable: Any                   # slang Expression or None
    prop: Prop
    signals: dict[str, Signal] = field(default_factory=dict)
    local_vars: tuple[str, ...] = ()
    problems: list[Unsupported] = field(default_factory=list)
    after_reset: bool = False      # checked only after the harness reset sequence
    clocks: tuple = ()             # further clocks (a clock switch, see PropClocked)
                                   # (immediate assertions: they have no disable iff)
    note: str = ""                 # what an automatic check checks (UI text)
    drivers: tuple = ()            # branch checks: top-level drivers of the branch's own condition
    # the ElaboratedDesign it comes from: keeps the slang objects it holds alive
    owner: Any = field(default=None, repr=False, compare=False)

    @property
    def supported(self) -> bool:
        return not self.problems
