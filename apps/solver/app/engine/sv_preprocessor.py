"""
SystemVerilog Preprocessor for Yosys Compatibility

Transforms valid SV constructs that yosys cannot parse into
semantically equivalent forms that yosys accepts.

Transformations applied:
  1. Packed 2D arrays  →  unpacked arrays
       logic [D-1:0][W-1:0] mem;  →  logic [W-1:0] mem [0:D-1];
  2. localparam logic typed  →  strip the `logic` type keyword
       localparam logic [N-1:0] X = ...  →  localparam [N-1:0] X = ...
  3. Signed packed 2D  →  unpacked signed
       logic signed [D-1:0][W-1:0] mem;  →  logic signed [W-1:0] mem [0:D-1];
"""

import logging
import re

logger = logging.getLogger("veriassist.sv_preprocessor")


# ── Transformation 1 ─────────────────────────────────────────────
# Packed 2D array:  logic [D][W] name  →  logic [W] name [0:D-1]
#
# Matches:  (logic|wire|reg) [signed] [outer_range] [inner_range] identifier
# The outer range becomes the unpacked dimension appended after the name.
#
_PACKED_2D_RE = re.compile(
    r"\b(logic|wire|reg)\b"  # type keyword
    r"(\s+signed)?"  # optional signed
    r"\s*"
    r"(\[[^\[\]]+\])"  # outer dimension  [D-1:0]
    r"\s*"
    r"(\[[^\[\]]+\])"  # inner dimension  [W-1:0]
    r"\s+"
    r"(\w+)"  # identifier
    r"(?=\s*[;,=])",  # followed by ; , or = (not another [)
)


def _convert_packed_2d(m: re.Match) -> str:
    type_kw = m.group(1)
    signed = (m.group(2) or "").strip()
    outer_dim = m.group(3)  # e.g. [DEPTH-1:0]
    inner_dim = m.group(4)  # e.g. [WIDTH-1:0]
    name = m.group(5)

    # Convert outer [N-1:0] → [0:N-1] for unpacked dimension
    unpacked = _invert_range(outer_dim)

    parts = [type_kw]
    if signed:
        parts.append(signed)
    parts.append(inner_dim)
    parts.append(f"{name} {unpacked}")
    return " ".join(parts)


def _invert_range(dim: str) -> str:
    """
    Convert [hi:lo] → [lo:hi].
    E.g. [DEPTH-1:0] → [0:DEPTH-1]
         [7:0]       → [0:7]
    Falls back to [0:<original_content-1>] for simple N forms like [8].
    """
    inner = dim.strip()[1:-1]  # strip [ ]
    if ":" in inner:
        hi, lo = inner.split(":", 1)
        return f"[{lo.strip()}:{hi.strip()}]"
    # Single value like [8] → treat as [8-1:0] → [0:8-1]
    return f"[0:{inner.strip()}-1]"


# ── Transformation 2 ─────────────────────────────────────────────
# localparam logic [N-1:0] X = ...  →  localparam [N-1:0] X = ...
# localparam logic X = ...          →  localparam X = ...
#
_LOCALPARAM_LOGIC_RE = re.compile(r"\b(localparam|parameter)\s+logic\b")


def _strip_localparam_logic(m: re.Match) -> str:
    return m.group(1)


# ── Public API ────────────────────────────────────────────────────


def preprocess(source: str, filename: str = "") -> str:
    """
    Apply all yosys-compatibility transformations to a SV source string.
    Returns the transformed source.
    """
    changes = []

    # Pass 1: localparam logic  (do before packed-2D so we don't mangle it)
    result, n = _LOCALPARAM_LOGIC_RE.subn(_strip_localparam_logic, source)
    if n:
        changes.append(f"stripped 'logic' from {n} localparam declaration(s)")
    source = result

    # Pass 2: packed 2D arrays
    result, n = _PACKED_2D_RE.subn(_convert_packed_2d, source)
    if n:
        changes.append(f"converted {n} packed 2D array(s) to unpacked")
    source = result

    if changes:
        label = f" ({filename})" if filename else ""
        logger.info(f"sv_preprocessor{label}: {'; '.join(changes)}")
    else:
        logger.debug(f"sv_preprocessor: no changes needed for {filename or 'source'}")

    return source


def preprocess_files(files: dict[str, str]) -> dict[str, str]:
    """
    Preprocess a dict of {filename: content} and return transformed dict.
    Only processes .sv and .v files; passes others through unchanged.
    """
    result = {}
    for fname, content in files.items():
        if fname.endswith((".sv", ".v", ".sva")):
            result[fname] = preprocess(content, fname)
        else:
            result[fname] = content
    return result
