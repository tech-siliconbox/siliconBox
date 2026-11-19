"""
Case splitting: proving a hard assertion as several easier ones.

    case_split -property P -cases {c1 c2 ... cn}

adds in front of `P : assert property (spec);`

    P__case1     : assert property ((c1) |-> (spec));
    ...
    P__case<n>   : assert property ((cn) |-> (spec));
    P__case_rest : assert property (!(c1) && ... && !(cn) |-> (spec));

and P itself is no longer proven, its cases are.  P stays in the source so
that its related covers (precondition, witness) are still checked.

Every attempt of P starts in a cycle where one of c1..cn holds or none
does, so P holds exactly when all of these hold: the split is sound and
complete whatever the cases are (they need not be exclusive, and nothing
has to be proven about their completeness: the rest takes what they leave).
A counterexample of a case is a counterexample of P.

The cases are expressions as they could be written at the place of the
assertion (the same names and macros).  A clock or `disable iff` written in
the assert statement stays at the front.  The rewrite keeps every other line
of the file where it was, so messages still point at the right lines.
"""

from __future__ import annotations

import re

CASE_INFIX = "__case"
REST_SUFFIX = "__case_rest"


class SplitError(Exception):
    """The assertion cannot be split as asked."""


def case_labels(label: str, count: int) -> list[str]:
    """Engine labels of the split of `label` into `count` cases and the rest."""
    return [f"{label}{CASE_INFIX}{k}" for k in range(1, count + 1)] + [f"{label}{REST_SUFFIX}"]


def _mask(text: str) -> str:
    """`text` with comments and string literals blanked, positions unchanged."""
    def blank(m: re.Match) -> str:
        return re.sub(r"[^\n]", " ", m.group(0))
    return re.sub(r'//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\\n])*"', blank, text, flags=re.DOTALL)


def _close(masked: str, open_at: int) -> int:
    """Index of the parenthesis that closes the one at `open_at`."""
    depth = 0
    for i in range(open_at, len(masked)):
        if masked[i] == "(":
            depth += 1
        elif masked[i] == ")":
            depth -= 1
            if depth == 0:
                return i
    raise SplitError("the parentheses of the assert statement do not match")


def find(text: str, label: str) -> bool:
    """Is `label : assert property (` written in `text` (outside comments)?"""
    return bool(re.search(rf"(?<![\w.$`]){re.escape(label)}\s*:\s*assert\s+property\s*\(", _mask(text)))


def split_statement(text: str, label: str, cases: list[str]) -> str:
    """`text` with the assertion `label` replaced by its cases (see the module doc)."""
    if not cases:
        raise SplitError("give at least one case")
    for case in cases:
        if not case.strip():
            raise SplitError("a case is empty")
        masked_case = _mask(case)
        if masked_case.count("(") != masked_case.count(")") or ";" in masked_case:
            raise SplitError(f'the case "{case.strip()}" is not one expression')
    masked = _mask(text)
    found = list(re.finditer(rf"(?<![\w.$`]){re.escape(label)}\s*:\s*assert\s+property\s*\(", masked))
    if not found:
        raise SplitError(f'the statement "{label} : assert property (...)" was not found in the sources '
                         f"(an assertion in a generate loop, or without a label of its own, cannot be split)")
    if len(found) > 1:
        raise SplitError(f'"{label} : assert property" is written {len(found)} times; it cannot be told which to split')
    start, open_at = found[0].start(), found[0].end() - 1
    close = _close(masked, open_at)
    spec, masked_spec = text[open_at + 1:close], masked[open_at + 1:close]

    # a clocking event and disable iff written in the statement stay in front of the cases
    i = len(masked_spec) - len(masked_spec.lstrip())
    if masked_spec[i:i + 1] == "@":
        j = i + 1 + len(masked_spec[i + 1:]) - len(masked_spec[i + 1:].lstrip())
        if masked_spec[j:j + 1] == "(":
            i = _close(masked_spec, j) + 1
        else:
            i = j + len(re.match(r"[\w.$]*", masked_spec[j:]).group(0))
    disable = re.match(r"\s*disable\s+iff\s*\(", masked_spec[i:])
    if disable:
        i = _close(masked_spec, i + disable.end() - 1) + 1
    head, body = " ".join(spec[:i].split()), " ".join(spec[i:].split())
    if not body:
        raise SplitError("the assert statement has no property")
    front = f"{head} " if head else ""

    labels = case_labels(label, len(cases))
    flat = [" ".join(case.split()) for case in cases]
    statements = [f"{name} : assert property ({front}({case}) |-> ({body}));"
                  for name, case in zip(labels, flat)]
    rest = " && ".join(f"!({case})" for case in flat)
    statements.append(f"{labels[-1]} : assert property ({front}({rest}) |-> ({body}));")
    # The original statement stays (it is not proven, the cases are): its
    # precondition and witness covers still say whether the assertion can
    # pass vacuously.  The cases go in front of it on its line, so every line
    # number in the file stays as it was.
    return text[:start] + " ".join(statements) + " " + text[start:]


# ── Cases Praman makes ────────────────────────────────────────

MAX_VALUE_BITS = 10              # -values: at most 2**10 cases


def insert_probes(text: str, label: str, exprs: list[str]) -> str:
    """`text` with `wire __pm_probe_<k> = |(<expr k>);` in front of the assertion
    `label`, on its line: elaborating it gives the width of each expression as
    written at the place of the assertion.  (A net, not $bits: $bits does not
    take hierarchical names such as top.sig.)"""
    masked = _mask(text)
    found = list(re.finditer(rf"(?<![\w.$`]){re.escape(label)}\s*:\s*assert\s+property\s*\(", masked))
    if len(found) != 1:
        raise SplitError(f'the statement "{label} : assert property (...)" was not found once in the sources')
    for expr in exprs:
        masked_expr = _mask(expr)
        if not expr.strip() or masked_expr.count("(") != masked_expr.count(")") or ";" in masked_expr:
            raise SplitError(f'"{expr.strip()}" is not one expression')
    probes = " ".join(f"wire __pm_probe_{k} = |({' '.join(e.split())});" for k, e in enumerate(exprs))
    start = found[0].start()
    return text[:start] + probes + " " + text[start:]


def lowest_bit_cases(expr: str, width: int) -> tuple[list[str], list[str]]:
    """(cases, descriptions): one case per position of the lowest 1-bit of `expr`.
    Case i holds when bits 0..i-1 are 0 and bit i is 1; the rest of a split
    is then "expr is 0"."""
    e = " ".join(expr.split())
    cases = [f"(({e}) & ({width}'d1 << {i + 1}) - {width}'d1) == ({width}'d1 << {i})" if i + 1 < width else
             f"(({e}) & {{{width}{{1'b1}}}}) == ({width}'d1 << {i})" for i in range(width)]
    return cases, [f"lowest 1-bit of ({e}) is bit {i}" for i in range(width)]


def value_cases(expr: str, width: int) -> tuple[list[str], list[str]]:
    """(cases, descriptions): one case per value of `expr` (the rest then never occurs)."""
    if width > MAX_VALUE_BITS:
        raise SplitError(f"the expression is {width} bits wide: one case per value would be {2 ** width} cases "
                         f"(at most {MAX_VALUE_BITS} bits); use -lowest_bit, or a narrower expression")
    e = " ".join(expr.split())
    return ([f"({e}) == {width}'d{v}" for v in range(2 ** width)],
            [f"({e}) == {v}" for v in range(2 ** width)])
