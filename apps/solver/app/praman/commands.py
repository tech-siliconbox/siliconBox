"""
The Tcl commands of Praman.

The names and options follow JasperGold's, so the scripts its users write
(clear / analyze / elaborate / clock / reset / prove) run here.  Three kinds:

  implemented   below (Commands.cmd_<name>)
  accepted      settings of JasperGold's own engines and grid; they have no
                meaning here, so they are accepted with a note and change
                nothing (ACCEPTED)
  unavailable   commands that change what is verified (restrict, ...) and
                are not built yet: an error, so a
                script never runs to the end with a different meaning than
                it was written for (UNAVAILABLE)

Commands run on the session's worker thread, one at a time; a proof started
with `prove -bg` runs on a thread of its own.
"""

from __future__ import annotations

import fnmatch
import logging
import re
import uuid
import threading
import time
from typing import TYPE_CHECKING, AbstractSet, Optional

from app.praman import sources
from app.praman.tclhost import CommandError, ExitRequested, tcl_list, tcl_split
from app.praman.services.uploads import join_sources

if TYPE_CHECKING:
    from app.praman.session import Proof, Prop, Session

logger = logging.getLogger("praman.commands")

IMPLEMENTED = [
    "clear", "analyze", "elaborate", "clock", "reset", "prove", "stop", "report", "case_split",
    "assert", "assume", "cover", "stopat", "abstract", "task", "check_assumptions", "get_needed_assumptions", "check_reset",
    "check_conn", "check_cov",
    "check_strength", "check_equivalence",
    "get_property_list", "get_design_info", "get_clock_info", "get_reset_info",
    "set_prove_time_limit", "set_prove_per_property_time_limit", "set_max_trace_length",
    "visualize", "help", "version", "exit", "glob",
]
ACCEPTED = [
    "set_message", "set_automatic_library_search", "set_proof_simplification",
    "set_cache_proof_simplification", "set_engine_mode", "set_engine_threads", "set_prove_cache",
    "set_proofgrid_mode", "set_proofgrid_shell", "set_proofgrid_socket_communication",
    "set_proofgrid_max_jobs", "set_proofgrid_max_local_jobs", "set_proofgrid_per_engine_max_jobs",
    "set_proofgrid_per_engine_max_local_jobs", "set_proofgrid_restarts", "set_word_level_reduction",
    "set_parallel_proof_mode", "set_prove_orchestration", "set_capture_elaborated_design",
]
UNAVAILABLE = [
    "restrict",
    "check_spv", "check_sec", "check_cdc", "sanity_check",
    "save", "restore", "connect", "set_reset_max_iterations", "schematic_viewer",
]
COMMAND_NAMES = [*IMPLEMENTED, *ACCEPTED, *UNAVAILABLE, "__read"]

HELP = {
    "clear": "clear -all                       Forget everything analyzed, elaborated and proved.",
    "analyze": "analyze -sv <file>... [-f <filelist>]   Read source files (check their syntax).",
    "elaborate": "elaborate -top <module> [-create_related_covers {precondition witness | none}]\n"
                 "                                   Build the design hierarchy and the property table.",
    "clock": "clock <signal> | clock -none     Declare the clock (-none: a combinational design).",
    "reset": "reset <expr> | reset -none       Declare the reset, e.g. reset !rst_n (active low).",
    "prove": "prove -all | -property {<names>} [-task <name>] [-bg] [-time_limit <t>]   Prove properties.",
    "stop": "stop                             Stop the running proof.",
    "check_strength": "check_strength [-mutants <n>]   How strong the proven assertions are: small changes\n"
                      "                                   (mutants) are made in the design; a strong set of\n"
                      "                                   assertions fails on each one (the last proof is measured).",
    "check_equivalence": "check_equivalence -revised {<file> ...} [-bounded]\n"
                         "                                   Does a revised design behave like the analyzed one?",
    "case_split": "case_split -property <name> -lowest_bit {<expr>} | -values {<expr>} | -cases {{<expr>} ...}\n"
                  "                                   Prove a hard assertion case by case (and the rest):\n"
                  "                                   -lowest_bit: one case per position of the lowest 1-bit of <expr>\n"
                  "                                   -values:     one case per value of <expr> (up to 10 bits)\n"
                  "                                   -cases:      your own cases; -clear removes the split",
    "assert": "assert|assume|cover [-name <name>] {<expr>}   Add a property written in Tcl, in the\n"
              "                                   top module's scope, clocked by the declared clock and\n"
              "                                   disabled during the reset.\n"
              "assert|assume|cover -disable|-enable|-remove {<names>}   Leave out (assumptions are no\n"
              "                                   longer assumed), take back, or delete one written in Tcl.",
    "stopat": "stopat {<signals>} | -remove {<signals>} | -clear | -list\n"
              "                                   Cut signals: each takes any value in any cycle instead of\n"
              "                                   its logic (a signal below the top by path: u_core.state).",
    "abstract": "abstract -init_value {<regs>} | -counter {<regs>} | -remove {<regs>} | -clear | -list\n"
                "                                   -init_value: the register starts from any value after the reset;\n"
                "                                   -counter: it may jump to any value in any cycle, otherwise it\n"
                "                                   counts as written.  Proofs stay valid for the real design.",
    "task": "task -create <name> [-copy {<props>}] [-copy_assumes] [-set] | -set <name> | -remove <name> | -list\n"
            "                                   A set of properties proven under its own assumptions; copies\n"
            "                                   are named <task>::<name>.  prove works on the current task\n"
            "                                   (task -set <embedded> goes back to the elaborated one).",
    "check_assumptions": "check_assumptions [-dead_end]     Can the assumptions all hold?  If they contradict each\n"
                         "                                   other, which ones conflict.  -dead_end: also a state the\n"
                         "                                   design reaches where no input satisfies them.",
    "get_needed_assumptions": "get_needed_assumptions -property <name>   The assumptions a proven property\n"
                              "                                   needs (each one it holds without is left out).",
    "check_reset": "check_reset                      Which registers the reset does not set (they start from\n"
                   "                                   any value in a proof).",
    "check_conn": "check_conn -load <file.csv>      Connectivity: one assertion per row of the spreadsheet\n"
                  "                                   (name, source, destination, condition, latency).",
    "check_cov": "check_cov                        Formal coverage: can every branch of the design be reached?\n"
                 "                                   Each is covered (with a trace) or proven unreachable.",
    "report": "report                           Print the summary of the results.",
    "get_property_list": "get_property_list [-include {type {assert} status {cex}}]   Names of the properties.",
    "get_design_info": "get_design_info                  Top module, instances and properties of the design.",
    "get_clock_info": "get_clock_info                   The declared clock.",
    "get_reset_info": "get_reset_info                   The declared reset.",
    "set_prove_time_limit": "set_prove_time_limit <t>         Time limit of a whole proof (30s, 10m, 4h).",
    "set_prove_per_property_time_limit": "set_prove_per_property_time_limit <t>   Time limit of one engine run.",
    "set_max_trace_length": "set_max_trace_length <n>         Cycles checked by the bounded engines.",
    "visualize": "visualize -violation -property <name>   Open the trace of a property.",
    "help": "help [<command>]                 This list.",
    "version": "version                          The version of Praman.",
    "exit": "exit                             Stop the script (the session stays open).",
    "source": "source <file> | include <file>   Run a Tcl file of the session, e.g. source pm.tcl.",
}

MAX_CASES = 2000         # cases of one split assertion
LANGUAGES = {"-sv", "-sv05", "-sv09", "-sv11", "-sv12", "-sv17", "-v2k", "-v95", "-verilog", "-systemverilog"}
_TIME = re.compile(r"^(\d+(?:\.\d+)?)\s*([smhd]?)$")
_RESET = re.compile(r"^\(*\s*([!~]?)\s*\(*\s*([A-Za-z_][\w$.]*)\s*\)*\s*\)*$")

# What the engine reports -> the status shown (JasperGold's words)
STATUS = {
    "PROVEN": "proven", "HOLDS_BOUNDED": "undetermined", "FAIL": "cex", "VACUOUS": "vacuous",
    "COVERED": "covered", "UNREACHABLE": "unreachable", "NOT_REACHED": "undetermined",
    "TIMEOUT": "undetermined", "ERROR": "error",
}


_versions: Optional[dict] = None


def _tool_versions() -> dict:
    """Versions of the engines, read once (kept with every run)."""
    global _versions
    if _versions is None:
        import subprocess
        found = {}
        for tool, args in (("yosys", ["yosys", "-V"]), ("tcl", None)):
            if args is None:
                continue
            try:
                # "Yosys 0.64 (git sha1 ..., clang++ ...)" -> "Yosys 0.64"
                found[tool] = " ".join(subprocess.run(args, capture_output=True, text=True, timeout=20)
                                       .stdout.split()[:2]) or "unknown"
            except (OSError, subprocess.TimeoutExpired):
                found[tool] = "not found"
        _versions = found
    return _versions


def _engine_label(prop) -> str:
    """The engine's label of a related cover ("P:precondition1" -> "P__pre")."""
    from app.praman.services.sva.compiler import PRECONDITION_SUFFIX, WITNESS_SUFFIX
    suffix = {"precondition": PRECONDITION_SUFFIX, "witness": WITNESS_SUFFIX}[prop.related]
    return label_of(prop.parent) + suffix


def label_of(prop_id: str) -> str:
    """The engine's label of a row: a copy in a task is "<task>::<label>"."""
    return prop_id.rsplit("::", 1)[-1]


def in_task(task: str, label: str) -> str:
    """The row id of an engine label in a task."""
    return f"{task}::{label}" if task else label


EMBEDDED = "<embedded>"


def _abstract_text(entry: str) -> str:
    kind, signal = entry.split(":", 1)
    return f"{signal} ({'initial value' if kind == 'init' else 'counter'})"


def _prop_id(engine_label: str) -> str:
    """The property table's id of an engine label that is a related cover ("" if it is not one)."""
    from app.praman.services.sva.compiler import PRECONDITION_SUFFIX, WITNESS_SUFFIX
    for suffix, which in ((PRECONDITION_SUFFIX, "precondition1"), (WITNESS_SUFFIX, "witness1")):
        if engine_label.endswith(suffix):
            return f"{engine_label[:-len(suffix)]}:{which}"
    return ""


MAX_ENGINE_LINES = 5000           # solver lines logged per proof
MAX_CONFLICT_CHECKS = 20          # check_assumptions: assumptions tried one by one to find a conflict


def _shown_labels(text: str) -> str:
    """Engine labels in a line of solver output as the property table names
    them ("ap_x__pre" -> "ap_x:precondition1"; the assumption check's cover)."""
    from app.praman.services.sva.compiler import PRECONDITION_SUFFIX, WITNESS_SUFFIX
    text = re.sub(rf"\b(\w+?){PRECONDITION_SUFFIX}\b", r"\1:precondition1", text)
    text = re.sub(rf"\b(\w+?){WITNESS_SUFFIX}\b", r"\1:witness1", text)
    return re.sub(r"\b_va_sanity\b", "the assumption check", text)


def scan_limits(limit: int) -> list[int]:
    """Proof time limits of the scans for a per-property limit: 10 s, 100 s,
    1000 s, ... and the limit itself."""
    out, step = [], 10
    while step < limit:
        out.append(step)
        step *= 10
    return [*out, limit]


def parse_time(text: str, what: str) -> int:
    m = _TIME.match(text.strip())
    if not m:
        raise CommandError(f'{what}: "{text}" is not a time (examples: 30s, 10m, 4h, 86400)')
    return max(1, int(float(m.group(1)) * {"": 1, "s": 1, "m": 60, "h": 3600, "d": 86400}[m.group(2)]))


def options(command: str, args: list[str], flags: AbstractSet[str] = frozenset(),
            valued: AbstractSet[str] = frozenset(), ignored_flags: AbstractSet[str] = frozenset(),
            ignored_valued: AbstractSet[str] = frozenset()) -> tuple[dict[str, str], list[str]]:
    """Split a command's arguments into {option: value ("" for a flag)} and the rest."""
    found: dict[str, str] = {}
    rest: list[str] = []
    i = 0
    while i < len(args):
        arg = args[i]
        if arg in flags:
            found[arg] = ""
        elif arg in valued or arg in ignored_valued:
            if i + 1 >= len(args):
                raise CommandError(f'{command}: option "{arg}" needs a value')
            if arg in valued:
                found[arg] = args[i + 1]
            i += 1
        elif arg in ignored_flags:
            pass
        elif arg.startswith("-") and len(arg) > 1 and not arg[1].isdigit():
            raise CommandError(f'{command}: unknown option "{arg}"')
        else:
            rest.append(arg)
        i += 1
    return found, rest


class Commands:
    def __init__(self, session: "Session"):
        self.s = session

    def call(self, name: str, args: list[str]) -> str:
        if name == "__read":
            return self._read(args[0])
        if name in ACCEPTED:
            self.s.log("info", f"{name} is accepted so that existing scripts run; it has no effect in Praman.",
                       code="PMI090")
            return ""
        if name in UNAVAILABLE:
            raise CommandError(
                f'"{name}" is not available in this version of Praman. The script stops here, so that '
                f"results never differ silently from what it was written for.")
        return getattr(self, f"cmd_{name}")(args) or ""

    # ── Files ─────────────────────────────────────────────────

    def _read(self, name: str) -> str:
        found = sources.resolve(name, self.s.files)
        if not found:
            raise CommandError(f'couldn\'t read file "{name}": it is not among the session files '
                               f"(add it with File > Add Files)")
        return self.s.files[found]

    def cmd_glob(self, args: list[str]) -> str:
        opts, patterns = options("glob", args, flags={"-nocomplain", "--"},
                                 valued={"-directory", "-path", "-types", "-tails"})
        names = sorted({f for p in patterns for f in self.s.files if fnmatch.fnmatchcase(f, p)
                        or fnmatch.fnmatchcase(f.rsplit("/", 1)[-1], p)})
        if not names and "-nocomplain" not in opts:
            raise CommandError(f'no files matched glob pattern "{" ".join(patterns)}"')
        return tcl_list(names)

    def cmd_exit(self, args: list[str]) -> str:
        raise ExitRequested("exit")

    # ── clear / analyze / elaborate ───────────────────────────

    def _no_proof_running(self, command: str) -> None:
        if self.s.proof.running:
            raise CommandError(f"{command}: a proof is running; stop it first (stop)")

    def cmd_clear(self, args: list[str]) -> str:
        options("clear", args, flags={"-all", "-design", "-formal", "-jdb"})
        self._no_proof_running("clear")
        with self.s.lock:
            self.s.reset_design()
        self.s.log("info", "Cleared environment completely for new design analysis.", code="PMI005")
        return ""

    def cmd_analyze(self, args: list[str]) -> str:
        from app.praman.elab import check_syntax
        from app.praman.services.compile_worker import run_isolated
        s = self.s
        self._no_proof_running("analyze")
        names = self._file_arguments(args)
        if not names:
            raise CommandError("analyze: no source file given (analyze -sv <file> ...)")
        new = [(name, s.files[name]) for name in dict.fromkeys(names)]
        kept = [(n, t) for n, t in s.analyzed if n not in dict(new)]
        joined = join_sources([*kept, *new], "analyze.sv")
        for name, _ in new:
            s.log("info", f"Analyzing SystemVerilog file '{name}'", code="PMI010")
        errors = 0
        for issue in run_isolated(check_syntax, joined.name, joined.text):
            file, line = joined.locate(issue["line"]) if issue["line"] else ("", 0)
            where = f"{file}({line}): " if file else ""
            if issue["severity"] == "error":
                errors += 1
                s.log("error", f"{where}{issue['message']}", code="PME011")
            else:
                s.log("warning", f"{where}{issue['message']}", code="PMW011")
        if errors:
            raise CommandError(f"analyze: {errors} syntax error{'s' if errors != 1 else ''}; nothing was analyzed")
        with s.lock:
            s.analyzed = [*kept, *new]
            if s.phase == "empty":
                s.phase = "analyzed"
            s.bump()
        if s.phase == "elaborated":
            s.log("info", "The elaborated design is unchanged; run elaborate again to use the new sources.",
                  code="PMI012")
        return ""

    def _file_arguments(self, args: list[str], depth: int = 0) -> list[str]:
        """Session files named by the arguments of analyze (and by its -f file lists)."""
        s = self.s
        names: list[str] = []
        i = 0
        while i < len(args):
            arg = args[i]
            if arg in LANGUAGES or arg == "-clear":
                pass
            elif arg.startswith("-vhdl"):
                raise CommandError("analyze: VHDL sources are not supported; Praman reads SystemVerilog and Verilog")
            elif arg in ("-f", "-F"):
                if i + 1 >= len(args):
                    raise CommandError(f'analyze: option "{arg}" needs a file list')
                if depth > 8:
                    raise CommandError("analyze: file lists are nested too deeply")
                listing = sources.strip_comments(self._read(args[i + 1]))
                lines = [line.split("#", 1)[0] for line in listing.splitlines()]
                names += self._file_arguments(" ".join(lines).split(), depth + 1)
                i += 1
            elif arg.startswith("+define+"):
                raise CommandError(f"analyze: {arg}: macro definitions on the command line are not supported yet; "
                                   f"put the `define into a source file")
            elif arg.startswith("+incdir+") or arg.startswith("+libext+"):
                s.log("info", f"{arg} is ignored: `include looks among the session files.", code="PMI013")
            elif arg in ("-y", "-v", "-library", "-L"):
                raise CommandError(f'analyze: option "{arg}" (libraries) is not supported')
            elif arg.startswith("-"):
                raise CommandError(f'analyze: unknown option "{arg}"')
            else:
                found = sources.resolve(arg, s.files)
                if not found:
                    raise CommandError(f'analyze: file "{arg}" is not among the session files '
                                       f"(add it with File > Add Files)")
                names.append(found)
            i += 1
        return names

    def cmd_elaborate(self, args: list[str]) -> str:
        from app.praman.elab import design_tree
        from app.praman.session import Prop
        from app.praman.services.compile_worker import run_isolated
        from app.praman.services.design_check import _slang_issues
        from app.praman.services.formal_service import compile_design
        from app.praman.services.sva.frontend import FrontendError
        from app.praman.services.sva.pipeline import DesignReadError
        s = self.s
        self._no_proof_running("elaborate")
        opts, rest = options(
            "elaborate", args, valued={"-top", "-create_related_covers"},
            ignored_flags={"-no_type_properties", "-extract_covergroup", "-disable_auto_bbox", "-both_edges"},
            ignored_valued={"-bbox_a", "-bbox_mul", "-bbox_div", "-bbox_mod", "-bbox_pow", "-mode", "-loop_limit"})
        # Related covers of an assertion `a |-> b`: its precondition (a can
        # happen) and its witness (a happens and b holds).  Both by default;
        # -create_related_covers {precondition} or {none} makes fewer.
        related = set(tcl_split(opts["-create_related_covers"])) if "-create_related_covers" in opts \
            else {"precondition", "witness"}
        unknown = related - {"precondition", "witness", "none"}
        if unknown:
            raise CommandError(f'elaborate: -create_related_covers: unknown kind "{sorted(unknown)[0]}" '
                               f"(precondition, witness, none)")
        related.discard("none")
        if rest:
            raise CommandError(f'elaborate: unexpected argument "{rest[0]}"')
        if not s.analyzed:
            raise CommandError("elaborate: nothing is analyzed yet (analyze -sv <file>)")

        top = opts.get("-top", "")
        if not top:
            candidates = sources.top_candidates(s.analyzed)
            if len(candidates) != 1:
                raise CommandError("elaborate: the top module is not clear ("
                                   + (", ".join(candidates) or "no module found")
                                   + "); name it with elaborate -top <module>")
            top = candidates[0]
        design, sva, sva_names = sources.joined(s.analyzed, top)
        by_name = {design.name: design, sva.name: sva}

        def where(location: str) -> tuple[str, int]:
            file, _, line = location.rpartition(":")
            if file in by_name and line.isdigit():
                return by_name[file].locate(int(line))
            return file, int(line) if line.isdigit() else 0

        try:
            prepared = run_isolated(compile_design, sva.text, design.text, design.name, top,
                                    witness_covers="witness" in related)
            found = run_isolated(design_tree, {n: j.text for n, j in by_name.items() if j.text}, prepared.top)
        except DesignReadError as e:
            file, line = where(f"{e.file}:{e.line}") if e.file else ("", 0)
            s.log("error", (f"{file}({line}): " if file else "") + e.message, code="PME021")
            raise CommandError("elaborate: the design could not be read for formal checking")
        except FrontendError as e:
            issues = _slang_issues(str(e), {n: j for n, j in by_name.items() if j.text})
            for issue in issues:
                at = f"{issue['file']}({issue['line']}): " if issue.get("file") else ""
                s.log("error" if issue["severity"] == "error" else "warning", at + issue["message"], code="PME020")
            count = sum(1 for i in issues if i["severity"] == "error") or 1
            raise CommandError(f"elaborate: {count} error{'s' if count != 1 else ''}; the design was not elaborated")

        top = prepared.top
        tree = found["tree"]

        def relocate(node: dict) -> None:
            node["file"], node["line"] = where(f"{node['file']}:{node['line']}")
            for child in node["children"]:
                relocate(child)
        if tree:
            relocate(tree)

        props: dict[str, Prop] = {}
        for p in prepared.properties:
            instance = found["locations"].get(p.location) or p.debug.get("scope") or top
            file, line = where(p.location) if p.location else ("", 0)
            kind = p.kind.value
            prop = Prop(id=p.label, name=f"{instance}.{p.label}", type=kind, instance=instance,
                        file=file, line=line, supported=p.supported)
            if not p.supported:
                prop.status, prop.detail = "error", " ".join(p.problems[0].split())
            elif kind in ("assume", "restrict"):
                prop.status = "assumed"
            props[prop.id] = prop
            for which, present in (("precondition", p.has_precondition), ("witness", p.has_witness)):
                if p.supported and kind == "assert" and present and which in related:
                    child = f"{p.label}:{which}1"
                    props[child] = Prop(id=child, name=f"{prop.name}:{which}1", type="cover",
                                        instance=instance, file=file, line=line, parent=p.label, related=which)

        with s.lock:
            s.design, s.sva, s.top = design, sva, top
            s.tree, s.ports, s.instances = tree, found["ports"], found["instances"]
            s.props = props
            s.related = related
            s.splits, s.tcl_props, s.stopats, s.abstracts = {}, [], [], []   # (JasperGold: a new elaboration drops them)
            s.tasks, s.task = [], ""
            s.clock, s.reset, s.reset_declared = None, None, False
            s.detected = prepared.harness_info()
            s.phase = "elaborated"
            s.bump()

        s.log("info", f'Top module name is "{top}".', code="PMI020")
        if sva_names:
            s.log("info", "Assertion files: " + ", ".join(sva_names) + ".", code="PMI022")
        counts = {k: sum(1 for p in props.values() if p.type == k and not p.related)
                  for k in ("assert", "assume", "cover")}
        related = sum(1 for p in props.values() if p.related)
        s.log("info", f"Elaborated {found['instances']} instance{'s' if found['instances'] != 1 else ''}; "
                      f"{counts['assert']} assertions, {counts['assume']} assumptions, {counts['cover']} covers, "
                      f"{related} related covers.", code="PMI021")
        for prop in props.values():
            if not prop.supported:
                s.log("warning", f'{prop.file}({prop.line}): the property "{prop.name}" cannot be checked: '
                                 f"{prop.detail}", code="PMW023", prop=prop.id)
        return top

    # ── clock / reset ─────────────────────────────────────────

    def _elaborated(self, command: str) -> None:
        if self.s.phase != "elaborated":
            raise CommandError(f"{command}: no design is elaborated (elaborate -top <module>)")

    def _input(self, command: str, signal: str) -> None:
        inputs = [p["name"] for p in self.s.ports if p["direction"] == "input"]
        if signal not in inputs:
            hint = " (signals below the top module cannot be used yet)" if "." in signal else ""
            raise CommandError(f'{command}: "{signal}" is not an input of the top module "{self.s.top}"{hint}; '
                               f"inputs: {', '.join(inputs) or 'none'}")

    def cmd_clock(self, args: list[str]) -> str:
        s = self.s
        opts, rest = options("clock", args, flags={"-none", "-clear", "-both_edges"},
                             ignored_valued={"-factor", "-phase"})
        self._elaborated("clock")
        self._no_proof_running("clock")
        if "-clear" in opts or "-none" in opts:
            if rest:
                raise CommandError("clock: a signal cannot be given together with -none or -clear")
            with s.lock:
                s.clock = None if "-clear" in opts else ""
            if "-none" in opts:
                s.log("info", "No clock: the design is treated as combinational.", code="PMI030")
        else:
            if len(rest) != 1:
                raise CommandError("clock: give one clock signal (clock <signal>), or clock -none")
            self._input("clock", rest[0])
            if s.clock:
                s.log("info", f'The clock "{rest[0]}" is declared as well; properties written without a '
                              f'clock stay on "{s.clock}".', code="PMI033")
            else:
                with s.lock:
                    s.clock = rest[0]
            if "-both_edges" in opts:
                s.log("info", "-both_edges: the edges are taken from the clocking events of the properties.",
                      code="PMI034")
        s.clear_results("the clock changed")
        return ""

    def cmd_reset(self, args: list[str]) -> str:
        s = self.s
        opts, rest = options("reset", args, flags={"-none", "-clear"},
                             valued={"-expr", "-expression"},
                             ignored_valued={"-non_resettable_regs", "-init_state"})
        self._elaborated("reset")
        self._no_proof_running("reset")
        expr = opts.get("-expr") or opts.get("-expression") or " ".join(rest)
        if "-none" in opts or "-clear" in opts:
            with s.lock:
                s.reset = ("", False) if "-none" in opts else None
                s.reset_declared = "-none" in opts
            if "-none" in opts:
                s.log("info", "No reset: the design starts from any state.", code="PMI031")
        else:
            m = _RESET.match(expr.strip())
            if not m:
                if len(expr.split()) > 1:
                    raise CommandError(f'reset: "{expr}" names several signals; one reset signal is supported')
                raise CommandError(f'reset: "{expr}" is not a reset this version understands; '
                                   f"use a signal or its negation, e.g. reset !rst_n")
            active_low, signal = bool(m.group(1)), m.group(2)
            self._input("reset", signal)
            with s.lock:
                s.reset, s.reset_declared = (signal, active_low), True
            s.log("info", f'Current reset condition is "{"!" if active_low else ""}{signal}" '
                          f'(active {"low" if active_low else "high"}).', code="PMI031")
        s.clear_results("the reset changed")
        return ""

    def cmd_get_clock_info(self, args: list[str]) -> str:
        self._elaborated("get_clock_info")
        return "not declared" if self.s.clock is None else self.s.clock or "none"

    def cmd_get_reset_info(self, args: list[str]) -> str:
        self._elaborated("get_reset_info")
        if self.s.reset is None:
            return "not declared"
        signal, active_low = self.s.reset
        return f"{'!' if active_low else ''}{signal}" if signal else "none"

    # ── Settings ──────────────────────────────────────────────

    def cmd_set_prove_time_limit(self, args: list[str]) -> str:
        if len(args) != 1:
            raise CommandError("set_prove_time_limit: give one time, e.g. set_prove_time_limit 4h")
        self.s.settings["time_limit"] = parse_time(args[0], "set_prove_time_limit")
        self.s.bump()
        return ""

    def cmd_set_prove_per_property_time_limit(self, args: list[str]) -> str:
        if len(args) != 1:
            raise CommandError("set_prove_per_property_time_limit: give one time, e.g. 300s")
        self.s.settings["per_property_time_limit"] = parse_time(args[0], "set_prove_per_property_time_limit")
        self.s.bump()
        return ""

    def cmd_set_max_trace_length(self, args: list[str]) -> str:
        if len(args) != 1 or not args[0].isdigit() or not 1 <= int(args[0]) <= 100000:
            raise CommandError("set_max_trace_length: give a number of cycles, e.g. set_max_trace_length 50")
        self.s.settings["max_trace_length"] = int(args[0])
        self.s.bump()
        return ""

    # ── Queries ───────────────────────────────────────────────

    def cmd_get_property_list(self, args: list[str]) -> str:
        opts, _ = options("get_property_list", args, valued={"-include", "-exclude", "-task"})
        self._elaborated("get_property_list")

        def matcher(spec: str):
            items = tcl_split(spec)
            if len(items) % 2:
                raise CommandError('get_property_list: -include expects pairs, e.g. {type {assert} status {cex}}')
            wanted = {items[i]: set(tcl_split(items[i + 1])) for i in range(0, len(items), 2)}
            unknown = set(wanted) - {"type", "status", "name"}
            if unknown:
                raise CommandError(f'get_property_list: unknown filter "{sorted(unknown)[0]}" (type, status, name)')
            return lambda p: (("type" not in wanted or p.type in wanted["type"])
                              and ("status" not in wanted or p.status in wanted["status"])
                              and ("name" not in wanted or any(fnmatch.fnmatchcase(p.name, n) for n in wanted["name"])))
        include = matcher(opts["-include"]) if "-include" in opts else (lambda p: True)
        exclude = matcher(opts["-exclude"]) if "-exclude" in opts else (lambda p: False)
        return tcl_list(p.name for p in self.s.props.values() if include(p) and not exclude(p))

    def cmd_get_design_info(self, args: list[str]) -> str:
        self._elaborated("get_design_info")
        s = self.s
        inputs = sum(1 for p in s.ports if p["direction"] == "input")
        outputs = sum(1 for p in s.ports if p["direction"] == "output")
        user = [p for p in s.props.values() if not p.related]
        s.log("out", "\n".join([
            f"Top module    : {s.top}",
            f"Instances     : {s.instances}",
            f"Ports         : {inputs} inputs, {outputs} outputs",
            f"Properties    : {sum(1 for p in user if p.type == 'assert')} assertions, "
            f"{sum(1 for p in user if p.type == 'assume')} assumptions, "
            f"{sum(1 for p in user if p.type == 'cover')} covers, "
            f"{sum(1 for p in s.props.values() if p.related)} related covers",
        ]))
        return ""

    def cmd_version(self, args: list[str]) -> str:
        from app.praman.session import VERSION
        return f"Praman {VERSION}"

    def cmd_help(self, args: list[str]) -> str:
        if args:
            name = {"assume": "assert", "cover": "assert"}.get(args[0], args[0])    # one entry for the three
            if name in HELP:
                return HELP[name]
            if name in ACCEPTED:
                return f"{name}: accepted so that existing scripts run; it has no effect in Praman."
            if name in UNAVAILABLE:
                return f"{name}: not available in this version of Praman."
            raise CommandError(f'help: unknown command "{name}"')
        self.s.log("out", "\n".join(["Praman commands (Tcl; variables, if, foreach, proc and source work as usual):",
                                     *(f"  {text}" for text in HELP.values())]))
        return ""

    def cmd_visualize(self, args: list[str]) -> str:
        opts, rest = options("visualize", args, valued={"-property", "-task", "-window"},
                             flags={"-violation", "-cover", "-new_window", "-min_length", "-replot"})
        self._elaborated("visualize")
        name = opts.get("-property") or (rest[0] if rest else "")
        if not name:
            raise CommandError("visualize: name the property (visualize -violation -property <name>)")
        props = self._select([name], "visualize")
        prop = props[0]
        if not prop.has_trace:
            raise CommandError(f'visualize: the property "{prop.name}" has no trace '
                               f"(only a counterexample or a covered cover has one; status: {prop.status})")
        self.s.log("ui", "", action={"type": "visualize", "prop": prop.id})
        return prop.status

    # ── case_split ────────────────────────────────────────────

    def _split_sources(self, splits: dict[str, list[str]], tcl: Optional[list[dict]] = None) -> tuple[str, str]:
        """(design text, SVA text) as proved: with the case splits applied
        (app/praman/split.py) and the properties written in Tcl in the top
        module (app/praman/tclprops.py; `tcl`: instead of the session's)."""
        from app.praman import split, tclprops
        s = self.s
        design, sva = s.design.text, s.sva.text if s.sva else ""
        for label, cases in splits.items():
            try:
                if split.find(sva, label):
                    sva = split.split_statement(sva, label, cases)
                else:
                    design = split.split_statement(design, label, cases)
            except split.SplitError as e:
                raise CommandError(f'case_split: "{label}": {e}')
        written = s.tcl_props if tcl is None else tcl
        if written:
            clock, reset = self._tcl_clocking()
            statements = [tclprops.statement(t["name"], t["kind"], t["expr"], clock, reset) for t in written]
            try:
                design, sva = tclprops.insert(design, sva, s.top, statements)
            except tclprops.TclPropertyError as e:
                raise CommandError(str(e))
        return design, sva

    def _tcl_clocking(self) -> tuple[Optional[str], Optional[tuple[str, bool]]]:
        """Clock and reset of the properties written in Tcl: the declared ones,
        else what elaboration found (clock -none / reset -none: none)."""
        s = self.s
        detected = s.detected or {}
        clock = s.clock if s.clock is not None else ((detected.get("clocks") or [None])[0])
        if s.reset is not None:
            reset = s.reset if s.reset[0] else None
        else:
            reset = (detected["signal"], bool(detected.get("active_low"))) if detected.get("signal") else None
        return clock or None, reset

    def _width(self, parent: "Prop", expr: str, splits: dict[str, list[str]]) -> int:
        """The width of `expr` written at the place of the assertion `parent`."""
        from app.praman import split
        from app.praman.elab import probe_widths
        from app.praman.services.compile_worker import run_isolated
        from app.praman.services.design_check import _slang_issues
        from app.praman.services.formal_service import SVA_FILENAME
        from app.praman.services.sva.frontend import FrontendError
        s = self.s
        design, sva = self._split_sources(splits)
        try:
            if split.find(sva, parent.id):
                sva = split.insert_probes(sva, parent.id, [expr])
            else:
                design = split.insert_probes(design, parent.id, [expr])
        except split.SplitError as e:
            raise CommandError(f"case_split: {e}")
        files = {name: text for name, text in ((s.design.name, design), (SVA_FILENAME, sva)) if text.strip()}
        try:
            widths = run_isolated(probe_widths, files, s.top)
        except FrontendError as e:
            by_name = {j.name: j for j in (s.design, s.sva) if j is not None and j.text}
            for issue in _slang_issues(str(e), by_name):
                at = f"{issue['file']}({issue['line']}): " if issue.get("file") else ""
                s.log("error" if issue["severity"] == "error" else "warning", at + issue["message"], code="PME061")
            raise CommandError(f"case_split: {expr} is not an expression at the place of the assertion")
        width = widths.get(0)
        if not width:
            raise CommandError(f"case_split: the width of {expr} could not be found")
        if width > MAX_CASES:
            raise CommandError(f"case_split: {expr} is {width} bits wide; at most {MAX_CASES} cases can be made")
        return width

    def cmd_case_split(self, args: list[str]) -> str:
        from app.praman import split
        from app.praman.session import Prop
        from app.praman.services.compile_worker import run_isolated
        from app.praman.services.design_check import _slang_issues
        from app.praman.services.formal_service import compile_design
        from app.praman.services.sva.frontend import FrontendError
        s = self.s
        opts, rest = options("case_split", args, valued={"-property", "-cases", "-lowest_bit", "-values"},
                             flags={"-clear", "-list"})
        self._elaborated("case_split")
        if "-list" in opts:
            return tcl_list(s.props[label].name for label in s.splits if label in s.props)
        self._no_proof_running("case_split")
        name = opts.get("-property") or (rest[0] if rest else "")
        if not name:
            raise CommandError("case_split: name the assertion (case_split -property <name> -cases {...})")
        chosen = self._select([name], "case_split")
        if len(chosen) != 1:
            raise CommandError(f'case_split: "{name}" names {len(chosen)} properties; split one at a time')
        parent = chosen[0]
        if parent.task:
            raise CommandError(f'case_split: "{parent.name}" is a copy in the task {parent.task}; '
                               f"split the assertion in {EMBEDDED}")
        if parent.type != "assert" or not parent.supported:
            raise CommandError(f'case_split: "{parent.name}" is not an assertion that can be proven')
        descriptions: list[str] = []
        if "-clear" in opts:
            if parent.id not in s.splits:
                raise CommandError(f'case_split: "{parent.name}" is not split')
            cases: list[str] = []
            splits = {label: c for label, c in s.splits.items() if label != parent.id}
        else:
            kinds = [k for k in ("-cases", "-lowest_bit", "-values") if k in opts]
            if len(kinds) != 1:
                raise CommandError("case_split: say how to split, with one of -lowest_bit {<expr>}, "
                                   "-values {<expr>} or -cases {{<expr>} ...}")
            descriptions: list[str] = []
            if kinds[0] == "-cases":
                cases = [c.strip() for c in tcl_split(opts["-cases"]) if c.strip()]
                if not cases:
                    raise CommandError("case_split: give the cases, each in braces: -cases {{a == 0} {a == 1}}")
            else:
                expr = opts[kinds[0]].strip()
                width = self._width(parent, expr, {k: v for k, v in s.splits.items() if k != parent.id})
                try:
                    cases, descriptions = (split.lowest_bit_cases if kinds[0] == "-lowest_bit"
                                           else split.value_cases)(expr, width)
                except split.SplitError as e:
                    raise CommandError(f"case_split: {e}")
                s.log("info", f"{expr} is {width} bit{'s' if width != 1 else ''} wide: {len(cases)} cases.",
                      code="PMI062")
            if len(cases) > MAX_CASES:
                raise CommandError(f"case_split: {len(cases)} cases; at most {MAX_CASES} can be made of one assertion")
            splits = {**s.splits, parent.id: cases}

        # the split sources must compile before anything changes
        design_text, sva_text = self._split_sources(splits)
        try:
            prepared = run_isolated(compile_design, sva_text, design_text, s.design.name, s.top,
                                    witness_covers="witness" in s.related)
        except FrontendError as e:
            by_name = {j.name: j for j in (s.design, s.sva) if j is not None and j.text}
            for issue in _slang_issues(str(e), by_name):
                at = f"{issue['file']}({issue['line']}): " if issue.get("file") else ""
                s.log("error" if issue["severity"] == "error" else "warning", at + issue["message"], code="PME061")
            raise CommandError("case_split: the cases do not compile at the place of the assertion; nothing was changed")
        compiled = {p.label: p for p in prepared.properties}
        labels = split.case_labels(parent.id, len(cases)) if cases else []
        for label in labels:
            if label not in compiled or not compiled[label].supported:
                why = compiled[label].problems[0] if label in compiled else "it was not found after the split"
                raise CommandError(f"case_split: the case {label[len(parent.id) + 2:]} cannot be checked: {why}")

        with s.lock:
            table: dict[str, Prop] = {}
            for prop in s.props.values():
                if prop.parent == parent.id and prop.related == "case":
                    continue                             # the cases of an earlier split
                if prop.parent == parent.id:             # its related covers stay; their results are of the old proof
                    prop.status, prop.detail, prop.bound, prop.engine = "not_run", "", None, ""
                    prop.seconds, prop.started_at, prop.has_trace, prop.job_id = None, None, False, ""
                    continue                             # (put back below, after the cases)
                table[prop.id] = prop
                if prop.id != parent.id:
                    continue
                prop.status, prop.detail, prop.bound, prop.engine = "not_run", "", None, ""
                prop.seconds, prop.started_at, prop.has_trace, prop.job_id = None, None, False, ""
                covers = [c for c in s.props.values() if c.parent == parent.id and c.related != "case"]
                if cases:
                    for k, label in enumerate(labels):
                        which = f"case{k + 1}" if k < len(cases) else "case_rest"
                        table[label] = Prop(
                            id=label, name=f"{parent.name}:{which}", type="assert", instance=parent.instance,
                            file=parent.file, line=parent.line, parent=parent.id, related="case",
                            expr=(descriptions[k] if k < len(descriptions) else cases[k]) if k < len(cases)
                            else "none of the cases")
                for child in covers:                     # precondition and witness, after the cases
                    table[child.id] = child
            s.props, s.splits = table, splits
            s.bump()
        if cases:
            s.log("info", f'The assertion "{parent.name}" is split into {len(cases)} '
                          f"case{'s' if len(cases) != 1 else ''} and the rest; it is proven when all of them are.",
                  code="PMI060", prop=parent.id)
        else:
            s.log("info", f'The assertion "{parent.name}" is no longer split.', code="PMI060", prop=parent.id)
        return ""

    # ── assert / assume / cover written in Tcl, stopat, check_assumptions ──

    def cmd_assert(self, args: list[str]) -> str:
        return self._tcl_property("assert", args)

    def cmd_assume(self, args: list[str]) -> str:
        return self._tcl_property("assume", args)

    def cmd_cover(self, args: list[str]) -> str:
        return self._tcl_property("cover", args)

    def _compile_errors(self, e, code: str) -> None:
        from app.praman.services.design_check import _slang_issues
        s = self.s
        by_name = {j.name: j for j in (s.design, s.sva) if j is not None and j.text}
        for issue in _slang_issues(str(e), by_name):
            at = f"{issue['file']}({issue['line']}): " if issue.get("file") else ""
            s.log("error" if issue["severity"] == "error" else "warning", at + issue["message"], code=code)

    def _tcl_property(self, kind: str, args: list[str]) -> str:
        from app.praman import tclprops
        from app.praman.session import Prop
        from app.praman.services.compile_worker import run_isolated
        from app.praman.services.formal_service import compile_design
        from app.praman.services.sva.frontend import FrontendError
        s = self.s
        opts, rest = options(kind, args, valued={"-name"}, flags={"-disable", "-enable", "-remove", "-list"},
                             ignored_flags={"-env", "-quiet"}, ignored_valued={"-bound"})
        self._elaborated(kind)
        if "-list" in opts:
            return tcl_list(p.name for p in s.props.values() if p.type == kind and not p.related)
        actions = [a for a in ("-disable", "-enable", "-remove") if a in opts]
        if len(actions) > 1:
            raise CommandError(f"{kind}: use one of -disable, -enable and -remove at a time")
        if actions:
            return self._tcl_toggle(kind, actions[0], rest)
        self._no_proof_running(kind)

        if len(rest) != 1:
            raise CommandError(f"{kind}: give the expression in braces, e.g. {kind} -name {kind}_1 {{a |-> ##1 b}}")
        try:
            expr = tclprops.check_expression(rest[0])
        except tclprops.TclPropertyError as e:
            raise CommandError(f"{kind}: {e}")
        name = opts.get("-name", "").strip()
        labels = {label_of(i): p for i, p in s.props.items()}      # one label per statement, in every task
        if not name:
            n = 1
            while f"{kind}_{n}" in labels:
                n += 1
            name = f"{kind}_{n}"
        if not tclprops.NAME.match(name):
            raise CommandError(f'{kind}: "{name}" is not a name a property can have (letters, digits and _)')
        if name in labels:
            raise CommandError(f'{kind}: a property named "{name}" exists already ({labels[name].name})')

        written = [*s.tcl_props, {"name": name, "kind": kind, "expr": expr, **({"task": s.task} if s.task else {})}]
        design_text, sva_text = self._split_sources(s.splits, tcl=written)
        try:
            prepared = run_isolated(compile_design, sva_text, design_text, s.design.name, s.top,
                                    witness_covers="witness" in s.related)
        except FrontendError as e:
            self._compile_errors(e, "PME081")
            raise CommandError(f'{kind}: "{expr}" is not a property of the top module "{s.top}"; nothing was added')
        compiled = {p.label: p for p in prepared.properties}
        found = compiled.get(name)
        if found is None:
            raise CommandError(f"{kind}: the property could not be found after it was added; nothing was added")
        if not found.supported:
            raise CommandError(f"{kind}: the property cannot be checked: {' '.join(found.problems[0].split())}")

        with s.lock:
            task = s.task
            prop = Prop(id=in_task(task, name), name=(f"{task}::" if task else "") + f"{s.top}.{name}", type=kind,
                        instance=s.top, file=tclprops.SOURCE, status="assumed" if kind == "assume" else "not_run",
                        expr=expr, task=task)
            s.props[prop.id] = prop
            for which, present in (("precondition", found.has_precondition), ("witness", found.has_witness)):
                if kind == "assert" and present and which in s.related:
                    child = f"{prop.id}:{which}1"
                    s.props[child] = Prop(id=child, name=f"{prop.name}:{which}1", type="cover", instance=s.top,
                                          file=tclprops.SOURCE, parent=prop.id, related=which, task=task)
            s.tcl_props = written
            s.bump()
        noun = {"assert": "assertion", "assume": "assumption", "cover": "cover"}[kind]
        s.log("info", f'Added the {noun} "{prop.name}": {expr}', code="PMI080", prop=prop.id)
        if kind == "assume":
            s.clear_results("an assumption was added")
        return prop.name

    def _tcl_toggle(self, kind: str, action: str, names: list[str]) -> str:
        """assert|assume|cover -disable|-enable|-remove <names>"""
        from app.praman import tclprops
        s = self.s
        self._no_proof_running(kind)
        if not names:
            raise CommandError(f"{kind}: {action}: name the properties")
        wanted: dict[str, "Prop"] = {}
        for raw in [n for arg in names for n in tcl_split(arg)]:
            hits = [p for p in self._select([raw], kind) if p.type == kind]
            if not hits:
                raise CommandError(f'{kind}: {action}: "{raw}" names no {kind} property')
            wanted.update((p.id, p) for p in hits)
        chosen = list(wanted.values())
        if action == "-remove":
            files = [p for p in chosen if p.file != tclprops.SOURCE and not p.task]
            if files:
                raise CommandError(f'{kind}: -remove: "{files[0].name}" is written in {files[0].file}, not in Tcl; '
                                   f"use {kind} -disable to leave it out")
            gone = {p.id for p in chosen}
            with s.lock:
                s.props = {i: p for i, p in s.props.items() if i not in gone and p.parent not in gone}
                used = {label_of(i) for i in s.props}            # a statement another task still has stays
                s.tcl_props = [t for t in s.tcl_props if t["name"] in used]
                s.bump()
            s.log("info", f"Removed {len(gone)} {kind} propert{'ies' if len(gone) != 1 else 'y'}: "
                          + ", ".join(p.name for p in chosen) + ".", code="PMI081")
        else:
            off = action == "-disable"
            changed = [p for p in chosen if p.disabled != off]
            with s.lock:
                for prop in chosen:
                    prop.disabled = off
                    for child in s.props.values():
                        if child.parent == prop.id:
                            child.disabled = off
                s.bump()
            if changed:
                s.log("info", f"{'Disabled' if off else 'Enabled'}: " + ", ".join(p.name for p in changed)
                              + (" (not assumed)" if off and kind == "assume" else "") + ".", code="PMI082")
        if kind == "assume":
            s.clear_results("the assumptions changed")
        return ""

    def cmd_stopat(self, args: list[str]) -> str:
        from app.praman.services.compile_worker import run_isolated
        from app.praman.services.formal_service import check_cut, compile_design
        from app.praman.services.sva.frontend import FrontendError
        s = self.s
        opts, rest = options("stopat", args, flags={"-clear", "-list", "-remove", "-env"})
        self._elaborated("stopat")
        if "-list" in opts:
            return tcl_list(s.stopats)
        self._no_proof_running("stopat")
        signals = [n for arg in rest for n in tcl_split(arg)]
        if "-clear" in opts:
            with s.lock:
                gone, s.stopats = s.stopats, []
                s.bump()
            if gone:
                s.log("info", "No signal is cut any more.", code="PMI083")
                s.clear_results("stopat changed")
            return ""
        if not signals:
            raise CommandError("stopat: name the signals to cut, e.g. stopat u_core.state")
        if "-remove" in opts:
            unknown = [n for n in signals if n not in s.stopats]
            if unknown:
                raise CommandError(f'stopat: -remove: "{unknown[0]}" is not cut')
            with s.lock:
                s.stopats = [n for n in s.stopats if n not in signals]
                s.bump()
            s.log("info", "Not cut any more: " + ", ".join(signals) + ".", code="PMI083")
            s.clear_results("stopat changed")
            return ""
        inputs = {p["name"] for p in s.ports if p["direction"] == "input"}
        for name in signals:
            if name in inputs:
                raise CommandError(f'stopat: "{name}" is an input of the top module: it takes any value already')
            if not re.match(r"^[A-Za-z_][\w$]*(\.[A-Za-z_][\w$]*|\[\d+\])*$", name):
                raise CommandError(f'stopat: "{name}" is not a signal name (a signal below the top by path: u_core.state)')
        new = [n for n in signals if n not in s.stopats]
        if not new:
            return tcl_list(s.stopats)
        design_text, sva_text = self._split_sources(s.splits)
        try:
            prepared = run_isolated(compile_design, sva_text, design_text, s.design.name, s.top,
                                    witness_covers="witness" in s.related)
        except FrontendError as e:
            self._compile_errors(e, "PME084")
            raise CommandError("stopat: the design could not be read")
        missing = check_cut(prepared, new)
        if missing:
            raise CommandError(f'stopat: "{missing}" is not a signal of the design below "{s.top}" '
                               f"(name it by its path from the top, e.g. u_core.state); nothing was cut")
        with s.lock:
            s.stopats = [*s.stopats, *new]
            s.bump()
        s.log("info", "Cut (any value in any cycle): " + ", ".join(new) + ".", code="PMI083")
        s.clear_results("stopat changed")
        return tcl_list(s.stopats)

    def cmd_abstract(self, args: list[str]) -> str:
        """abstract -init_value {regs} | -counter {regs} | -remove {regs} | -clear | -list
        (JasperGold's abstraction): the register starts from any value after
        the reset, or a counter may jump to any value in any cycle.  Both let
        the design do more than it can, so a proof stays sound and a
        counterexample may be one no real run has (check it)."""
        from app.praman.services.compile_worker import run_isolated
        from app.praman.services.formal_service import check_cut, compile_design
        from app.praman.services.sva.frontend import FrontendError
        s = self.s
        opts, rest = options("abstract", args, flags={"-init_value", "-counter", "-remove", "-clear", "-list"},
                             ignored_flags={"-env"}, ignored_valued={"-task"})
        self._elaborated("abstract")
        if "-list" in opts:
            return tcl_list(a.split(":", 1)[1] for a in s.abstracts)
        self._no_proof_running("abstract")
        signals = [n for arg in rest for n in tcl_split(arg)]
        if "-clear" in opts:
            with s.lock:
                gone, s.abstracts = s.abstracts, []
                s.bump()
            if gone:
                s.log("info", "No register is abstracted any more.", code="PMI094")
                s.clear_results("abstract changed")
            return ""
        if not signals:
            raise CommandError("abstract: name the registers, e.g. abstract -init_value {u_core.count}")
        if "-remove" in opts:
            unknown = [n for n in signals if not any(a.split(":", 1)[1] == n for a in s.abstracts)]
            if unknown:
                raise CommandError(f'abstract: -remove: "{unknown[0]}" is not abstracted')
            with s.lock:
                s.abstracts = [a for a in s.abstracts if a.split(":", 1)[1] not in signals]
                s.bump()
            s.log("info", "Not abstracted any more: " + ", ".join(signals) + ".", code="PMI094")
            s.clear_results("abstract changed")
            return ""
        modes = [m for m in ("-init_value", "-counter") if m in opts]
        if len(modes) != 1:
            raise CommandError("abstract: give one of -init_value and -counter (abstract -counter {u_core.count})")
        kind = "init" if modes[0] == "-init_value" else "counter"
        if kind == "init" and s.reset is not None and not s.reset[0]:
            raise CommandError("abstract: -init_value needs a reset (reset -none is declared): without one, "
                               "every register starts from any value already")
        inputs = {p["name"] for p in s.ports if p["direction"] == "input"}
        for name in signals:
            if name in inputs:
                raise CommandError(f'abstract: "{name}" is an input of the top module, not a register')
            if not re.match(r"^[A-Za-z_][\w$]*(\.[A-Za-z_][\w$]*|\[\d+\])*$", name):
                raise CommandError(f'abstract: "{name}" is not a signal name (a register below the top by path: '
                                   f"u_core.count)")
            if name in s.stopats:
                raise CommandError(f'abstract: "{name}" is cut (stopat) already: it takes any value in any cycle')
        new = [n for n in signals if f"{kind}:{n}" not in s.abstracts]
        if not new:
            return tcl_list(a.split(":", 1)[1] for a in s.abstracts)
        design_text, sva_text = self._split_sources(s.splits)
        try:
            prepared = run_isolated(compile_design, sva_text, design_text, s.design.name, s.top,
                                    witness_covers="witness" in s.related)
        except FrontendError as e:
            self._compile_errors(e, "PME094")
            raise CommandError("abstract: the design could not be read")
        missing = check_cut(prepared, new)
        if missing:
            raise CommandError(f'abstract: "{missing}" is not a signal of the design below "{s.top}" '
                               f"(name it by its path from the top, e.g. u_core.count); nothing was abstracted")
        not_reg = check_cut(prepared, new, registers=True)
        if not_reg:
            raise CommandError(f'abstract: "{not_reg}" is not a register (no flip-flop drives it); '
                               f"to free a signal in every cycle use stopat")
        with s.lock:
            # one abstraction per register: -counter replaces -init_value and back
            s.abstracts = [a for a in s.abstracts if a.split(":", 1)[1] not in new] + [f"{kind}:{n}" for n in new]
            s.bump()
        what = ("starts from any value after the reset" if kind == "init"
                else "may jump to any value in any cycle (otherwise it counts as written)")
        s.log("info", f"Abstracted ({what}): " + ", ".join(new) + ". A proof still holds for the real design; "
                      "a counterexample may need a value the real design never has.", code="PMI094")
        s.clear_results("abstract changed")
        return tcl_list(a.split(":", 1)[1] for a in s.abstracts)

    def cmd_task(self, args: list[str]) -> str:
        """task -create <name> [-copy {props}] [-copy_assumes] [-set] | -set <name> | -list | -remove <name>
        (JasperGold's tasks): a set of properties proven under the
        assumptions of the task only.  Copies are rows named <task>::<name>;
        prove works on the current task (task -set)."""
        from app.praman import tclprops
        from app.praman.session import Prop
        s = self.s
        if "-create" in args:                           # with -create, -set is a flag: make it current
            args = ["-make_current" if a == "-set" else a for a in args]
        opts, rest = options("task", args, valued={"-create", "-set", "-copy", "-remove", "-source_task"},
                             flags={"-copy_assumes", "-list", "-copy_related_covers", "-make_current"},
                             ignored_flags={"-copy_stopats", "-copy_abstractions"})
        self._elaborated("task")
        if "-list" in opts:
            return tcl_list([EMBEDDED, *s.tasks])
        if "-remove" in opts:
            self._no_proof_running("task")
            name = opts["-remove"]
            if name not in s.tasks:
                raise CommandError(f'task: -remove: there is no task "{name}"')
            with s.lock:
                s.tasks = [t for t in s.tasks if t != name]
                gone = {p.id for p in s.props.values() if p.task == name}
                s.props = {i: p for i, p in s.props.items() if i not in gone}
                written = {label_of(i) for i in gone}
                s.tcl_props = [t for t in s.tcl_props if not (t.get("task") == name and t["name"] in written)]
                if s.task == name:
                    s.task = ""
                s.bump()
            s.log("info", f'Removed the task "{name}" and its {len(gone)} rows.', code="PMI095")
            return ""
        if "-create" not in opts:
            if "-set" in opts:
                name = "" if opts["-set"] == EMBEDDED else opts["-set"]
                if name and name not in s.tasks:
                    raise CommandError(f'task: there is no task "{opts["-set"]}" (task -list)')
                with s.lock:
                    s.task = name
                    s.bump()
                s.log("info", f"The current task is {opts['-set']}: prove and new properties use it.", code="PMI095")
                return opts["-set"]
            raise CommandError("task: give -create <name>, -set <name>, -remove <name> or -list")
        self._no_proof_running("task")
        name = opts["-create"]
        if not tclprops.NAME.match(name) or name == EMBEDDED:
            raise CommandError(f'task: "{name}" is not a name a task can have (letters, digits and _)')
        if name in s.tasks:
            raise CommandError(f'task: there is a task "{name}" already')
        source = opts.get("-source_task", EMBEDDED)
        source = "" if source == EMBEDDED else source
        if source and source not in s.tasks:
            raise CommandError(f'task: there is no task "{source}" to copy from')
        chosen: list[Prop] = []
        if "-copy" in opts:
            names = tcl_split(opts["-copy"])
            chosen = [p for p in self._select(names, "task", task=source) if p.type in ("assert", "cover")]
        if "-copy_assumes" in opts:
            chosen += [p for p in s.props.values() if p.type == "assume" and p.task == source and not p.parent]
        with s.lock:
            s.tasks = [*s.tasks, name]
            copied = 0
            for prop in chosen:
                rows = [prop] + [c for c in s.props.values() if c.parent == prop.id and c.related != "case"]
                for row in rows:
                    new_id = in_task(name, label_of(row.id))
                    s.props[new_id] = Prop(
                        id=new_id, name=f"{name}::{row.name}", type=row.type, instance=row.instance, file=row.file,
                        line=row.line, parent=in_task(name, label_of(row.parent)) if row.parent else "",
                        related=row.related, supported=row.supported,
                        status="assumed" if row.type == "assume" else "not_run", expr=row.expr,
                        disabled=row.disabled, task=name)
                copied += 1
            if "-make_current" in opts:
                s.task = name
            s.bump()
        s.log("info", f'Created the task "{name}" with {copied} properties'
                      + (f" and the assumptions of {source or EMBEDDED}" if "-copy_assumes" in opts else
                         " and no assumption") + (". It is the current task." if s.task == name else "."),
              code="PMI095")
        return name

    def _design_edits(self, task: Optional[str] = None) -> tuple[list[str], list[str]]:
        """(signals cut and abstracted, assumptions left out) of the next proof
        of a task (the current one by default): only the assumptions in the
        task that are enabled are assumed."""
        s = self.s
        task = s.task if task is None else task
        labels = {label_of(p.id) for p in s.props.values() if p.type == "assume" and p.supported}
        active = {label_of(p.id) for p in s.props.values()
                  if p.type == "assume" and p.supported and not p.disabled and p.task == task}
        return [*s.stopats, *s.abstracts], sorted(labels - active)

    def cmd_check_assumptions(self, args: list[str]) -> str:
        from app.praman.services.formal_service import FormalService
        s = self.s
        opts, _ = options("check_assumptions", args, flags={"-dead_end"},
                          ignored_flags={"-show", "-conflict", "-quiet"}, ignored_valued={"-task"})
        self._elaborated("check_assumptions")
        self._no_proof_running("check_assumptions")
        assumptions = [p for p in s.props.values()
                       if p.type == "assume" and p.supported and not p.disabled and p.task == s.task]
        if not assumptions:
            s.log("info", "There is no assumption to check.", code="PMI085")
            return "none"
        depth = s.settings["max_trace_length"]
        design_text, sva_text = self._split_sources(s.splits)
        cut, without = self._design_edits()
        if s.reset is None:
            reset_signal, polarity = "", "auto"
        elif not s.reset[0]:
            reset_signal, polarity = "", "none"
        else:
            reset_signal, polarity = s.reset[0], "low" if s.reset[1] else "high"

        def consistent(left_out: list[str]) -> Optional[bool]:
            service = FormalService()
            service.only, service.cut, service.without = set(), cut, [*without, *(label_of(a) for a in left_out)]
            job = service.run_formal(
                sva_code=sva_text, dut_code=design_text, dut_filename=s.design.name, dut_top=s.top,
                mode="prove", depth=depth, timeout=s.settings["per_property_time_limit"],
                project_name=f"{s.id}_a{uuid.uuid4().hex[:8]}", reset_signal=reset_signal, reset_polarity=polarity,
                clock_signal=s.clock or "")
            sanity = (job.result.sanity if job.result is not None else None) or {}
            if job.status == "failed" or sanity.get("status") not in ("OK", "OVERCONSTRAINED"):
                why = job.error_message or sanity.get("message") or "the check did not run"
                s.log("error", f"check_assumptions: {why.strip()[-300:]}", code="PME085")
                return None
            return sanity["status"] == "OK"

        s.log("info", f"Checking whether the {len(assumptions)} assumption{'s' if len(assumptions) != 1 else ''} "
                      f"can all hold for {depth} cycles after reset.", code="PMI085")
        verdict = consistent([])
        if verdict is None:
            raise CommandError("check_assumptions: the check could not be run")
        if verdict:
            s.log("info", f"The assumptions are consistent: a trace of {depth} cycles satisfies all of them.",
                  code="PMI086")
            if "-dead_end" in opts:
                return self._dead_end(depth, cut, without, assumptions)
            return "consistent"
        # which ones conflict: each whose leaving out makes the rest consistent
        conflicting = []
        if len(assumptions) <= MAX_CONFLICT_CHECKS:
            for prop in assumptions:
                if consistent([prop.id]):
                    conflicting.append(prop)
        message = (f"The assumptions conflict: no trace of {depth} cycles after reset satisfies all of them, "
                   f"so every assertion would pass vacuously.")
        if conflicting:
            message += " Leaving out any one of these resolves it: " + ", ".join(p.name for p in conflicting) + "."
        elif len(assumptions) > MAX_CONFLICT_CHECKS:
            message += f" (With more than {MAX_CONFLICT_CHECKS} assumptions, the conflicting ones are not searched.)"
        else:
            message += " No single assumption is to blame: several together conflict."
        s.log("error", message, code="PME086", prop=conflicting[0].id if len(conflicting) == 1 else "")
        return "conflict"

    def _dead_end(self, depth: int, cut: list[str], without: list[str], assumptions: list) -> str:
        """check_assumptions -dead_end (app/praman/deadend.py): a reachable state
        in which no input satisfies all the assumptions."""
        from app.praman import deadend
        from app.praman.services.compile_worker import run_isolated
        from app.praman.services.formal_service import compile_design
        from app.praman.services.proc import run_tree
        from app.praman.services.sva.frontend import FrontendError
        s = self.s
        design_text, sva_text = self._split_sources(s.splits)
        reset_signal, polarity = self._reset_args()
        try:
            prepared = run_isolated(compile_design, sva_text, design_text, s.design.name, s.top,
                                    reset_signal=reset_signal, reset_polarity=polarity, clock_signal=s.clock or "",
                                    witness_covers=False)
        except FrontendError as e:
            self._compile_errors(e, "PME087")
            raise CommandError("check_assumptions: the design could not be read")
        s.log("info", f"Dead-end check: is there a state, reached within {depth} cycles, in which no input "
                      f"satisfies all {len(assumptions)} assumptions?", code="PMI099")
        try:
            found = deadend.check(prepared, cut, without, depth, s.settings["per_property_time_limit"], run_tree)
        except deadend.DeadEndError as e:
            raise CommandError(f"check_assumptions -dead_end: {e}")
        with s.lock:
            s.dead_end = found
            s.bump()
        if found["status"] == "found":
            lines = [found["message"],
                     "Every property checks nothing from that cycle on. The state (registers the assumptions read):",
                     *(f"    {r['signal']} = {len(r['value'])}'b{r['value']}"
                       + ("   (the checker's memory of an earlier cycle)" if r.get("checker") else "")
                       for r in found["state"][:40]),
                     "Assumptions in force: " + ", ".join(p.name for p in assumptions[:20])
                     + (" ..." if len(assumptions) > 20 else "")]
            s.log("error", "\n".join(lines), code="PME099")
            return "dead_end"
        s.log("info", found["message"], code="PMI099")
        return "consistent" if found["status"] == "none" else "undetermined"

    # ── get_needed_assumptions, check_reset ──────────────────

    def _reset_args(self) -> tuple[str, str]:
        s = self.s
        if s.reset is None:
            return "", "auto"
        if not s.reset[0]:
            return "", "none"
        return s.reset[0], "low" if s.reset[1] else "high"

    # ── check_conn: connectivity, as JasperGold's CONN app ──

    def cmd_check_conn(self, args: list[str]) -> str:
        """check_conn -load <file.csv>: one assertion per connection of the
        spreadsheet (name, source, destination, condition, latency), proven
        with prove like any other."""
        from app.praman import conn
        s = self.s
        opts, rest = options("check_conn", args, valued={"-load"}, flags={"-list"})
        self._elaborated("check_conn")
        if "-list" in opts:
            return tcl_list(p.name for p in s.props.values() if p.id.startswith(conn.PREFIX) or p.expr.startswith("conn:"))
        self._no_proof_running("check_conn")
        name = opts.get("-load") or (rest[0] if rest else "")
        if not name:
            raise CommandError("check_conn: give the connection spreadsheet (check_conn -load conn.csv)")
        text = s.files.get(name)
        if text is None:
            matches = [f for f in s.files if f.rsplit("/", 1)[-1] == name.rsplit("/", 1)[-1]]
            if len(matches) != 1:
                raise CommandError(f'check_conn: no file "{name}" in the session (add it with Add Files)')
            name, text = matches[0], s.files[matches[0]]
        try:
            rows = conn.parse(text, s.top)
        except conn.ConnError as e:
            raise CommandError(f"check_conn: {name}: {e}")
        taken = set(s.props)
        entries, problems = [], []
        for row in rows:
            label = conn.unique_name(row["name"], taken)
            taken.add(label)
            entries.append({"name": label, "kind": "assert", "expr": row["expr"], "line": row["line"],
                            "what": row["what"]})
        added, problems = self._add_written(entries)
        for entry, why in problems:
            s.log("error", f"{name}({entry['line']}): the connection {entry['what']} cannot be checked: {why}",
                  code="PME091")
        s.log("info", f"Connectivity: {len(added)} of {len(entries)} connections from {name} added as assertions"
                      + (f"; {len(problems)} could not be" if problems else "") + ". Prove them with prove -all.",
              code="PMI091")
        return tcl_list(f"{s.top}.{e['name']}" for e in added)

    def _add_written(self, entries: list[dict]) -> tuple[list[dict], list[tuple[dict, str]]]:
        """Add properties written by Praman (connectivity) like Tcl ones: compiled
        together; if that fails, one by one, so the bad ones are named.
        (added, [(entry, why)])."""
        from app.praman import tclprops
        from app.praman.session import Prop
        from app.praman.services.compile_worker import run_isolated
        from app.praman.services.formal_service import compile_design
        from app.praman.services.sva.frontend import FrontendError
        s = self.s

        def compiled(batch: list[dict]):
            written = [*s.tcl_props, *({"name": e["name"], "kind": e["kind"], "expr": e["expr"]} for e in batch)]
            design_text, sva_text = self._split_sources(s.splits, tcl=written)
            prepared = run_isolated(compile_design, sva_text, design_text, s.design.name, s.top, witness_covers=False)
            return {p.label: p for p in prepared.properties}

        problems: list[tuple[dict, str]] = []
        try:
            found = compiled(entries)
            good = entries
        except FrontendError:
            good, found = [], {}
            for entry in entries:
                try:
                    found.update(compiled([*good, entry]))
                    good.append(entry)
                except FrontendError as e:
                    lines = [l for l in str(e).splitlines() if "error" in l.lower()]
                    problems.append((entry, (lines[0] if lines else str(e)).strip()[:200]))
        added = []
        for entry in good:
            prop = found.get(entry["name"])
            if prop is None or not prop.supported:
                problems.append((entry, " ".join((prop.problems[0] if prop else "it was not found").split())))
                continue
            added.append(entry)
        with s.lock:
            for entry in added:
                s.props[entry["name"]] = Prop(id=entry["name"], name=f"{s.top}.{entry['name']}", type="assert",
                                              instance=s.top, file=tclprops.SOURCE, expr=f"conn: {entry['what']}")
            s.tcl_props = [*s.tcl_props, *({"name": e["name"], "kind": e["kind"], "expr": e["expr"]} for e in added)]
            s.bump()
        return added, problems

    # ── check_cov: can every branch of the design be reached? ──

    def cmd_check_cov(self, args: list[str]) -> str:
        """Formal coverage (app/praman/coverage.py), as JasperGold's COV app:
        every branch, statement and toggle of the design is covered (with a
        trace) or proven unreachable (dead code, or ruled out by the
        assumptions), for each instance of a module on its own.
        check_cov -type proof: the proof core instead (which lines the proven
        assertions rely on)."""
        from app.praman import coverage
        from app.praman.elab import module_signals
        from app.praman.services.compile_worker import run_isolated
        from app.praman.services.formal_service import FormalService, remember_job
        s = self.s
        opts, _ = options("check_cov", args, valued={"-model", "-type"}, flags={"-proof_core"},
                          ignored_flags={"-measure", "-init", "-silent"}, ignored_valued={"-task"})
        self._elaborated("check_cov")
        self._no_proof_running("check_cov")
        if "-proof_core" in opts or opts.get("-type", "").strip() in ("proof", "proof_core"):
            return self._proof_core()
        models = set(tcl_split(opts.get("-model", "branch statement toggle")))
        unknown = models - {"branch", "statement", "toggle"}
        if unknown or not models:
            raise CommandError(f'check_cov: -model: "{(sorted(unknown) or [""])[0]}" is not a coverage model '
                               f"(branch, statement, toggle)")
        design_text, sva_text = self._split_sources(s.splits)
        signals: dict[str, dict] = {}
        try:
            if "toggle" in models:
                signals = run_isolated(module_signals, {s.design.name: design_text}, s.top)
            given = {s.top: s.clock} if s.clock else {}
            covered_text, items, toggles, info = coverage.instrument(
                design_text, s.design.name, {m: e["signals"] for m, e in signals.items()} or None,
                clocks_given=given)
        except Exception as e:                           # a parse problem of our own: say so
            raise CommandError(f"check_cov: the branches of the design could not be found: {e}")
        if "branch" not in models and "statement" not in models:
            items = []
        if not items and not toggles:
            s.log("info", "check_cov: the design has nothing to cover (no branch in an always block"
                          + (", no signal on a clock" if "toggle" in models else "") + ").", code="PMI092")
            return ""
        if not signals:
            signals = run_isolated(module_signals, {s.design.name: design_text}, s.top)
        instances = {m: e["instances"] for m, e in signals.items()}
        cut, without = self._design_edits()
        reset_signal, polarity = self._reset_args()
        per_property = s.settings["per_property_time_limit"]
        measured = items + toggles
        modules = sorted({i["module"] for i in measured})
        rounds = max((len(instances.get(m) or [""]) for m in modules), default=1)
        s.log("info", f"Formal coverage: {len(items)} branches and {len(toggles)} toggles of the design"
                      + (f", each instance of a module on its own ({rounds} runs)" if rounds > 1 else "")
                      + f"; each is covered or proven unreachable (up to {per_property} s each).", code="PMI092")
        with s.lock:
            s.coverage = {"status": "running", "total": len(items), "items": []}
            s.bump()
        verdicts: dict[tuple[str, str], dict] = {}      # (label, instance) -> the engine's entry
        jobs: dict[str, str] = {}
        for r in range(rounds):
            mine = {m: (instances.get(m) or [""])[r] for m in modules if len(instances.get(m) or [""]) > r}
            drop = [inst for m in modules for k, inst in enumerate(instances.get(m) or [""])
                    if inst and (m not in mine or k != r)]
            labels = {i["label"] for i in measured if i["module"] in mine}
            service = FormalService()
            service.only, service.without = labels, without
            service.cut = [*cut, *(f"dropcov:{inst}" for inst in drop)]
            service.scans = scan_limits(per_property)
            job = service.run_formal(
                sva_code=sva_text, dut_code=covered_text, dut_filename=s.design.name, dut_top=s.top, mode="prove",
                depth=s.settings["max_trace_length"], timeout=per_property,
                project_name=f"{s.id}_c{uuid.uuid4().hex[:8]}", reset_signal=reset_signal, reset_polarity=polarity,
                clock_signal=s.clock or "", witness_covers=False)
            remember_job(job)
            if job.status == "failed":
                s.log("error", f"check_cov: the coverage run could not be run: {job.error_message.strip()[-300:]}",
                      code="PME092")
            for m, inst in mine.items():
                jobs[inst] = job.job_id
            for a in (job.result.assertion_results if job.result else []):
                for m, inst in mine.items():
                    verdicts[(a["name"], inst)] = {**a, "job_id": job.job_id}

        reset_name, active_low = (s.reset or ("", True))[0], (s.reset or ("", True))[1]

        def rows_of(kinds: list[dict], branch: bool) -> list[dict]:
            out = []
            for item in kinds:
                for inst in instances.get(item["module"]) or [""]:
                    entry = verdicts.get((item["label"], inst)) or {}
                    status = {"COVERED": "covered", "UNREACHABLE": "unreachable"}.get(entry.get("verdict"),
                                                                                     "undetermined")
                    if branch and status == "unreachable" and coverage.reset_branch(item, reset_name, active_low):
                        status = "reset"                 # taken while the reset is held, where checks are off
                    file, line = s.design.locate(item["line"])
                    out.append({**item, "file": file, "line": line, "status": status, "instance": inst or s.top,
                                "job_id": entry.get("job_id", ""),
                                "cycles": entry.get("step") if status == "covered" else None})
            return out

        def tally(rows: list[dict], weight=lambda r: 1) -> dict:
            counts = {"covered": 0, "unreachable": 0, "undetermined": 0, "reset": 0}
            for r in rows:
                counts[r["status"]] += weight(r)
            total = counts["covered"] + counts["unreachable"] + counts["undetermined"]
            return {**counts, "total": total, "percent": round(counts["covered"] / total * 100, 1) if total else 100.0}

        rows = rows_of(items, True)
        toggle_rows = rows_of(toggles, False)
        branches = tally(rows)
        # statements: those in a reached branch, and those outside every branch (run on every clock)
        statements = tally(rows, weight=lambda r: r["statements"])
        outside = sum(info["unconditional"].get(m, 0) * len(instances.get(m) or [""]) for m in info["unconditional"])
        statements["covered"] += outside
        statements["total"] += outside
        statements["percent"] = round(statements["covered"] / statements["total"] * 100, 1) \
            if statements["total"] else 100.0
        toggle_sum = tally(toggle_rows)
        per_instance = []
        for m in modules:
            for inst in instances.get(m) or [""]:
                mine_b = [r for r in rows if r["instance"] == (inst or s.top)]
                mine_t = [r for r in toggle_rows if r["instance"] == (inst or s.top)]
                st = tally(mine_b, weight=lambda r: r["statements"])
                extra = info["unconditional"].get(m, 0)
                st["covered"] += extra
                st["total"] += extra
                st["percent"] = round(st["covered"] / st["total"] * 100, 1) if st["total"] else 100.0
                per_instance.append({"instance": inst or s.top, "module": m, "branches": tally(mine_b),
                                     "statements": st, "toggles": tally(mine_t)})
        result = {"status": "done", "models": sorted(models), **{k: branches[k] for k in
                  ("covered", "unreachable", "undetermined", "reset", "percent")}, "total": len(rows),
                  "job_id": next(iter(jobs.values()), ""), "jobs": jobs, "items": rows if items else [],
                  "toggles": toggle_rows, "statements": statements, "toggle_summary": toggle_sum,
                  "toggle_bits_left_out": info["toggle_bits_left_out"], "instances": per_instance}
        with s.lock:
            s.coverage = result
            s.bump()
        parts = []
        if items:
            parts.append(f"branches {branches['covered']} of {branches['total']} covered ({branches['percent']:.1f} %), "
                         f"{branches['unreachable']} unreachable, {branches['undetermined']} undetermined"
                         + (f", {branches['reset']} taken only in reset (not counted)" if branches["reset"] else ""))
            parts.append(f"statements {statements['covered']} of {statements['total']} ({statements['percent']:.1f} %)")
        if toggles:
            parts.append(f"toggles {toggle_sum['covered']} of {toggle_sum['total']} ({toggle_sum['percent']:.1f} %)")
        s.log("info", "Formal coverage: " + "; ".join(parts) + "."
              + (f" {info['toggle_bits_left_out']} signal bits were not measured for toggles "
                 f"(no clock in their module, or over {coverage.MAX_TOGGLE_BITS} bits)."
                 if "toggle" in models and info["toggle_bits_left_out"] else ""), code="PMI093")
        if len(per_instance) > 1:
            s.log("info", "\n".join(["Coverage per instance (branches · statements · toggles):",
                                      *(f"    {p['instance']:<24} ({p['module']}): {p['branches']['percent']:.1f} % · "
                                        f"{p['statements']['percent']:.1f} % · {p['toggles']['percent']:.1f} %"
                                        for p in per_instance)]), code="PMI093")
        dead = [r for r in rows if r["status"] == "unreachable"]
        if dead:
            s.log("warning", "\n".join(["Unreachable branches (dead code, or ruled out by the assumptions):",
                                        *(f"    {r['file']}({r['line']}): {r['what']}"
                                          + (f"  [{r['instance']}]" if len(instances.get(r['module']) or []) > 1 else "")
                                          for r in dead[:100])]),
                  code="PMW093")
        stuck = [r for r in toggle_rows if r["status"] == "unreachable"]
        if stuck:
            s.log("warning", "\n".join(["Toggles that cannot happen (a bit stuck at a value):",
                                        *(f"    {r['instance']}.{r['what']}" for r in stuck[:100])]), code="PMW094")
        return f"{branches['covered']} {branches['unreachable']} {branches['undetermined']}"

    def _proof_core(self) -> str:
        """check_cov -type proof: which lines of the design the proven
        assertions rely on (app/engine/cores.py: each line is cut and the
        proofs run again).  A line no proof relies on is logic no assertion
        checks."""
        from app.praman.engine.api import EngineJob
        from app.praman.engine.cores import line_coverage
        s = self.s
        cut, without = self._design_edits("")
        written = {t["name"] for t in s.tcl_props}
        if cut or s.splits or any(label not in written for label in without):
            raise CommandError("check_cov -type proof: it measures the design as written; clear stopat, abstract, "
                               "case splits and disabled assumptions of the files first")
        proven = [label_of(p.id) for p in s.props.values()
                  if p.type == "assert" and p.status == "proven" and not p.task and not p.related]
        if not proven:
            raise CommandError("check_cov -type proof: prove assertions first (prove -all); the proof core is "
                               "measured on the proven ones")
        # assumptions written in Tcl that are left out (disabled, or another task's) are not in the text
        design_text, sva_text = self._split_sources(s.splits, tcl=[t for t in s.tcl_props if t["name"] not in without])
        reset_signal, polarity = self._reset_args()
        s.log("info", f"Proof core: each line of the design is cut and the {len(proven)} proven assertions are "
                      f"proven again; this can take a while.", code="PMI096")
        with s.lock:
            s.coverage = {"status": "running", "kind": "proof", "total": 0, "items": []}
            s.bump()
        job = EngineJob(rtl=design_text, sva=sva_text, rtl_name=s.design.name, top=s.top, clock=s.clock or "",
                        reset=reset_signal, reset_polarity=polarity, mode="prove",
                        depth=s.settings["max_trace_length"], timeout=s.settings["per_property_time_limit"],
                        name=f"{s.id}_core")
        found = line_coverage(job, proven, workers=2)
        lines = []
        for n, labels in found.relied_on.items():
            file, line = s.design.locate(n)
            lines.append({"line": line, "file": file, "status": "relied on", "properties": labels})
        for n in found.unused:
            file, line = s.design.locate(n)
            lines.append({"line": line, "file": file, "status": "not relied on",
                          "properties": [], "outside_cone": n in found.outside_cone})
        for n, why in found.unknown.items():
            file, line = s.design.locate(n)
            lines.append({"line": line, "file": file, "status": "undetermined", "properties": [], "detail": why})
        lines.sort(key=lambda r: (r["file"], r["line"]))
        percent = round((found.coverage or 0) * 100, 1)
        with s.lock:
            s.coverage = {"status": "done", "kind": "proof", "lines": lines, "proven": proven,
                          "relied_on": len(found.relied_on), "not_relied_on": len(found.unused),
                          "undetermined": len(found.unknown), "percent": percent, "items": []}
            s.bump()
        s.log("info", f"Proof core: {len(found.relied_on)} lines are relied on by the proofs, "
                      f"{len(found.unused)} by none ({percent:.1f} % of the logic is checked)"
                      + (f"; {len(found.unknown)} undetermined" if found.unknown else "") + ".", code="PMI096")
        unused = [r for r in lines if r["status"] == "not relied on"]
        if unused:
            s.log("warning", "\n".join(["Lines no proof relies on (logic no assertion checks):",
                                        *(f"    {r['file']}({r['line']})" for r in unused[:100])]), code="PMW096")
        return f"{len(found.relied_on)} {len(found.unused)} {len(found.unknown)}"

    def cmd_get_needed_assumptions(self, args: list[str]) -> str:
        """Which assumptions a proof needs: each enabled assumption is left out in
        turn and the property proven again; one it still proves without is
        dropped for good, so what remains is a minimal set it relies on."""
        from app.praman.services.formal_service import FormalService
        s = self.s
        opts, rest = options("get_needed_assumptions", args, valued={"-property"}, ignored_flags={"-silent"})
        self._elaborated("get_needed_assumptions")
        self._no_proof_running("get_needed_assumptions")
        name = opts.get("-property") or (rest[0] if rest else "")
        if not name:
            raise CommandError("get_needed_assumptions: name a proven property (get_needed_assumptions -property <name>)")
        chosen = self._select([name], "get_needed_assumptions")
        if len(chosen) != 1:
            raise CommandError(f'get_needed_assumptions: "{name}" names {len(chosen)} properties; name one')
        prop = chosen[0]
        wanted = {"assert": "proven", "cover": "unreachable"}.get(prop.type)
        if wanted is None or prop.status != wanted:
            raise CommandError(f'get_needed_assumptions: "{prop.name}" is {prop.status}; only a proven assertion '
                               f"or an unreachable cover relies on the assumptions (prove it first)")
        if prop.id in s.splits:
            raise CommandError(f'get_needed_assumptions: "{prop.name}" is split; ask for each of its cases')
        assumptions = [p for p in s.props.values()
                       if p.type == "assume" and p.supported and not p.disabled and p.task == prop.task]
        if not assumptions:
            s.log("info", f'"{prop.name}" holds without any assumption.', code="PMI087", prop=prop.id)
            return ""
        design_text, sva_text = self._split_sources(s.splits)
        cut, without = self._design_edits(prop.task)
        reset_signal, polarity = self._reset_args()
        # each run gets a few times what the proof took (never more than the per-property limit)
        limit = int(min(s.settings["per_property_time_limit"], max(20, 4 * (prop.seconds or 5) + 10)))
        decided = "PROVEN" if prop.type == "assert" else "UNREACHABLE"

        def holds_without(left_out: list[str]) -> Optional[bool]:
            service = FormalService()
            service.only, service.scans = {label_of(prop.id)}, [limit]
            service.cut, service.without = cut, [*without, *(label_of(a) for a in left_out)]
            job = service.run_formal(
                sva_code=sva_text, dut_code=design_text, dut_filename=s.design.name, dut_top=s.top,
                mode="prove", depth=s.settings["max_trace_length"], timeout=limit,
                project_name=f"{s.id}_n{uuid.uuid4().hex[:8]}", reset_signal=reset_signal, reset_polarity=polarity,
                clock_signal=s.clock or "", witness_covers=False)
            entries = [a for a in (job.result.assertion_results if job.result else [])
                       if a["name"] == label_of(prop.id)]
            if not entries:
                return None
            verdict = entries[0]["verdict"]
            if verdict == decided:
                return True
            if verdict in ("FAIL", "COVERED", "VACUOUS"):
                return False
            return None                                    # undecided in the time: counted as needed

        s.log("info", f'Finding the assumptions "{prop.name}" needs: {len(assumptions)} to try, '
                      f"up to {limit} s each.", code="PMI087", prop=prop.id)
        needed: list = []
        dropped: list[str] = []
        undecided: list = []
        for candidate in assumptions:
            result = holds_without([*dropped, candidate.id])
            if result:
                dropped.append(candidate.id)
            else:
                needed.append(candidate)
                if result is None:
                    undecided.append(candidate)
        with s.lock:
            prop.detail = (prop.detail.split(" · needs:")[0] + " · needs: "
                           + (", ".join(p.id for p in needed) or "no assumption"))
            s.bump()
        if needed:
            s.log("info", f'"{prop.name}" needs {len(needed)} of {len(assumptions)} assumptions: '
                          + ", ".join(p.name for p in needed) + "."
                          + (" Without " + ", ".join(p.name for p in undecided) + " it was not decided in time, "
                             "so they are counted as needed." if undecided else ""), code="PMI088", prop=prop.id)
        else:
            s.log("info", f'"{prop.name}" holds without any of the {len(assumptions)} assumptions.',
                  code="PMI088", prop=prop.id)
        return tcl_list(p.name for p in needed)

    def what_if(self, prop_id: str, pins: list[dict], differ_from: str = "") -> dict:
        """A trace of the property with signals pinned to values in given cycles
        (Visualize: "what if en_a were 0 in cycle 6?").  {job_id, verdict, message}:
        verdict FAIL / COVERED with a trace in job_id, else why there is none."""
        from app.praman import tclprops
        from app.praman.services.formal_service import FormalService, remember_job
        s = self.s
        prop = s.props.get(prop_id)
        if s.phase != "elaborated" or prop is None or prop.type not in ("assert", "cover"):
            raise CommandError("what-if: the property is not in the table any more")
        if not pins and not differ_from:
            raise CommandError("what-if: pin at least one value")
        clock, _ = self._tcl_clocking()
        prefix = f"{s.top}."
        pins = [{**pin, "signal": str(pin["signal"]).removeprefix(prefix)} for pin in pins]
        try:
            extra = tclprops.pin_statements(clock or "", pins)
            if differ_from:
                extra += [line.replace("{clock}", clock) for line in self._differ(prop, differ_from)]
        except tclprops.TclPropertyError as e:
            raise CommandError(f"what-if: {e}")
        design, sva = self._split_sources(s.splits)
        design, sva = tclprops.insert(design, sva, s.top, extra)
        cut, without = self._design_edits(prop.task)
        reset_signal, polarity = self._reset_args()
        depth = max(s.settings["max_trace_length"], max((int(p["cycle"]) for p in pins), default=0) + 2,
                    (prop.bound or 0) + 1)
        label = label_of(prop.id)
        service = FormalService()
        service.only, service.cut, service.without = {label}, cut, without
        job = service.run_formal(
            sva_code=sva, dut_code=design, dut_filename=s.design.name, dut_top=s.top, mode="bmc", depth=depth,
            timeout=s.settings["per_property_time_limit"], project_name=f"{s.id}_w{uuid.uuid4().hex[:8]}",
            reset_signal=reset_signal, reset_polarity=polarity, clock_signal=s.clock or "",
            witness_covers=False)
        remember_job(job)
        entry = next((a for a in (job.result.assertion_results if job.result else []) if a["name"] == label), None)
        verdict = entry["verdict"] if entry else "ERROR"
        if verdict in ("FAIL", "COVERED"):
            message = ""
        elif verdict == "ERROR":
            message = (entry or {}).get("verdict_detail") or job.error_message or "the check could not be run"
        elif ((job.result.sanity if job.result else None) or {}).get("status") == "OVERCONSTRAINED":
            message = "These values cannot all happen: no trace of the design (after its reset) has them."
        elif verdict == "VACUOUS":
            message = (f"With these values there is no counterexample up to {depth} cycles: the antecedent "
                       f"never matches.")
        elif prop.type == "assert":
            message = f"With these values there is no counterexample up to {depth} cycles: the property holds there."
        else:
            message = f"With these values the cover cannot be reached within {depth} cycles."
        pinned = ", ".join(f"{p['signal']} = {p['value']} @{p['cycle']}" for p in pins)
        if differ_from:
            pinned = (pinned + ", " if pinned else "") + "inputs other than the trace's"
            if verdict not in ("FAIL", "COVERED") and not message.startswith("These values"):
                message = ("There is no other counterexample up to " f"{depth} cycles: every failing trace has these "
                           "inputs up to the failure." if prop.type == "assert" else
                           f"There is no other way to reach the cover within {depth} cycles.")
        s.log("info", f'What-if on "{prop.name}" with {pinned}: '
                      + ("a new trace was found." if not message else message), code="PMI090", prop=prop.id)
        return {"job_id": job.job_id, "verdict": verdict, "message": message, "depth": depth}

    def quiet_trace(self, prop_id: str) -> dict:
        """QuietTrace (JasperGold): a trace of the property whose inputs change
        as few times as possible - the fewest moving parts to read.  Only the
        inputs in the property's cone are counted (the others do not matter
        and are held still).  Searched by bounding the number of changes:
        1, 2, 4, ... until a trace exists, then halving between.
        Changes are counted from the cycle after the reset is released.
        -> {job_id, verdict, message, depth, changes}."""
        from app.praman import tclprops
        from app.praman.services.formal_service import FormalService, remember_job
        s = self.s
        prop = s.props.get(prop_id)
        if s.phase != "elaborated" or prop is None or prop.type not in ("assert", "cover"):
            raise CommandError("quiet trace: the property is not in the table any more")
        if prop.status not in ("cex", "covered"):
            raise CommandError(f'quiet trace: "{prop.name}" has no trace ({prop.status})')
        clock, _ = self._tcl_clocking()
        if not clock:
            raise CommandError("quiet trace: the design has no clock")
        reset = (s.reset or ("", True))[0]
        cone = self._cone_inputs(prop)
        inputs = [p for p in s.ports if p["direction"] == "input" and p["name"] not in (clock, reset)]
        varying = [p for p in inputs if cone is None or p["name"] in cone]
        still = [p for p in inputs if p not in varying]
        depth = max(s.settings["max_trace_length"], (prop.bound or 0) + 1)
        cut, without = self._design_edits(prop.task)
        reset_signal, polarity = self._reset_args()
        design0, sva0 = self._split_sources(s.splits)
        label = label_of(prop.id)
        wanted = "FAIL" if prop.type == "assert" else "COVERED"

        # changes are counted once the reset is released (inputs do not matter while it is held)
        released = "1'b1" if not reset else f"({reset})" if s.reset[1] else f"(!{reset})"

        def attempt(bound: int):
            changes = " + ".join(f"16'({p['name']} != __pm_q_{p['name']})" for p in varying) or "16'd0"
            extra = [f"reg [{p['width'] - 1}:0] __pm_q_{p['name']};" for p in inputs]
            extra += ["reg __pm_qseen = 1'b0;", "reg [15:0] __pm_qcount = 16'd0;",
                      f"wire [15:0] __pm_qnow = __pm_qseen ? ({changes}) : 16'd0;",
                      f"always @(posedge {clock}) begin __pm_qseen <= __pm_qseen | {released}; "
                      f"__pm_qcount <= __pm_qcount + __pm_qnow; "
                      + " ".join(f"__pm_q_{p['name']} <= {p['name']};" for p in inputs) + " end",
                      f"always @* __pm_quiet: assume (__pm_qcount + __pm_qnow <= 16'd{bound});"]
            # inputs that cannot change the verdict: held at their first value
            extra += [f"always @* if (__pm_qseen) __pm_still_{p['name']}: assume ({p['name']} == __pm_q_{p['name']});"
                      for p in still]
            design, sva = tclprops.insert(design0, sva0, s.top, extra)
            service = FormalService()
            service.only, service.cut, service.without = {label}, cut, without
            job = service.run_formal(
                sva_code=sva, dut_code=design, dut_filename=s.design.name, dut_top=s.top, mode="bmc", depth=depth,
                timeout=s.settings["per_property_time_limit"], project_name=f"{s.id}_w{uuid.uuid4().hex[:8]}",
                reset_signal=reset_signal, reset_polarity=polarity, clock_signal=s.clock or "", witness_covers=False)
            entry = next((a for a in (job.result.assertion_results if job.result else []) if a["name"] == label), None)
            if job.status == "failed" or entry is None or entry["verdict"] == "ERROR":
                why = (entry or {}).get("verdict_detail") or job.error_message or "the check could not be run"
                raise CommandError(f"quiet trace: {why.strip()[-300:]}")
            return job, entry["verdict"] == wanted

        s.log("info", f'Quiet trace of "{prop.name}": the fewest changes of '
                      + (", ".join(p["name"] for p in varying) or "the inputs")
                      + (f" ({', '.join(p['name'] for p in still)} held still: the property does not depend on them)"
                         if still else "") + ".", code="PMI098", prop=prop.id)
        best, found_at, low = None, None, -1         # low: the largest bound known to have no trace
        bound = 0
        while bound <= 4096:
            job, ok = attempt(bound)
            if ok:
                best, found_at = job, bound
                break
            low = bound
            bound = 1 if bound == 0 else bound * 2
        if best is None:
            raise CommandError(f"quiet trace: no trace within {depth} cycles")
        while found_at - low > 1:                    # halve between the two
            mid = (low + found_at) // 2
            job, ok = attempt(mid)
            if ok:
                best, found_at = job, mid
            else:
                low = mid
        remember_job(best)
        s.log("info", f'Quiet trace of "{prop.name}": {found_at} input change{"s" if found_at != 1 else ""} '
                      f"after the reset (no trace has fewer).", code="PMI098", prop=prop.id)
        return {"job_id": best.job_id, "verdict": wanted, "message": "", "depth": depth, "changes": found_at}

    def _differ(self, prop: "Prop", job_id: str) -> list[str]:
        """Statements asking for inputs other than those of the trace in job `job_id`."""
        from app.praman import tclprops
        from app.praman.services.counterexample import trace_payload
        from app.praman.services.formal_service import get_job
        job = get_job(job_id) if job_id.startswith(self.s.id) else None
        payload = trace_payload(job, label_of(prop.id)) if job is not None else None
        if not payload:
            raise CommandError("what-if: the trace is no longer on the server; prove the property again")
        sigs = {d["full_name"]: d for d in payload["vcd_data"].get("signal_details", [])}
        step = sigs.get("smt_step")
        starts = sorted({t["time"] for t in step["transitions"]}) if step else []
        debug = payload.get("debug") or {}
        until = debug.get("event_cycle")
        if until is None:
            until = max(0, len(starts) - 1)
        clock = self.s.clock or ""
        # only the inputs the property depends on: a trace differing in another one fails the same way
        cone = self._cone_inputs(prop)
        inputs, widths = {}, {}
        for port in self.s.ports:
            path = f"{self.s.top}.{port['name']}"
            if port["direction"] != "input" or port["name"] == clock or path not in sigs:
                continue
            if cone is not None and port["name"] not in cone:
                continue
            sig = sigs[path]
            values = []
            for at in starts[:until + 1]:
                current = sig.get("initial_value", "x")
                for t in sig["transitions"]:
                    if t["time"] <= at:
                        current = t["value"]
                values.append(str(current).rjust(sig["width"], "0")[-sig["width"]:])
            inputs[port["name"]], widths[port["name"]] = values, sig["width"]
        if not inputs:
            raise CommandError("what-if: the design has no inputs to vary"
                               + (" that the property depends on" if cone is not None else ""))
        if cone is not None:
            left = sorted(p["name"] for p in self.s.ports
                          if p["direction"] == "input" and p["name"] != clock and p["name"] not in inputs)
            self.s.log("info", f'Another counterexample of "{prop.name}": only the inputs it depends on are varied ('
                               + ", ".join(sorted(inputs)) + ")"
                               + (f"; {', '.join(left)} cannot change whether it fails" if left else "") + ".",
                       code="PMI097", prop=prop.id)
        return tclprops.differ_statements(inputs, widths, until)

    def _cone_inputs(self, prop: "Prop") -> Optional[set[str]]:
        """The top's inputs in the cone of influence of a property (None if unknown)."""
        from app.praman.services.compile_worker import run_isolated
        from app.praman.services.formal_service import compile_design, cone_inputs
        from app.praman.services.sva.frontend import FrontendError
        s = self.s
        design_text, sva_text = self._split_sources(s.splits)
        reset_signal, polarity = self._reset_args()
        try:
            prepared = run_isolated(compile_design, sva_text, design_text, s.design.name, s.top,
                                    reset_signal=reset_signal, reset_polarity=polarity, clock_signal=s.clock or "",
                                    witness_covers=False)
        except FrontendError:
            return None
        return cone_inputs(prepared, label_of(prop.id), self._design_edits(prop.task)[0])

    def cmd_check_reset(self, args: list[str]) -> str:
        """Reset analysis: which registers the reset does not set (they start
        from any value: a property may then fail on a state no real chip has)."""
        from app.praman.services.compile_worker import run_isolated
        from app.praman.services.formal_service import compile_design
        from app.praman.services.reset_analysis import analyze_reset
        from app.praman.services.sva.frontend import FrontendError
        s = self.s
        options("check_reset", args, ignored_flags={"-silent"})
        self._elaborated("check_reset")
        if not s.reset or not s.reset[0]:
            raise CommandError("check_reset: declare the reset first (reset !rst_n)")
        clock = s.clock or ((s.detected or {}).get("clocks") or [None])[0]
        if not clock:
            raise CommandError("check_reset: declare the clock first (clock clk)")
        design_text, sva_text = self._split_sources(s.splits)
        try:
            prepared = run_isolated(compile_design, sva_text, design_text, s.design.name, s.top)
        except FrontendError as e:
            self._compile_errors(e, "PME089")
            raise CommandError("check_reset: the design could not be read")
        found = analyze_reset(prepared, clock, s.reset[0], s.reset[1], cycles=2)
        if found.get("error"):
            raise CommandError(f"check_reset: {found['error']}")
        loose = found["not_reset"]
        total = found["registers"]
        if not loose:
            s.log("info", f"Reset analysis: all {total} registers have a value after reset.", code="PMI089")
            return ""
        bits = sum(r["bits"] for r in loose)
        lines = [f"Reset analysis: {len(loose)} of {total} registers ({bits} bits) have no value after reset; "
                 "proofs start them from any value:"]
        for r in loose[:200]:
            width = f" [{r['bits'] - 1}:0]" if r["bits"] > 1 else ""
            lines.append(f"    {r['name']}{width}" + ("" if r["all"] else "  (some bits)"))
        if len(loose) > 200:
            lines.append(f"    ... and {len(loose) - 200} more")
        s.log("warning", "\n".join(lines), code="PMW089")
        return tcl_list(r["name"] for r in loose)

    # ── prove ─────────────────────────────────────────────────

    def _select(self, names: list[str], command: str, task: Optional[str] = None) -> list["Prop"]:
        """Properties named by full name, label or a glob pattern, in the
        current task (or `task`); <task>::<name> names one in another task
        (<embedded>:: the elaborated ones).  A related cover selects its assertion."""
        chosen: dict[str, "Prop"] = {}
        for raw in names:
            where, name = raw.rsplit("::", 1) if "::" in raw else (None, raw)
            in_ = (self.s.task if task is None else task) if where is None else ("" if where == EMBEDDED else where)
            hits = []
            for p in self.s.props.values():
                if p.task != in_:
                    continue
                shown, label = p.name.rsplit("::", 1)[-1], label_of(p.id)
                if (shown == name or label == name or fnmatch.fnmatchcase(shown, name)
                        or fnmatch.fnmatchcase(label, name)):
                    hits.append(p)
            if not hits:
                raise CommandError(f'{command}: no property matches "{raw}"'
                                   + (f" in the task {in_}" if in_ else ""))
            for prop in hits:
                target = self.s.props[prop.parent] if prop.parent else prop
                chosen[target.id] = target
        return list(chosen.values())

    def cmd_prove(self, args: list[str]) -> str:
        s = self.s
        opts, rest = options(
            "prove", args, flags={"-all", "-bg"},
            valued={"-property", "-time_limit", "-per_property_time_limit", "-task"},
            ignored_flags={"-with_ppd", "-save_ppd", "-no_ppd", "-force", "-asserts", "-covers"},
            ignored_valued={"-orchestration", "-engine_mode", "-max_jobs", "-with_proven"})
        self._elaborated("prove")
        if s.proof.running:
            raise CommandError("prove: a proof is already running (stop)")
        task = s.task
        if "-task" in opts:
            task = "" if opts["-task"] == EMBEDDED else opts["-task"]
            if task and task not in s.tasks:
                raise CommandError(f'prove: there is no task "{opts["-task"]}" (task -list)')
        if "-property" in opts:
            selected = self._select(tcl_split(opts["-property"]), "prove", task=task)
        elif "-all" in opts or not rest:
            selected = [p for p in s.props.values() if not p.parent and p.task == task]
        else:
            selected = self._select(rest, "prove", task=task)
        selected = [p for p in selected if p.supported and p.type in ("assert", "cover") and not p.disabled]
        if not selected:
            raise CommandError("prove: there is no property to prove (a disabled one is not proven)"
                               + (f" in the task {task}" if task else ""))
        tasks = {p.task for p in selected}
        if len(tasks) > 1:
            raise CommandError("prove: the properties are in different tasks, each with its own assumptions; "
                               "prove one task at a time (prove -task <name>)")
        task = tasks.pop()
        from app.praman.services.proc import sby_environment
        problem = sby_environment()[1]
        if problem:                                     # look again: it may have been repaired since
            problem = sby_environment(refresh=True)[1]
        if problem:
            raise CommandError(f"prove: the proof engine (sby) cannot be started: {problem}")

        time_limit = parse_time(opts["-time_limit"], "prove -time_limit") if "-time_limit" in opts \
            else s.settings["time_limit"]
        per_property = parse_time(opts["-per_property_time_limit"], "prove -per_property_time_limit") \
            if "-per_property_time_limit" in opts else s.settings["per_property_time_limit"]

        sources_now = self._split_sources(s.splits)
        from app.praman.session import Proof
        with s.lock:
            s.runs += 1
            proof = Proof(running=True, background="-bg" in opts, started_at=time.time(),
                          job_id=f"{s.id}_r{s.runs}", time_limit=time_limit, sources=sources_now, task=task)
            ids = {p.id for p in selected}
            running = [p for p in s.props.values() if p.id in ids or p.parent in ids]
            for prop in running:
                prop.status, prop.detail, prop.bound, prop.engine = "running", "", None, ""
                prop.seconds, prop.started_at, prop.has_trace, prop.job_id = None, proof.started_at, False, ""
            proof.total = len(running)
            s.proof = proof
            s.bump()

        self._record_start(proof, "prove " + tcl_list(args))
        self._announce(proof, selected, per_property)
        if proof.background:
            proof.thread = threading.Thread(target=self._run_proof, args=(proof, selected, per_property),
                                            name=f"praman-proof-{proof.job_id}", daemon=True)
            proof.thread.start()
            return f"background {s.runs}"
        return self._run_proof(proof, selected, per_property)

    def _announce(self, proof: "Proof", selected: list["Prop"], per_property: int) -> None:
        from app.praman.services.formal_service import LIVE_ENGINE, MAX_PARALLEL_CHECKS, PROOF_ENGINE_LABEL
        s = self.s
        asserts = sum(1 for p in selected if p.type == "assert")
        s.log("info", f"Starting proof: {len(selected)} properties to prove "
                      f"({asserts} assertions, {len(selected) - asserts} covers), "
                      f"{proof.total - len(selected)} related covers.", code="PMI040")
        if s.clock is None:
            clocks = ", ".join(s.detected.get("clocks") or []) or "none found"
            s.log("warning", f"No clock is declared (clock <signal> or clock -none); using the clocks of the "
                             f"properties ({clocks}).", code="PMW041")
        if s.reset is None:
            found = s.detected.get("signal")
            s.log("warning", "No reset is declared (reset <expr> or reset -none); "
                             + (f'using "{"!" if s.detected.get("active_low") else ""}{found}", found in the design.'
                                if found else "the design starts from any state."), code="PMW042")
        s.log("info", "\n".join([
            "Settings used for this proof:",
            f"    time_limit                  = {proof.time_limit}s",
            f"    per_property_time_limit     = {per_property}s"
            f" (full proofs in scans of {', '.join(f'{b}s' for b in scan_limits(per_property))})",
            f"    max_trace_length            = {s.settings['max_trace_length']} cycles",
            f"    engines                     = bounded: smtbmc; proof: {PROOF_ENGINE_LABEL}; "
            f"liveness: {LIVE_ENGINE}",
            f"    parallel checks             = {MAX_PARALLEL_CHECKS}",
            *([f"    stopat (cut)                = {', '.join(s.stopats)}"] if s.stopats else []),
            *([f"    abstract                    = {', '.join(_abstract_text(a) for a in s.abstracts)}"]
              if s.abstracts else []),
            *([f"    task                        = {proof.task}"] if proof.task else []),
            *([f"    assumptions left out        = {', '.join(self._design_edits(proof.task)[1])}"]
              if self._design_edits(proof.task)[1] else []),
        ]), code="PMI043")

    def stop_proof(self, reason: str, proof: Optional["Proof"] = None) -> bool:
        proof = proof or self.s.proof
        if not proof.running or proof.stopped:
            return False
        proof.stopped, proof.reason = True, reason
        proof.cancel.set()
        self.s.log("info", f"Stopping the proof: {reason}.", code="PMI045")
        return True

    def cmd_stop(self, args: list[str]) -> str:
        if not self.stop_proof("stopped by the user"):
            self.s.log("info", "No proof is running.", code="PMI046")
        return ""

    def _run_proof(self, proof: "Proof", selected: list["Prop"], per_property: int) -> str:
        from app.praman import jobs
        from app.praman.store import get_store
        s = self.s
        # a split assertion is proven through its cases
        only: set[str] = set()
        for p in selected:
            if p.id not in s.splits:
                only.add(label_of(p.id))
                continue
            # a split assertion: its cases are proven, and its related covers are
            # checked on its own statement (still in the source) as covers of their own
            for c in s.props.values():
                if c.parent == p.id:
                    only.add(c.id if c.related == "case" else _engine_label(c))
        if s.reset is None:
            reset_signal, polarity = "", "auto"
        elif not s.reset[0]:
            reset_signal, polarity = "", "none"
        else:
            reset_signal, polarity = s.reset[0], "low" if s.reset[1] else "high"
        spec = jobs.ProofSpec(
            job_id=proof.job_id, workspace=s.workspace, design_text=proof.sources[0], sva_text=proof.sources[1],
            design_name=s.design.name, top=s.top, depth=s.settings["max_trace_length"], per_property=per_property,
            scans=scan_limits(per_property), only=sorted(only), reset_signal=reset_signal, reset_polarity=polarity,
            clock_signal=s.clock or "", witness_covers="witness" in s.related,
            cache=bool(s.persistent and get_store() is not None),       # a signed-in user's results are reused
            cut=self._design_edits(proof.task)[0], without=self._design_edits(proof.task)[1])
        proof.selected, proof.per_property = [p.id for p in selected], per_property
        s.persist()                                      # a restart can pick the proof back up
        return self._follow(proof, lambda reported: jobs.run(
            spec, proof.cancel, lambda entry: self._result(proof, entry, reported),
            lambda label, expired, then: self._progress(proof, label, expired, then),
            lambda label, kind, text, progress: self._engine(proof, label, kind, text, progress)))

    def resume_proof(self, saved: dict) -> None:
        """After a server restart: follow the proof a worker may still be running."""
        from app.praman import jobs
        from app.praman.session import Proof
        s = self.s
        job_id = saved.get("job_id", "")
        if not job_id or jobs.state(job_id) == "unknown":
            return
        proof = Proof(running=True, started_at=saved.get("started_at"), job_id=job_id,
                      time_limit=saved.get("time_limit", 86400), recorded=True, task=saved.get("task", ""),
                      selected=list(saved.get("selected", [])), per_property=saved.get("per_property", 0))
        ids = set(proof.selected)
        with s.lock:
            for prop in s.props.values():
                if prop.id in ids or prop.parent in ids:
                    prop.status, prop.detail, prop.started_at = "running", "", proof.started_at
            proof.total = sum(1 for p in s.props.values() if p.status == "running")
            s.proof = proof
            s.bump()
        s.log("info", "The proof that was running when the server restarted goes on.", code="PMI047")
        selected = [s.props[i] for i in proof.selected if i in s.props]

        def follow():
            self._follow(proof, lambda reported: jobs.collect(
                job_id, proof.cancel, lambda entry: self._result(proof, entry, reported),
                lambda label, expired, then: self._progress(proof, label, expired, then),
                on_engine=lambda label, kind, text, progress: self._engine(proof, label, kind, text, progress)),
                selected)
        proof.thread = threading.Thread(target=follow, name=f"praman-resume-{job_id}", daemon=True)
        proof.thread.start()

    def _follow(self, proof: "Proof", run, selected: Optional[list] = None) -> str:
        """Run (or follow) a proof to its end, then settle what it left open."""
        from app.praman.services.formal_service import get_job, remember_job
        s = self.s
        selected = selected if selected is not None else [s.props[i] for i in proof.selected if i in s.props]
        reported: set[str] = set()
        left = max(1.0, proof.time_limit - (time.time() - (proof.started_at or time.time())))
        watchdog = threading.Timer(left, self.stop_proof,
                                   args=(f"the time limit of {proof.time_limit}s was reached", proof))
        watchdog.daemon = True
        watchdog.start()
        job = None
        try:
            job = run(reported)
        except Exception as e:                          # failures are reported in the job; a bug lands here
            logger.exception("proof %s crashed", proof.job_id)
            s.log("error", f"The proof ended with an internal error: {e}", code="PME049")
        finally:
            watchdog.cancel()
        if job is not None and get_job(job.job_id) is None:
            remember_job(job)                            # from a worker: its traces are read from here

        if job is not None and job.status == "failed":
            s.log("error", f"The proof could not be run: {job.error_message.strip()}", code="PME048")
        if job is not None and job.result is not None:
            for entry in job.result.assertion_results:
                self._result(proof, entry, reported)
            sanity = job.result.sanity or {}
            if sanity.get("status") == "OVERCONSTRAINED":
                s.log("warning", f"The assumptions contradict each other: {sanity.get('message', '')}",
                      code="PMW047")

        with s.lock:
            for prop in s.props.values():
                prop.activity = ""
                if prop.status == "running" and prop.id not in s.splits:
                    prop.seconds = round(time.time() - (prop.started_at or time.time()), 2)
                    if proof.stopped:
                        prop.status, prop.detail = "stopped", proof.reason
                    elif prop.related:
                        prop.status, prop.detail = "undetermined", "not decided by this proof"
                    else:
                        prop.status, prop.detail = "error", "the proof ended without a result for this property"
            settled = [p for p in selected if p.id in s.splits and self._aggregate(proof, p, final=True)
                       and p.id not in reported]
            reported.update(p.id for p in settled)
            proof.running, proof.finished_at = False, time.time()
            s.bump()
        for parent in settled:
            self._log_result(parent)
        s.log("info", f"Completed proof in {(proof.finished_at or 0) - (proof.started_at or 0):.2f} s.", code="PMI059")
        s.log("out", self.summary_text())
        self._record_finish(proof, job)
        open_ = [p for p in selected if p.status not in ("proven", "cex", "covered", "unreachable", "vacuous")]
        return "undetermined" if open_ else "determined"

    # ── Run history (app/praman/store.py); never in the way of a proof ──

    def _record_start(self, proof: "Proof", command: str) -> None:
        from app.praman.session import VERSION
        from app.praman.store import get_store
        s = self.s
        store = get_store()
        if store is None or not s.persistent:           # not signed in: nothing is kept
            return
        try:
            s.persist()                                  # the session row and the log so far
            clock = "not declared" if s.clock is None else s.clock or "none"
            reset = "not declared" if s.reset is None else \
                (f"{'!' if s.reset[1] else ''}{s.reset[0]}" if s.reset[0] else "none")
            store.start_run(
                proof.job_id, s.id, s.workspace, s.runs, command, s.top, clock, reset, proof.started_at,
                {**s.settings, "time_limit": proof.time_limit, "related": sorted(s.related)},
                list(s.journal), dict(s.files), {name for name, _ in s.analyzed}, s.seq,
                {"praman": VERSION, **_tool_versions()})
            proof.recorded = True
        except Exception:
            logger.exception("run %s could not be recorded", proof.job_id)

    def _record_finish(self, proof: "Proof", job) -> None:
        from dataclasses import asdict
        from app.praman.store import get_store
        from app.praman.services.counterexample import trace_payload
        s = self.s
        store = get_store()
        if store is None or not getattr(proof, "recorded", False):
            return
        try:
            traces = {}
            if job is not None and job.result is not None:
                for prop in s.props.values():
                    if prop.has_trace and prop.job_id == proof.job_id:
                        try:
                            traces[prop.id] = trace_payload(job, label_of(prop.id))
                        except Exception:
                            logger.exception("trace of %s could not be kept", prop.name)
            status = "stopped" if proof.stopped else \
                "failed" if job is None or job.status == "failed" else "complete"
            s.persist()
            store.finish_run(proof.job_id, status, proof.finished_at or time.time(), s.summary(), s.seq,
                             [asdict(p) for p in s.props.values()], traces)
        except Exception:
            logger.exception("run %s could not be recorded", proof.job_id)

    def _engine(self, proof: "Proof", label: str, kind: str, text: str, progress: bool) -> None:
        """A line of what the engines are doing: in the log (Engine detail) and,
        for progress, in the property's row while it runs."""
        s = self.s
        with s.lock:
            if s.proof is not proof or not proof.running:
                return
            prop = None
            if label:
                label = in_task(proof.task, label)
                child = s.props.get(f"{label}:precondition1") if kind.startswith("precondition") else None
                prop = child or s.props.get(label)
                if prop is not None:
                    proof.own_runs.add(prop.id)
            if progress:
                if prop is not None:
                    shown_on = [prop] if prop.status == "running" else []
                else:                                   # a run of several: the rows it checks
                    covers = kind == "covers"
                    shown_on = [p for p in s.props.values()
                                if p.status == "running" and p.id not in proof.own_runs and p.id not in s.splits
                                and (p.type == "cover") == covers and kind in ("bounded check", "proof", "covers")]
                for row in shown_on:
                    row.activity = f"{kind}: {text}"
                if shown_on:
                    s.bump()
            proof.engine_lines += 1
            count = proof.engine_lines
        if count > MAX_ENGINE_LINES:
            if count == MAX_ENGINE_LINES + 1:
                s.log("engine", f"More than {MAX_ENGINE_LINES} lines of solver output in this proof; "
                                "the rest is not logged (the property table still shows what each runs).",
                      code="PMI048")
            return
        where = prop.name if prop is not None else (label or "all properties")
        s.log("engine", f"[{where} · {kind}] {_shown_labels(text)}", code="PMI049",
              prop=prop.id if prop is not None else "")

    def _progress(self, proof: "Proof", label: str, expired: int, then: int) -> None:
        """The proof of a property did not finish in this scan's time limit; it is tried again with more."""
        s = self.s
        with s.lock:
            prop = s.props.get(in_task(proof.task, label))
            if prop is None or s.proof is not proof or prop.status != "running":
                return
            prop.engine = f"scan: {then}s"
            for child in s.props.values():
                if child.parent == prop.id and child.status == "running":
                    child.engine = prop.engine
            s.bump()
        s.log("engine", f'Per property time limit expired ({expired} s) for "{prop.name}"; '
                        f"it is tried again with {then} s.", code="PMI044", prop=prop.id)

    def _result(self, proof: "Proof", entry: dict, reported: set[str]) -> None:
        """One property was decided by the engine (called from its worker threads)."""
        s = self.s
        with s.lock:
            name = entry.get("name", "")
            prop = s.props.get(in_task(proof.task, name)) or s.props.get(in_task(proof.task, _prop_id(name)))
            if prop is None or prop.id in reported or s.proof is not proof:
                return
            reported.add(prop.id)
            verdict = entry.get("verdict", "ERROR")
            status = STATUS.get(verdict, "error")
            detail = (entry.get("verdict_detail") or entry.get("message") or "").strip()
            depth = s.settings["max_trace_length"]
            if prop.related == "case" and verdict == "VACUOUS":
                # a case that does not occur holds: what matters for the split is that it cannot fail
                if (entry.get("precondition") or {}).get("status") == "UNREACHABLE":
                    status, detail = "proven", "this case cannot occur"
                elif entry.get("safety_proven"):
                    status, detail = "proven", f"holds; the case does not occur within {depth} cycles"
                else:
                    status = "undetermined"
            if proof.stopped and status in ("undetermined", "error"):
                status = "stopped"
            now = time.time()
            prop.status = status
            prop.detail = proof.reason if status == "stopped" else detail
            prop.seconds = round(now - (prop.started_at or now), 2)
            prop.engine = entry.get("engine") or ("smtbmc" if status in ("cex", "covered", "undetermined") else "")
            if entry.get("cached"):
                prop.engine = f"{prop.engine or 'engine'} (reused)"
                prop.detail = ("Reused from an earlier run: nothing it depends on has changed. " + prop.detail).strip()
            step = entry.get("step") or 0
            # the depth reached: none when the bounded check itself ran out of time
            prop.bound = step if status in ("cex", "covered") and step else \
                (entry.get("bound") or depth) if status == "undetermined" and verdict != "TIMEOUT" else None
            prop.has_trace = status in ("cex", "covered") and bool(entry.get("counterexample_vcd"))
            prop.job_id = proof.job_id

            children = [c for c in s.props.values() if c.parent == prop.id]
            for child in children:
                found = entry.get(child.related) or {}
                child.seconds, child.job_id, child.engine = prop.seconds, proof.job_id, ""   # (not the scan it waited in)
                if found.get("status") == "REACHED":
                    child.status, child.bound, child.detail = "covered", found.get("step") or None, ""
                elif found.get("status") == "UNREACHABLE":
                    child.status, child.bound, child.detail = "unreachable", None, "the antecedent can never match"
                elif status == "cex" and child.related == "precondition":
                    child.status, child.bound = "covered", None
                    child.detail = "reached by the counterexample of the assertion"
                elif status == "stopped":
                    child.status, child.detail = "stopped", proof.reason
                else:
                    child.status, child.bound = "undetermined", depth
                    child.detail = f"not reached within {depth} cycles"
            # a case, or a related cover of a split assertion, can complete its result
            parent = s.props.get(prop.parent) if prop.parent in s.splits else None
            parent_settled = parent is not None and self._aggregate(proof, parent) and parent.id not in reported
            if parent_settled:
                reported.add(parent.id)
            s.bump()
        self._log_result(prop)
        for child in children:
            self._log_result(child)
        if parent_settled and parent is not None:
            self._log_result(parent)

    def _aggregate(self, proof: "Proof", parent: "Prop", final: bool = False) -> bool:
        """The status of a split assertion from its cases (call with the session locked).
        True when it has a result: proven (all cases are), a counterexample (one
        case has one), or - once the proof has ended (final) - whatever is left."""
        s = self.s
        cases = [c for c in s.props.values() if c.parent == parent.id and c.related == "case"]
        proven = sum(1 for c in cases if c.status == "proven")
        failed = next((c for c in cases if c.status == "cex"), None)
        short = lambda c: c.name.rsplit(":", 1)[-1]
        if failed is not None:
            status, detail = "cex", f"fails in {short(failed)}: its trace is a counterexample of this assertion"
        elif cases and proven == len(cases):
            # as for an assertion that is not split: holding only because its
            # antecedent never matches is vacuous, not proven
            pre = s.props.get(f"{parent.id}:precondition1")
            depth = s.settings["max_trace_length"]
            if pre is not None and pre.status == "running" and not final:
                status, detail = "running", f"all {len(cases)} cases are proven; checking its precondition"
            elif pre is not None and pre.status == "unreachable":
                status, detail = "vacuous", (f"all {len(cases)} cases hold, but only because the antecedent "
                                             f"can never match (proven): this assertion checks nothing")
            elif pre is not None and pre.status == "undetermined":
                status, detail = "vacuous", (f"all {len(cases)} cases hold, but the antecedent never matches "
                                             f"within {depth} cycles, so this assertion checked nothing")
            else:
                status, detail = "proven", f"all {len(cases)} cases are proven" + \
                    ("" if pre is None or pre.status == "covered" else "; its precondition was not checked")
        elif not final and any(c.status == "running" for c in cases):
            status, detail = "running", f"{proven} of {len(cases)} cases proven"
        else:
            status = "error" if any(c.status == "error" for c in cases) else \
                "stopped" if any(c.status == "stopped" for c in cases) else "undetermined"
            left = [short(c) for c in cases if c.status != "proven"]
            detail = f"{proven} of {len(cases)} cases proven; open: {', '.join(left[:8])}" \
                     + (f" and {len(left) - 8} more" if len(left) > 8 else "")
        parent.status, parent.detail, parent.engine, parent.job_id = status, detail, "case split", proof.job_id
        parent.bound = failed.bound if failed is not None else None
        if status != "running":
            parent.seconds = round(time.time() - (parent.started_at or time.time()), 2)
        return status != "running"

    def _log_result(self, prop: "Prop") -> None:
        took = f"{prop.seconds:.2f} s" if prop.seconds is not None else "?"
        if prop.engine.endswith("(reused)"):
            took = "no time (the result of an earlier run, reused)"
        name, kind = prop.name, "cover property" if prop.type == "cover" else "property"
        if prop.status == "proven":
            text, level = f'The property "{name}" was proven in {took}.', "result"
        elif prop.status == "cex":
            cycles = f" with {prop.bound} cycles" if prop.bound else ""
            text, level = f'A counterexample (cex){cycles} was found for the property "{name}" in {took}.', "result"
        elif prop.status == "covered":
            cycles = f" in {prop.bound} cycles" if prop.bound else ""
            text, level = f'The cover property "{name}" was covered{cycles} in {took}.', "result"
        elif prop.status == "unreachable":
            text, level = f'The cover property "{name}" was proven unreachable in {took}.', "result"
        elif prop.status == "vacuous":
            text, level = f'The property "{name}" holds vacuously: {prop.detail}', "warning"
        elif prop.status == "undetermined":
            text = f'The {kind} "{name}" is undetermined after {took}' + \
                   (f" (bound {prop.bound} cycles)" if prop.bound else "") + (f": {prop.detail}" if prop.detail else ".")
            level = "result"
        elif prop.status == "stopped":
            text, level = f'The {kind} "{name}" was not decided: {prop.detail}.', "result"
        else:
            text, level = f'The {kind} "{name}" could not be checked: {prop.detail}', "error"
        self.s.log(level, text, code={"result": "PMI050", "warning": "PMW051", "error": "PME052"}[level],
                   prop=prop.id)

    # ── check_strength ────────────────────────────────────────

    def _last_proof(self, command: str):
        """The engine's job of the last proof (it must still be on the server)."""
        from app.praman.services.formal_service import get_job
        s = self.s
        job = get_job(s.proof.job_id) if s.proof.job_id else None
        if job is None or job.result is None or job.status != "complete":
            raise CommandError(f"{command}: run a proof first (prove -all); "
                               f"{command} works on the results of the last proof")
        return job

    def cmd_check_strength(self, args: list[str]) -> str:
        from app.praman.services.formal_service import MAX_PARALLEL_CHECKS, FormalService
        from app.praman.services.strength_service import PASSING, new_run, run_strength
        s = self.s
        opts, rest = options("check_strength", args, valued={"-mutants"})
        if rest:
            raise CommandError(f'check_strength: unexpected argument "{rest[0]}"')
        self._elaborated("check_strength")
        self._no_proof_running("check_strength")
        count = opts.get("-mutants", "20")
        if not count.isdigit() or not 1 <= int(count) <= 200:
            raise CommandError("check_strength: -mutants takes a number from 1 to 200")
        job = self._last_proof("check_strength")
        passing = [a["name"] for a in job.result.assertion_results
                   if a.get("type") == "ASSERT" and a.get("verdict") in PASSING]
        if not passing:
            raise CommandError("check_strength: no assertion holds in the last proof, so there is nothing to measure")
        s.log("info", f"Measuring the strength of {len(passing)} assertion{'s' if len(passing) != 1 else ''} "
                      f"of the last proof with up to {count} mutants of the design.", code="PMI070")
        run = new_run(job.job_id)
        with s.lock:
            s.strength = {**run.to_dict(), "status": "running"}
            s.bump()
        done = threading.Event()

        def work():
            try:
                service = FormalService()
                service.cut, service.without = self._design_edits()
                run_strength(job, service, count=int(count), workers=MAX_PARALLEL_CHECKS,
                             timeout=s.settings["per_property_time_limit"], run=run)
            finally:
                done.set()
        threading.Thread(target=work, name=f"praman-strength-{s.id}", daemon=True).start()
        last = -1
        while not done.wait(1.0):
            if run.done != last:
                last = run.done
                with s.lock:
                    s.strength = {**run.to_dict(), "status": "running"}
                    s.bump()
        result = run.to_dict()
        with s.lock:
            s.strength = result
            s.bump()
        if run.status == "failed":
            raise CommandError(f"check_strength: {run.message}")
        score = "no mutant could be checked" if result["score"] is None else f"score {result['score']}%"
        s.log("result", f"Assertion strength: {result['detected']} of {result['checked']} mutants detected "
                        f"({score}); {result['equivalent']} changed nothing the design shows "
                        f"(not counted).", code="PMI071")
        for name, caught in result["per_assertion"].items():
            prop = s.props.get(name)
            s.log("result", f'"{prop.name if prop else name}" detects {caught} mutant{"s" if caught != 1 else ""}.',
                  code="PMI072", prop=name if prop else "")
        for m in result["mutants"]:
            if m["status"] == "survived":
                s.log("warning", f"{m['location']}: no assertion fails when {m['mutation']}"
                                 + (f"  ({m['code']})" if m.get("code") else ""), code="PMW073")
        return "" if result["score"] is None else str(result["score"])

    # ── check_equivalence ─────────────────────────────────────

    def cmd_check_equivalence(self, args: list[str]) -> str:
        from app.praman.services.equivalence_service import LABEL, run_equivalence
        from app.praman.services.formal_service import FormalService
        from app.praman.services.sv_preprocessor import preprocess
        s = self.s
        opts, rest = options("check_equivalence", args, valued={"-revised", "-depth"}, flags={"-bounded"})
        if rest:
            raise CommandError(f'check_equivalence: unexpected argument "{rest[0]}"')
        self._elaborated("check_equivalence")
        self._no_proof_running("check_equivalence")
        names = []
        for name in tcl_split(opts.get("-revised", "")):
            found = sources.resolve(name, s.files)
            if not found:
                raise CommandError(f'check_equivalence: file "{name}" is not among the session files')
            names.append(found)
        if not names:
            raise CommandError("check_equivalence: name the revised design files: -revised {<file> ...}")
        depth = opts.get("-depth", str(s.settings["max_trace_length"]))
        if not depth.isdigit() or not 1 <= int(depth) <= 10000:
            raise CommandError("check_equivalence: -depth takes a number of cycles")
        revised = join_sources([(n, s.files[n]) for n in names], "revised.sv")
        original_name = "original.sv"
        gold = {original_name: preprocess(s.design.text, original_name)}
        gate = {revised.name: preprocess(revised.text, revised.name)}
        if s.reset is None:
            reset_signal, polarity = "", "auto"
        elif not s.reset[0]:
            reset_signal, polarity = "", "none"
        else:
            reset_signal, polarity = s.reset[0], "low" if s.reset[1] else "high"
        mode = "bmc" if "-bounded" in opts else "prove"
        with s.lock:
            s.runs += 1
            job_id = f"{s.id}_eq{s.runs}"
            s.equivalence = {"status": "running", "revised": names, "job_id": job_id, "mode": mode}
            s.bump()
        s.log("info", f"Checking that {', '.join(names)} behaves like the analyzed design "
                      f"(top {s.top}, {'bounded: ' + depth + ' cycles' if mode == 'bmc' else 'full proof'}).",
              code="PMI075")
        job = run_equivalence(FormalService(), gold, gate, top=s.top, mode=mode, depth=int(depth),
                              timeout=s.settings["per_property_time_limit"], reset_signal=reset_signal,
                              reset_polarity=polarity, project_name=job_id)
        if job.status == "failed" or job.result is None:
            with s.lock:
                s.equivalence = {**s.equivalence, "status": "error", "detail": job.error_message.strip()}
                s.bump()
            raise CommandError(f"check_equivalence: {job.error_message.strip()}")
        entry = job.result.assertion_results[0]
        status = {"PROVEN": "equivalent", "HOLDS_BOUNDED": "equivalent_bounded", "FAIL": "different"}.get(
            entry["verdict"], "undetermined")
        with s.lock:
            s.equivalence = {
                "status": status, "revised": names, "job_id": job_id, "mode": mode,
                "detail": entry.get("verdict_detail", ""), "explanation": entry.get("explanation", []),
                "differences": entry.get("differences", []), "label": LABEL,
                "has_trace": bool(entry.get("counterexample_vcd")), "summary": job.parse_summary,
            }
            s.bump()
        level = "warning" if status == "different" else "result"
        s.log(level, f"Equivalence: {entry.get('verdict_detail', '')}", code="PMI076")
        return status

    # ── report ────────────────────────────────────────────────

    def summary_text(self) -> str:
        counts = self.s.summary()

        def block(title: str, group: str, always: list[str], if_any: list[str]) -> list[str]:
            total = counts[group].get("total", 0)
            lines = [f"      {title:<28}: {total}"]
            for status in [*always, *(st for st in if_any if counts[group].get(st))]:
                n = counts[group].get(status, 0)
                share = f" ({100 * n / total:.4g}%)" if total else ""
                lines.append(f"       - {status:<25}: {n}{share}")
            return lines
        total = sum(g.get("total", 0) for name, g in counts.items() if name != "assume")
        rule = "=" * 62
        return "\n".join([
            rule, "SUMMARY", rule,
            f"    {'Properties Considered':<30}: {total}",
            *block("assertions", "assert", ["proven", "cex", "undetermined", "error"],
                   ["vacuous", "stopped", "not_run"]),
            *block("covers", "cover", ["covered", "unreachable", "undetermined", "error"], ["stopped", "not_run"]),
            *block("related covers", "related", ["covered", "unreachable", "undetermined"], ["stopped", "not_run"]),
            *(block("cases of split assertions", "case", ["proven", "cex", "undetermined"],
                    ["error", "stopped", "not_run"]) if counts["case"].get("total") else []),
            f"    {'Assumptions':<30}: {counts['assume'].get('total', 0)}",
        ])

    def cmd_report(self, args: list[str]) -> str:
        options("report", args, flags={"-summary", "-results", "-force"}, ignored_valued={"-file", "-task"})
        self._elaborated("report")
        self.s.log("out", self.summary_text())
        return ""
