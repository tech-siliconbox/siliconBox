"""
Print slang's typed expressions as Verilog for the generated monitor.

slang makes every implicit width/sign conversion explicit and folds
constants (parameters, literals), so printing each node with explicit size
casts reproduces SystemVerilog's sizing rules exactly.  DUT signals become
monitor ports (see port_name), local assertion variables become the names
the compiler provides, and sampled-value functions ($past, $rose, $fell,
$stable, $changed) become registers clocked by the assertion clock.
Unsupported constructs raise ExprUnsupported with a precise reason.
"""

from __future__ import annotations

import re
from contextlib import contextmanager
from types import SimpleNamespace
from dataclasses import dataclass, field
from typing import Callable, Optional

from pyslang import ast

from app.praman.services.sva.ir import (
    AssignValue, Bound, CaseCondition, ConstValue, ExprValue, MuxValue, NegatedCondition, RangeCondition,
    UnknownValue,
)
from app.praman.services.sva.ports import through_bind


class ExprUnsupported(Exception):
    """An expression construct the monitor generator cannot express."""


def port_name(path: str) -> str:
    """Monitor port name for a target-relative signal path ("u.x" -> "u__x")."""
    return re.sub(r'\W', '_', path.replace(".", "__"))


_UNARY = {
    ast.UnaryOperator.Plus: "+", ast.UnaryOperator.Minus: "-",
    ast.UnaryOperator.BitwiseNot: "~", ast.UnaryOperator.BitwiseAnd: "&",
    ast.UnaryOperator.BitwiseOr: "|", ast.UnaryOperator.BitwiseXor: "^",
    ast.UnaryOperator.BitwiseNand: "~&", ast.UnaryOperator.BitwiseNor: "~|",
    ast.UnaryOperator.BitwiseXnor: "~^", ast.UnaryOperator.LogicalNot: "!",
}

_BINARY = {
    ast.BinaryOperator.Add: "+", ast.BinaryOperator.Subtract: "-",
    ast.BinaryOperator.Multiply: "*", ast.BinaryOperator.Divide: "/",
    ast.BinaryOperator.Mod: "%", ast.BinaryOperator.BinaryAnd: "&",
    ast.BinaryOperator.BinaryOr: "|", ast.BinaryOperator.BinaryXor: "^",
    ast.BinaryOperator.BinaryXnor: "~^", ast.BinaryOperator.Equality: "==",
    ast.BinaryOperator.Inequality: "!=", ast.BinaryOperator.CaseEquality: "===",
    ast.BinaryOperator.CaseInequality: "!==", ast.BinaryOperator.GreaterThanEqual: ">=",
    ast.BinaryOperator.GreaterThan: ">", ast.BinaryOperator.LessThanEqual: "<=",
    ast.BinaryOperator.LessThan: "<", ast.BinaryOperator.LogicalAnd: "&&",
    ast.BinaryOperator.LogicalOr: "||", ast.BinaryOperator.LogicalShiftLeft: "<<",
    ast.BinaryOperator.LogicalShiftRight: ">>", ast.BinaryOperator.ArithmeticShiftLeft: "<<<",
    ast.BinaryOperator.ArithmeticShiftRight: ">>>", ast.BinaryOperator.Power: "**",
}

# Functions Yosys evaluates itself; printed as calls.
_PASSTHROUGH_CALLS = {"$countones", "$onehot", "$onehot0", "$signed", "$unsigned"}


@dataclass
class SampledRegister:
    """A register holding a past sample of an expression."""
    name: str
    width: int
    source: str          # Verilog expression (or another register) it samples
    enable: str = ""     # $past gating expression ("" = always)
    clock: str = ""      # sampling clock ("" = the property's)


@dataclass
class ExprContext:
    """What the printer needs from the compiler for one property."""
    signal_names: dict[str, str]                 # target-relative path -> port name
    local_names: dict[str, str] = field(default_factory=dict)   # local var -> register
    registers: list[SampledRegister] = field(default_factory=list)
    target_prefix: str = ""                      # hierarchical path of the target
    values: dict = field(default_factory=dict)   # procedural variable values (ir.Bound)
    clock: str = ""                              # clock of the part being compiled
    _reg_index: dict[tuple[str, int, str, str], str] = field(default_factory=dict)
    fresh: Optional[Callable[[str], str]] = None
    wire: Optional[Callable[[str, str, int], str]] = None   # (kind, value, width) -> wire name
    # (expression in the target's scope, width) -> monitor port connected to it
    element: Optional[Callable[[str, int], str]] = None
    raw: bool = False      # print with the target's own names (for port connections)
    lvalue: str = ""       # the target's old value, while printing a compound assignment

    @contextmanager
    def reading(self, values: dict):
        """Print with these procedural variable values (see ir.Bound)."""
        outer, self.values = self.values, values
        try:
            yield
        finally:
            self.values = outer

    def past(self, source: str, width: int, depth: int, enable: str = "") -> str:
        """Name of a register chain giving `source` delayed by `depth` ticks."""
        if self.raw:
            raise ExprUnsupported("sampled-value functions in an array index are not supported")
        name = source
        for d in range(1, depth + 1):
            key = (source, d, enable, self.clock)
            if key not in self._reg_index:
                reg = self.fresh("past") if self.fresh else f"_va_past_{len(self.registers)}"
                self.registers.append(SampledRegister(reg, width, name, enable, self.clock))
                self._reg_index[key] = reg
            name = self._reg_index[key]
        return name


class ExprPrinter:
    def __init__(self, ctx: ExprContext):
        self.ctx = ctx

    # Entry points

    def boolean(self, expr) -> str:
        """Truth value of an expression as a 1-bit Verilog expression."""
        text = self.print(expr)
        return f"(|({text}))" if self.width(expr) != 1 else f"({text})"

    def condition(self, cond) -> str:
        """A branch or check condition (ir condition classes, or a slang
        expression) as a 1-bit Verilog expression."""
        if isinstance(cond, Bound):
            with self.ctx.reading(cond.values):
                return self.condition(cond.expr)
        if isinstance(cond, NegatedCondition):
            return f"!{self.condition(cond.cond)}"
        if isinstance(cond, RangeCondition):
            value = self.print(cond.expr)
            return f"((({value}) >= {cond.lo}) && (({value}) <= {cond.hi}))"
        if isinstance(cond, CaseCondition):
            subject = self.print(cond.subject)
            width = self.width(cond.subject)
            return "(" + " || ".join(self.case_item(subject, width, i, cond.match) for i in cond.items) + ")"
        return self.boolean(cond)

    def case_item(self, subject: str, width: int, item, match: str) -> str:
        if match == "inside" and isinstance(item, ast.ValueRangeExpression):
            return f"((({subject}) >= ({self.print(item.left)})) && (({subject}) <= ({self.print(item.right)})))"
        value = item.value if match and isinstance(item, ast.IntegerLiteral) else None
        if value is not None and value.hasUnknown:
            # wildcard bits (z/? for casez, also x for casex and case inside)
            dont_care = "z" if match == "z" else "xz"
            bits = value.toString(_binary_base(), False).rjust(self.width(item), "0")
            size = max(width, len(bits))
            bits = bits.rjust(size, "0")
            mask = "".join("0" if b in dont_care else "1" for b in bits)
            want = "".join("0" if b in dont_care else b for b in bits)
            return f"((({subject}) & {size}'b{mask}) == {size}'b{want})"
        return f"(({subject}) == ({self.print(item)}))"

    def print(self, e) -> str:
        const = self.constant(e)
        if const is not None:
            return const
        handler = getattr(self, f"_{type(e).__name__}", None)
        if handler is None:
            raise ExprUnsupported(f"expression '{self.text(e)}' ({e.kind.name}) is not supported")
        return handler(e)

    # Helpers

    @staticmethod
    def width(e) -> int:
        return e.type.bitWidth

    @staticmethod
    def text(e) -> str:
        syn = getattr(e, "syntax", None)
        return " ".join(str(syn).split())[:60] if syn is not None else e.kind.name

    def constant(self, e) -> Optional[str]:
        if isinstance(e, ast.AssertionInstanceExpression):
            return None
        cv = e.constant
        if cv is None or cv.value is None:
            return None
        return self.literal(cv, e.type)

    @staticmethod
    def literal(cv, typ) -> Optional[str]:
        """Sized Verilog literal for an integral constant of type `typ`."""
        value = cv.value if cv is not None else None
        width = typ.bitWidth
        if value is None or width <= 0 or not typ.isIntegral:
            return None
        signed = typ.isSigned
        try:
            if value.hasUnknown:
                bits = value.toString(_binary_base(), False)
                return f"{width}'{'s' if signed else ''}b{bits}"
            number = int(value) & ((1 << width) - 1)
        except (TypeError, ValueError, AttributeError):
            return None
        return f"{width}'{'s' if signed else ''}h{number:x}"

    def cast(self, inner: str, width: int, signed: bool, src_signed: bool) -> str:
        # Parenthesised: Yosys's read -sv parses `~32'(x)` as `(~32)'(x)`
        text = f"({width}'({inner}))"
        if signed != src_signed:
            text = f"$signed({text})" if signed else f"$unsigned({text})"
        return text

    # Node handlers (named after pyslang classes)

    def _IntegerLiteral(self, e) -> str:
        # Literals slang did not fold (e.g. items of a `case` property)
        text = self.literal(SimpleNamespace(value=e.value), e.type)
        if text is None:
            raise ExprUnsupported(f"literal '{self.text(e)}' is not supported")
        return text

    def _NamedValueExpression(self, e) -> str:
        return self.value_symbol(e.symbol, e)

    def _HierarchicalValueExpression(self, e) -> str:
        return self.value_symbol(e.symbol, e)

    def value_symbol(self, sym, e) -> str:
        if sym.kind in (ast.SymbolKind.Parameter, ast.SymbolKind.EnumValue):
            # Hierarchical references (dut.DEPTH) and package enum values (tlul_pkg::Get) in a
            # property are not always constant-folded by slang
            literal = self.literal(sym.value, e.type)
            if literal is None:
                raise ExprUnsupported(f"{'parameter' if sym.kind == ast.SymbolKind.Parameter else 'enum value'} "
                                      f"'{sym.name}' has no integral value")
            return literal
        if self.ctx.raw:
            # an array index, connected in the target: its own signals only
            prefix = self.ctx.target_prefix + "."
            value = self.ctx.values.get(sym.hierarchicalPath)
            if isinstance(value, UnknownValue):
                raise ExprUnsupported(f"'{sym.name}' is read after it was {value.how}; the tool cannot "
                                      f"follow that value")
            if sym.hierarchicalPath in self.ctx.values or not sym.hierarchicalPath.startswith(prefix) \
                    or isinstance(sym.parentScope, (ast.StatementBlockSymbol, ast.SubroutineSymbol)):
                raise ExprUnsupported(f"array index '{sym.name}' is not a signal of the checked module")
            return sym.hierarchicalPath[len(prefix):]
        if sym.hierarchicalPath in self.ctx.values:
            return self.procedural_value(self.ctx.values[sym.hierarchicalPath], sym)
        if isinstance(sym.parentScope, (ast.StatementBlockSymbol, ast.SubroutineSymbol)):
            raise ExprUnsupported(f"'{sym.name}' is read before it is assigned in its procedure")
        if sym.kind == ast.SymbolKind.LocalAssertionVar:
            if sym.name not in self.ctx.local_names:
                raise ExprUnsupported(f"local variable '{sym.name}' is used outside its sequence")
            return self.ctx.local_names[sym.name]
        path = through_bind(sym).hierarchicalPath
        prefix = self.ctx.target_prefix + "."
        rel = path[len(prefix):] if path.startswith(prefix) else None
        if rel is None or rel not in self.ctx.signal_names:
            raise ExprUnsupported(f"'{path}' is not a signal of the checked module")
        return self.ctx.signal_names[rel]

    def procedural_value(self, value, sym) -> str:
        """A variable's value at this point of its procedure (see ir.Bound)."""
        if value is None:                      # its own (signal) value
            with self.ctx.reading({k: v for k, v in self.ctx.values.items() if k != sym.hierarchicalPath}):
                return self.value_symbol(sym, None)
        if isinstance(value, UnknownValue):
            raise ExprUnsupported(f"'{sym.name}' is read after it was {value.how}; the tool cannot "
                                  f"follow that value")
        width, signed = sym.type.bitWidth, sym.type.isSigned
        if isinstance(value, ConstValue):
            return f"{'-' if value.value < 0 else ''}{value.width}'{'s' if value.signed else ''}d{abs(value.value)}"
        if isinstance(value, MuxValue):
            cond = self.condition(value.cond)
            return f"({cond} ? {self.procedural_value(value.then, sym)} : {self.procedural_value(value.other, sym)})"
        with self.ctx.reading(value.values):
            if isinstance(value, AssignValue):
                text, src_signed = self.assigned(value.assign, sym), signed
            else:
                text, src_signed = self.print(value.expr), value.expr.type.isSigned
                if re.fullmatch(r"[A-Za-z_]\w*", text) and value.expr.type.bitWidth == width:
                    return text if src_signed == signed else self.cast(text, width, signed, src_signed)
        # the variable's width, whatever the width of the expression it is read in
        return self.cast(text, width, signed, src_signed)

    def assigned(self, node, sym) -> str:
        """The value of `sym` after `node`: a compound or partial assignment,
        or ++/--."""
        width = sym.type.bitWidth
        if isinstance(node, ast.UnaryExpression):
            op = "+" if node.op.name.endswith("increment") else "-"
            return f"({self.print(node.operand)} {op} {width}'d1)"
        if node.isCompound:
            outer, self.ctx.lvalue = self.ctx.lvalue, self.print(node.left)
            try:
                return self.print(node.right)
            finally:
                self.ctx.lvalue = outer
        # x[i] = v, x[hi:lo] = v, x[i +: w] = v: replace those bits of the old value
        sel = node.left
        old, part = self.print(sel.value), sel.type.bitWidth
        rng = sel.value.type.fixedRange
        down = rng.left >= rng.right
        element = width // (abs(rng.left - rng.right) + 1)
        if isinstance(sel, ast.ElementSelectExpression):
            low = self.print(sel.selector)                              # index of the lowest bit
        else:
            left, right = self.print(sel.left), self.print(sel.right)
            kind = sel.selectionKind
            if kind == ast.RangeSelectionKind.Simple:
                low = right                                             # [hi:lo] or [lo:hi], declared alike
            elif kind == ast.RangeSelectionKind.IndexedUp:
                low = left if down else f"({left} + {right} - 1)"
            else:
                low = f"({left} - {right} + 1)" if down else left
        # an index outside the range shifts the mask out: the write is ignored
        offset = f"({low} - {rng.right})" if down else f"({rng.right} - {low})"
        shift = f"({element} * {offset})" if element > 1 else offset
        mask = f"{width}'d{(1 << part) - 1}"
        new = self.cast(self.print(node.right), width, False, False)
        return f"(({old} & ~({mask} << {shift})) | (({new} & {mask}) << {shift}))"

    def _LValueReferenceExpression(self, e) -> str:
        if not self.ctx.lvalue:
            raise ExprUnsupported(f"'{self.text(e)}' is not supported")
        return self.ctx.lvalue

    def _ConversionExpression(self, e) -> str:
        op = e.operand
        inner = self.print(op)
        tgt, src = e.type, op.type
        if not tgt.isIntegral or not src.isIntegral:
            raise ExprUnsupported(f"non-integral conversion in '{self.text(e)}'")
        if tgt.bitWidth == src.bitWidth and tgt.isSigned == src.isSigned:
            return inner
        return self.cast(inner, tgt.bitWidth, tgt.isSigned, src.isSigned)

    def _UnaryExpression(self, e) -> str:
        if e.op not in _UNARY:
            raise ExprUnsupported(f"operator in '{self.text(e)}' is not supported")
        return f"({_UNARY[e.op]}{self.print(e.operand)})"

    def _BinaryExpression(self, e) -> str:
        left, right = self.print(e.left), self.print(e.right)
        op = e.op
        if op == ast.BinaryOperator.LogicalImplication:
            return f"(!({left}) || ({right}))"
        if op == ast.BinaryOperator.LogicalEquivalence:
            return f"((|({left})) == (|({right})))"
        if op in (ast.BinaryOperator.CaseEquality, ast.BinaryOperator.CaseInequality):
            # 2-state formal model: case equality equals logical equality
            return f"({left} {'==' if op == ast.BinaryOperator.CaseEquality else '!='} {right})"
        if op in (ast.BinaryOperator.WildcardEquality, ast.BinaryOperator.WildcardInequality):
            raise ExprUnsupported(f"wildcard equality in '{self.text(e)}' is not supported")
        return f"({left} {_BINARY[op]} {right})"

    def _ConditionalExpression(self, e) -> str:
        conds = list(e.conditions)
        if len(conds) != 1 or conds[0].pattern is not None:
            raise ExprUnsupported(f"pattern-matching conditional in '{self.text(e)}'")
        return f"({self.boolean(conds[0].expr)} ? {self.print(e.left)} : {self.print(e.right)})"

    def _ElementSelectExpression(self, e) -> str:
        if self.ctx.raw:
            return f"{self.print(e.value)}[{self.print(e.selector)}]"
        if e.value.type.isUnpackedArray:
            # an array element (mem[i]): the monitor gets the element through
            # a port connected to it in the target, never the whole array
            if self.ctx.element is None:
                raise ExprUnsupported(f"array element '{self.text(e)}' is not supported here")
            raw = ExprPrinter(ExprContext({}, target_prefix=self.ctx.target_prefix,
                                          values=self.ctx.values, raw=True))
            return self.ctx.element(raw.print(e), self.width(e))
        return f"{self.selectable(e.value)}[{self.print(e.selector)}]"

    def _RangeSelectExpression(self, e) -> str:
        base = self.selectable(e.value)
        left, right = self.print(e.left), self.print(e.right)
        kind = e.selectionKind
        if kind == ast.RangeSelectionKind.IndexedUp:
            return f"{base}[{left} +: {right}]"
        if kind == ast.RangeSelectionKind.IndexedDown:
            return f"{base}[{left} -: {right}]"
        return f"{base}[{left}:{right}]"

    def _MemberAccessExpression(self, e) -> str:
        """A member of a packed struct or union is a part of its bits (the
        monitor sees the value as a plain vector): `tl_i.a_user.cmd_intg` is
        tl_i[hi:lo], the field offsets added up along the chain."""
        offset, base = 0, e
        while isinstance(base, ast.MemberAccessExpression) and \
                base.value.type.canonicalType.kind in (ast.SymbolKind.PackedStructType, ast.SymbolKind.PackedUnionType):
            offset += base.member.bitOffset
            base = base.value
        if base is e:
            raise ExprUnsupported(f"member access '{self.text(e)}' of an unpacked struct, a class or an interface")
        return f"{self.selectable(base)}[{offset + self.width(e) - 1}:{offset}]"

    def selectable(self, e) -> str:
        """Selects need a plain name in Verilog-2005: a computed value (a
        function result, a concatenation, an array element) gets a wire."""
        text = self.print(e)
        if re.fullmatch(r'[A-Za-z_]\w*', text):
            return text
        if self.ctx.wire is None:
            raise ExprUnsupported(f"bit/part select of a computed value in '{self.text(e)}'")
        return self.ctx.wire("sel", text, self.width(e))

    def _ConcatenationExpression(self, e) -> str:
        return "{" + ", ".join(self.print(op) for op in e.operands) + "}"

    def _ReplicationExpression(self, e) -> str:
        return "{" + self.print(e.count) + "{" + self.print(e.concat) + "}}"

    def _InsideExpression(self, e) -> str:
        left = self.print(e.left)
        terms = []
        for item in e.rangeList:
            if isinstance(item, ast.ValueRangeExpression):
                terms.append(f"(({left}) >= {self.print(item.left)} && ({left}) <= {self.print(item.right)})")
            else:
                terms.append(f"(({left}) == {self.print(item)})")
        return "(" + " || ".join(terms or ["1'b0"]) + ")"

    def _UnbasedUnsizedIntegerLiteral(self, e) -> str:
        text = str(e.syntax).strip()
        bit = text[-1:].lower()
        if bit not in "01xz":
            raise ExprUnsupported(f"literal '{text}'")
        width = self.width(e)
        return f"{width}'b{bit * width}"

    def _CallExpression(self, e) -> str:
        name = e.subroutineName
        args = list(e.arguments)
        if name in _PASSTHROUGH_CALLS:
            return f"{name}(" + ", ".join(self.print(a) for a in args) + ")"
        if name == "$isunknown":
            return "1'b0"            # 2-state formal model has no X/Z
        if name == "$sampled":
            return self.print(args[0])
        if name == "$past":
            return self.past_call(e, args)
        if name in ("$rose", "$fell", "$stable", "$changed"):
            return self.edge_call(name, e, args)
        if not name.startswith("$"):
            return self.inline_function(e, args)
        raise ExprUnsupported(f"function '{name}' is not supported")

    def inline_function(self, e, args) -> str:
        """A user function whose body is one statement: `return expr;` or
        `<function name> = expr;`."""
        sub = e.subroutine
        body = getattr(sub, "body", None)
        while isinstance(body, (ast.BlockStatement, ast.StatementList)):
            items = list(body.list) if isinstance(body, ast.StatementList) else [body.body]
            body = items[0] if len(items) == 1 else None
        result = None
        if isinstance(body, ast.ReturnStatement):
            result = body.expr
        elif isinstance(body, ast.ExpressionStatement) and isinstance(body.expr, ast.AssignmentExpression) \
                and body.expr.op is None and body.expr.left.getSymbolReference() is sub.returnValVar:
            result = body.expr.right
        if result is None:
            raise ExprUnsupported(f"function '{e.subroutineName}' has more than one statement")
        formals = {f.hierarchicalPath: ExprValue(a, dict(self.ctx.values)) for f, a in zip(sub.arguments, args)}
        with self.ctx.reading({**self.ctx.values, **formals}):
            text = self.print(result)
        ret, out = result.type, e.type
        if ret.bitWidth == out.bitWidth and ret.isSigned == out.isSigned:
            return text
        return self.cast(text, out.bitWidth, out.isSigned, ret.isSigned)

    def past_call(self, e, args) -> str:
        value = args[0]
        depth = 1
        if len(args) > 1 and args[1] is not None and args[1].kind != ast.ExpressionKind.EmptyArgument:
            depth_const = args[1].constant
            if depth_const is None or depth_const.value is None:
                raise ExprUnsupported("$past depth must be a constant")
            depth = int(depth_const.value)
        enable = ""
        if len(args) > 2 and args[2] is not None and args[2].kind != ast.ExpressionKind.EmptyArgument:
            enable = self.boolean(args[2])
        if len(args) > 3 and args[3] is not None and args[3].kind != ast.ExpressionKind.EmptyArgument:
            raise ExprUnsupported("$past with its own clocking event is not supported")
        if depth < 1:
            return self.print(value)
        return self.ctx.past(self.print(value), self.width(value), depth, enable)

    def edge_call(self, name: str, e, args) -> str:
        if len(args) > 1 and args[1] is not None and args[1].kind != ast.ExpressionKind.EmptyArgument:
            raise ExprUnsupported(f"{name} with its own clocking event is not supported")
        value = args[0]
        now = self.print(value)
        width = self.width(value)
        prev = self.ctx.past(now, width, 1)
        if name == "$rose":
            return f"({self.lsb(now, width)} && !{self.lsb(prev, width)})"
        if name == "$fell":
            return f"(!{self.lsb(now, width)} && {self.lsb(prev, width)})"
        if name == "$stable":
            return f"(({now}) == {prev})"
        return f"(({now}) != {prev})"

    @staticmethod
    def lsb(text: str, width: int) -> str:
        if width == 1:
            return f"({text})"
        if re.fullmatch(r'[A-Za-z_]\w*', text):
            return f"{text}[0]"
        return f"(1'({text}))"


def _binary_base():
    from pyslang import LiteralBase
    return LiteralBase.Binary
