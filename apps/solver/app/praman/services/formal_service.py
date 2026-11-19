"""
VeriAssist v2.0 — Formal Verification Service

Orchestrates the formal verification pipeline:
  1. Compile: slang elaborates design + SVA, the SVA compiler builds monitor
     modules, Yosys confirms it can read the result (compile_design, ADR-001)
  2. Stage SymbiYosys projects (design + monitors + harness + .sby config)
  3. Run them in parallel batches: bounded checks, covers, full proofs,
     vacuity and sanity checks, liveness
  4. Give every property a verdict (see VERDICTS) and keep the traces of
     failures and covers for the waveform and its explanation

Supports both synchronous (blocking) and async (job-based) execution.
"""

import math
import os
import threading
import uuid
import time
import asyncio
import subprocess
import logging
import shutil
import itertools
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Callable
from pathlib import Path
from typing import Optional, Any
from dataclasses import dataclass, field
from datetime import datetime

from app.praman import ceilings
from app.praman.services.proc import MemoryLimitExceeded, run_tree, sby_command, sby_environment
from app.workspace import clear_inside, remove_inside
from app.praman.services.compile_worker import run_isolated
from app.praman.services.sv_preprocessor import preprocess
from app.praman.services.sva.frontend import FrontendError
from app.praman.services.sva.pipeline import UNSUPPORTED_MARKER, PreparedDesign, prepare, prepare_checked, syntax_preview
from app.praman.services.yosys_reader import MONITOR_FILE, RTLIL, SLANG, preferred_reader
from app.praman.services.sva.compiler import (
    IN_RESET_NET, LIVE_FAIR_INFIX, LIVE_INFIX, PRECONDITION_SUFFIX, WITNESS_INFIX, WITNESS_MACRO, WITNESS_SUFFIX,
)
from app.praman.services.sby_generator import (
    SbyProject, SbyResult,
    SANITY_COVER_LABEL,
    generate_files_project,
    parse_sby_output,
)

logger = logging.getLogger("veriassist.formal")

# FORMAL_WORK_DIR in the environment: the proof workers use the folder of the server that started them
FORMAL_WORK_DIR = Path(os.environ.get("FORMAL_WORK_DIR") or Path(__file__).parent.parent.parent / "data" / "formal_work")

# Properties checked concurrently per job (each check is a chain of sby
# subprocess runs).  Override with FORMAL_MAX_PARALLEL.
MAX_PARALLEL_CHECKS = int(os.environ.get("FORMAL_MAX_PARALLEL", "") or min(4, os.cpu_count() or 1))

# Disk hygiene: after a job only logs and the traces shown in the UI are
# kept (solver models, source copies and witness files can be hundreds of MB
# per job); job folders older than FORMAL_RETENTION_DAYS are deleted when a
# new job starts.  FORMAL_KEEP_ARTIFACTS=1 keeps everything (debugging).
KEEP_ARTIFACTS = os.environ.get("FORMAL_KEEP_ARTIFACTS", "") == "1"
RETENTION_DAYS = float(os.environ.get("FORMAL_RETENTION_DAYS", "7"))

# Batched runs: properties per bounded run, per cover run and per proof run
# (measured: bounded runs barely grow with size; covers and proofs do).
BMC_CHUNK = 128
COVER_CHUNK = 32
PROVE_CHUNK = 32

# Unbounded proof engine for mode "prove" (IC3/PDR; handles assumptions and
# produces counterexamples) and its per-run time limit.
PROOF_ENGINE = "abc pdr"
# Full proofs race IC3/PDR against k-induction; the first conclusive engine
# decides (k-induction is often faster when the property is inductive).
# All SVA files of a job are compiled as one source under this name
SVA_FILENAME = "sva.sv"
PROOF_ENGINES = "abc pdr\nsmtbmc yices"
PROOF_ENGINE_LABEL = "abc pdr / k-induction"
PROOF_TIMEOUT_SECONDS = 120
# Liveness (s_eventually, s_until, strong sequences): SymbiYosys live mode
LIVE_ENGINE = "aiger suprove"

# Per-property verdicts:
#   PROVEN         holds in every reachable state (full proof)
#   HOLDS_BOUNDED  no counterexample within the BMC depth; not fully proven
#   FAIL           counterexample found
#   VACUOUS        passes only because its antecedent never matches, or the
#                  assumptions are contradictory
#   COVERED        cover reached
#   UNREACHABLE    cover proven unreachable
#   NOT_REACHED    cover not reached within the BMC depth
#   ERROR/TIMEOUT  tool problem or unsupported construct
# `status` keeps the older PASS/FAIL/SKIPPED/ERROR values for existing clients.
LEGACY_STATUS = {
    "PROVEN": "PASS",
    "HOLDS_BOUNDED": "PASS",
    "VACUOUS": "PASS",
    "COVERED": "PASS",
    "FAIL": "FAIL",
    "UNREACHABLE": "SKIPPED",
    "NOT_REACHED": "SKIPPED",
    "ERROR": "ERROR",
    "TIMEOUT": "TIMEOUT",
}


# ═══════════════════════════════════════════════════════════════
# JOB TRACKING
# ═══════════════════════════════════════════════════════════════

@dataclass
class FormalJob:
    """Tracks the state of a formal verification job."""
    job_id: str
    status: str = "queued"     # queued | generating_sva | lowering | proving | complete | failed
    created_at: str = ""
    completed_at: str = ""

    # Input
    description: str = ""
    sva_code: str = ""
    dut_code: str = ""
    dut_filename: str = ""
    mode: str = "bmc"
    depth: int = 20
    solver: str = ""
    timeout: int = 300             # seconds per solver run
    dut_top: str = ""
    reset_signal: str = ""         # "" = auto
    reset_polarity: str = "auto"   # auto | low | high | none
    clock_signal: str = ""         # clock for assertions without one ("" = auto)
    auto_checks: bool = False      # add automatic checks (branch reachability, index range)
    engine: str = "sby"            # sby | native | both (app/engine, PRD §9.1)

    # Pipeline outputs
    lowered_rtl: str = ""
    debug_info: dict = field(default_factory=dict)   # label -> CompiledProperty.debug
    sby_project_dir: str = ""
    parse_summary: str = ""

    # Result
    result: Optional[SbyResult] = None
    error_message: str = ""

    # Timing
    generation_time: float = 0
    lowering_time: float = 0
    proving_time: float = 0
    total_time: float = 0


# In-memory job store (sufficient for single-user local tool)
_jobs: dict[str, FormalJob] = {}


# Finished jobs kept in memory (their traces are read from here); the
# oldest finished ones go beyond this.  Praman keeps a signed-in user's runs,
# with their traces, in its database.
MAX_JOBS_IN_MEMORY = int(os.environ.get("FORMAL_MAX_JOBS", "") or 300)
_jobs_lock = threading.Lock()


def remember_job(job: FormalJob) -> None:
    """Add a job to the table, dropping the oldest finished jobs over the limit."""
    with _jobs_lock:
        _jobs[job.job_id] = job
        extra = len(_jobs) - MAX_JOBS_IN_MEMORY
        if extra > 0:
            finished = [j for j in _jobs.values() if j.status in ("complete", "failed") and j is not job]
            for old in sorted(finished, key=lambda j: j.created_at)[:extra]:
                _jobs.pop(old.job_id, None)


def get_job(job_id: str) -> Optional[FormalJob]:
    """Retrieve a job by ID."""
    return _jobs.get(job_id)


def list_jobs(limit: int = 20) -> list[FormalJob]:
    """List recent jobs, newest first."""
    jobs = sorted(_jobs.values(), key=lambda j: j.created_at, reverse=True)
    return jobs[:limit]


# ═══════════════════════════════════════════════════════════════
# SYNCHRONOUS PIPELINE (blocking, for direct API calls)
# ═══════════════════════════════════════════════════════════════

def compile_design(sva_code: str, dut_code: str, dut_filename: str = "dut.sv", dut_top: str = "",
                   reset_signal: str = "", reset_polarity: str = "auto", clock_signal: str = "",
                   auto_checks: bool = False, witness_covers: bool = False) -> PreparedDesign:
    """The compile stage of a run: slang elaborates design + SVA, the SVA
    compiler builds the monitors, Yosys confirms it can read the result.
    Shared by run_formal and the pre-run check, so a design that passes the
    check also passes this stage of the run.  Raises FrontendError.

    yosys-slang reads the design as written; the preprocessor's rewrites
    (packed 2-D arrays to unpacked ones) are for Yosys's own reader only, as
    they change the types a bound checker connects to."""
    def attempt(rewrite: bool) -> PreparedDesign:
        return prepare_checked(
            {dut_filename: preprocess(dut_code, dut_filename) if rewrite else dut_code} if dut_code.strip() else {},
            {SVA_FILENAME: sva_code} if sva_code.strip() else {},
            dut_top,
            reset_signal=reset_signal,
            reset_polarity=reset_polarity,
            clock_signal=clock_signal,
            auto_checks=auto_checks,
            witness_covers=witness_covers,
        )
    if preferred_reader() == SLANG and preprocess(dut_code, dut_filename) != dut_code:
        try:
            prepared = attempt(rewrite=False)
            if prepared.reader == SLANG:
                return prepared
        except FrontendError:
            pass
    return attempt(rewrite=True)


def _lower_only(sva_code: str, dut_code: str) -> dict:
    design = {"design.sv": preprocess(dut_code, "design.sv")} if dut_code.strip() else {}
    try:
        prepared = prepare(design, {SVA_FILENAME: sva_code})
    except FrontendError as e:
        if design:
            raise
        # Without the design a bind target cannot be elaborated: check the
        # syntax and list the assertions; full compilation needs the design.
        return syntax_preview(sva_code, str(e))
    supported = sum(1 for p in prepared.properties if p.supported)
    return {
        "parsed_summary": prepared.summary,
        "lowered_rtl": prepared.monitor_text,
        "properties": supported,
        "assertions": len(prepared.properties),
    }


class FormalService:
    """Main formal verification service."""

    def __init__(self):
        self._check_tools()
        # Hooks for one run, set on an instance of its own (app/praman):
        #   only         check just these properties (labels)
        #   cancel       threading.Event; once set, the solvers of the run are stopped
        #   on_property  called with each property's result as soon as it is decided
        #   scans        time limits (seconds, rising) of the full-proof runs: every
        #                undecided property is tried with the first, those still
        #                undecided with the next, ...  Easy properties are decided at
        #                once and a hard one cannot hold them up.  Replaces the fixed
        #                PROOF_TIMEOUT_SECONDS.
        #   on_progress  called (label, limit that expired, next limit) between scans
        self.only: Optional[set[str]] = None
        self.cancel: Optional[threading.Event] = None
        self.on_property: Optional[Callable[[dict], None]] = None
        self.scans: Optional[list[int]] = None
        self.on_progress: Optional[Callable[[str, int, int], None]] = None
        # With scans, every engine run is given the time it takes to build the
        # model of the design on top of its limit (each run builds it again), so
        # the limits are solving time: a 10 s scan is not used up by a design that
        # takes 8 s to read.  None: measured from the compile stage of the run.
        self.build_seconds: Optional[float] = None
        #   cache        a result_cache.Cache: decided results are reused when nothing
        #                they depend on changed, and new ones are kept
        self.cache = None
        self._cache_keys: dict[str, str] = {}
        #   on_engine    called (label, kind of run, line) with what the engines of a
        #                running check are doing (app/services/engine_log.py); label ""
        #                for a run of several properties
        self.on_engine: Optional[Callable[[str, str, str, bool], None]] = None
        #   cut          signals whose drivers are removed (stopat): each is a free
        #                input of the design, any value in any cycle
        #   without      labels of assumptions left out (assume -disable)
        self.cut: list[str] = []
        self.without: list[str] = []
        self._run_labels: dict[str, str] = {}

    def _check_tools(self):
        """Check if sby and yosys are available."""
        self.sby_available = shutil.which("sby") is not None
        self.yosys_available = shutil.which("yosys") is not None
        if self.sby_available:
            logger.info("SymbiYosys (sby) found in PATH")
        else:
            logger.warning("SymbiYosys (sby) NOT found. Formal verification unavailable.")
            logger.warning("Install OSS CAD Suite: https://github.com/YosysHQ/oss-cad-suite-build/releases")

    def is_available(self) -> bool:
        """Check if formal verification tools are installed."""
        return self.sby_available and self.yosys_available

    # ── Full Pipeline (SVA code → formal result) ──────────

    def run_formal(
        self,
        sva_code: str,
        dut_code: str = "",
        dut_filename: str = "dut.sv",
        dut_top: str = "",
        mode: str = "bmc",
        depth: int = 20,
        solver: str = "",
        timeout: int = 300,
        project_name: str = "",
        reset_signal: str = "",
        reset_polarity: str = "auto",
        clock_signal: str = "",
        auto_checks: bool = False,
        engine: str = "sby",
        portfolio: bool = False,
        witness_covers: bool = False,
    ) -> FormalJob:
        """
        Run the complete formal verification pipeline synchronously.

        Args:
            sva_code: SVA checker module code (from LLM or user)
            dut_code: DUT SystemVerilog code (optional for standalone)
            dut_filename: filename for the DUT
            dut_top: top module name in DUT
            mode: "bmc" | "prove" | "cover"
            depth: BMC depth (number of cycles)
            solver: SMT solver ("yices", "z3", "boolector", or "" for default)
            timeout: max seconds for sby execution
            project_name: custom name for the project directory
            reset_signal: reset input the harness drives ("" = automatic)
            reset_polarity: "auto", "low", "high" or "none" (no reset)
            clock_signal: top-module input clocking assertions written without
                a clock or default clocking ("" = every solver step)
            auto_checks: also check the design without SVA: every if/case
                branch reachable (dead code), array indexes within bounds
            engine: "sby" (SymbiYosys, the default), "native" (app/engine) or
                "both" (PROVEN only with two independent engines, evidence level L2)
            portfolio: with engine "both", also try rIC3, avy and abc pdr
                (app/engine/portfolio.py) on the assertions that held
            witness_covers: also cover a non-vacuous pass of each assertion
                with an antecedent; reported as the entry's "witness"

        Returns:
            FormalJob with complete results
        """
        depth, timeout = ceilings.depth(depth), ceilings.seconds(timeout)   # SiliconBox (ADR 0031)
        if not project_name:
            project_name = f"formal_{uuid.uuid4().hex[:8]}"

        job = FormalJob(
            job_id=project_name,
            created_at=datetime.now().isoformat(),
            sva_code=sva_code,
            dut_code=dut_code,
            dut_filename=dut_filename,
            mode=mode,
            depth=depth,
            solver=solver,
            timeout=timeout,
            dut_top=dut_top,
            reset_signal=reset_signal,
            reset_polarity=reset_polarity,
            clock_signal=clock_signal,
            auto_checks=auto_checks,
            engine=engine,
        )
        remember_job(job)
        if engine not in ("sby", "native", "both"):
            job.status = "failed"
            job.error_message = f"unknown engine '{engine}' (sby, native or both)"
            return job

        t_total = time.time()
        prune_old_jobs(FORMAL_WORK_DIR, RETENTION_DAYS)

        try:
            job.status = "lowering"
            t0 = time.time()
            # ADR-001: slang elaborates DUT + SVA; the SVA compiler builds
            # monitors that are instantiated inside the checked modules.
            prepared = run_isolated(
                compile_design, sva_code, dut_code, dut_filename, dut_top,
                reset_signal=reset_signal,
                reset_polarity=reset_polarity,
                clock_signal=clock_signal,
                auto_checks=auto_checks,
                witness_covers=witness_covers,
            )
            notes = {p.label: p.note for p in prepared.properties if p.note}
            job.debug_info = {p.label: p.debug for p in prepared.properties if p.debug}
            job.parse_summary = prepared.summary
            lowered = prepared.monitor_text

            cut = design_edits(prepared.top, self.cut, self.without)
            shared = SharedModel(prepared, lowered, FORMAL_WORK_DIR / project_name, timeout=PROOF_TIMEOUT_SECONDS,
                                 cancel=self.cancel, cut=cut) if REUSE_MODEL else None

            def stage(run_dir, monitor, run_mode, engine, run_solver, run_timeout, sanity_cycles, run_depth=0):
                common = dict(mode=run_mode, depth=(run_depth or depth) * prepared.steps_per_cycle, engine=engine,
                              solver=run_solver, timeout=run_timeout, multiclock=prepared.multiclock)
                # A plain isolation (not a cover turned into an assertion, not the
                # sanity run, not a liveness run) starts from the shared model.
                if (shared is not None and isinstance(monitor, IsolatedMonitor) and not monitor.as_assert
                        and not sanity_cycles and run_mode != "live"):
                    model = shared.text()
                    if model is not None and shared.has_checks(monitor.active):
                        return generate_files_project(
                            str(run_dir), run_dir.name, {SHARED_MODEL_FILE: model}, prepared.top,
                            reader=RTLIL, extra_script=SharedModel.keep_only(monitor.active), **common)
                files = prepared.sources(sanity_cycles)
                files[MONITOR_FILE] = monitor
                return generate_files_project(
                    str(run_dir), run_dir.name, files, prepared.top,
                    reader=prepared.reader, prep_script=prepared.script, extra_script=cut or None, **common,
                )
            job.lowered_rtl = lowered
            job.lowering_time = time.time() - t0
            if self.cache is not None:
                from app.praman.services.result_cache import property_keys
                try:
                    # a cut signal (stopat) or an assumption left out changes what the design can do
                    self._cache_keys = property_keys(
                        prepared, lowered, depth, mode + "".join(f"|cut:{c}" for c in sorted(self.cut))
                        + "".join(f"|without:{a}" for a in sorted(self.without)))
                except Exception:
                    logger.exception("result cache keys could not be computed; nothing is reused")
                    self._cache_keys = {}
            if self.scans and self.build_seconds is None:
                self.build_seconds = job.lowering_time
            logger.info(f"[{job.job_id}] Lowered to {len(lowered.splitlines())} lines of RTL ({job.lowering_time:.2f}s)")

            if engine == "native":
                job.status = "proving"
                t0 = time.time()
                job.result = self._run_native(job, prepared, project_name)
                for entry in job.result.assertion_results:
                    entry["description"] = notes.get(entry["name"], "")
                job.proving_time = time.time() - t0
                job.status = "complete"
                job.total_time = time.time() - t_total
                job.completed_at = datetime.now().isoformat()
                return job

            # Step 4: Run SymbiYosys
            if not self.is_available():
                job.status = "failed"
                job.error_message = "SymbiYosys (sby) not found in PATH. Install OSS CAD Suite."
                return job

            job.status = "proving"
            t0 = time.time()

            lowered_assert_labels = self._extract_lowered_assert_labels(lowered)
            logger.info(f"[{job.job_id}] Checking {len(lowered_assert_labels)} properties")
            sby_result = self._run_isolated_assertions(
                project_name=project_name,
                lowered_rtl=lowered,
                assert_labels=lowered_assert_labels,
                mode=mode,
                depth=depth,
                solver=solver,
                timeout=timeout,
                stage=stage,
            )
            sby_result.harness = prepared.harness_info()
            if engine == "both":
                from app.praman.engine.native import merge_both
                native = self._run_native(job, prepared, project_name, raw=True)
                port = None
                if portfolio and mode == "prove":
                    from app.praman.engine import portfolio as portfolio_engines
                    candidates = [e["name"] for e in sby_result.assertion_results if e.get("type") == "ASSERT"
                                  and e["verdict"] in ("PROVEN", "HOLDS_BOUNDED")
                                  and (native.verdicts.get(e["name"]) is None
                                       or native.verdicts[e["name"]].verdict != "FAIL")]
                    port = portfolio_engines.prove(prepared, candidates, depth, timeout=min(timeout, PROOF_TIMEOUT_SECONDS),
                                                   work_dir=FORMAL_WORK_DIR / project_name)
                if native.ok:
                    sby_result.assertion_results = merge_both(sby_result.assertion_results, native, port)
                else:
                    sby_result.error_message += f"\nnative engine: {native.error}"
            for entry in sby_result.assertion_results:
                entry["description"] = notes.get(entry["name"], "")
            job.sby_project_dir = str(FORMAL_WORK_DIR / project_name)

            job.result = sby_result
            job.proving_time = time.time() - t0

            logger.info(
                f"[{job.job_id}] SymbiYosys result: {sby_result.status} "
                f"(depth={sby_result.depth_reached}, {job.proving_time:.2f}s)"
            )

            if sby_result.assertion_results:
                passed = [a for a in sby_result.assertion_results if a["status"] == "PASS"]
                failed = [a for a in sby_result.assertion_results if a["status"] == "FAIL"]
                skipped = [a for a in sby_result.assertion_results if a["status"] == "SKIPPED"]
                errored = [a for a in sby_result.assertion_results if a["status"] == "ERROR"]

                logger.info(
                    f"[{job.job_id}] Assertion summary: "
                    f"PASS={len(passed)} FAIL={len(failed)} "
                    f"SKIPPED={len(skipped)} ERROR={len(errored)}"
                )

                for assertion in passed:
                    logger.info(f"[{job.job_id}]   PASS: {assertion['name']}")
                for assertion in failed:
                    step_suffix = f" at step {assertion['step']}" if assertion.get("step") else ""
                    logger.info(f"[{job.job_id}]   FAIL: {assertion['name']}{step_suffix}")
                for assertion in skipped:
                    logger.info(f"[{job.job_id}]   SKIPPED: {assertion['name']}")
                for assertion in errored:
                    logger.info(f"[{job.job_id}]   ERROR: {assertion['name']} {assertion.get('message', '').strip()}".rstrip())
            elif sby_result.failed_assertions:
                for fa in sby_result.failed_assertions:
                    logger.info(f"[{job.job_id}]   FAIL: {fa['name']} at step {fa['step']}")

            if sby_result.status == "ERROR" and sby_result.error_message:
                first_error = sby_result.error_message.strip().splitlines()[-1]
                logger.error(f"[{job.job_id}] Formal run error detail: {first_error}")

            job.status = "complete"

        except Exception as e:
            logger.error(f"[{job.job_id}] Formal pipeline error: {e}", exc_info=True)
            job.status = "failed"
            job.error_message = str(e)

        job.total_time = time.time() - t_total
        job.completed_at = datetime.now().isoformat()

        return job

    def _run_native(self, job: FormalJob, prepared, project_name: str, raw: bool = False):
        """The native engine on the compiled design: an SbyResult-shaped result
        (or the EngineResult itself with raw)."""
        from app.praman.engine.api import EngineJob
        from app.praman.engine.native import NativeEngine, to_entries
        engine_job = EngineJob(rtl=job.dut_code, sva=job.sva_code, rtl_name=job.dut_filename, top=job.dut_top,
                               clock=job.clock_signal, reset=job.reset_signal, reset_polarity=job.reset_polarity,
                               mode=job.mode, depth=job.depth, timeout=job.timeout, name=f"{project_name}__native")
        native = NativeEngine(solver=job.solver if job.solver in ("yices", "z3", "bitwuzla", "boolector") else "",
                              work_dir=FORMAL_WORK_DIR / project_name).run_prepared(prepared, engine_job)
        if raw:
            return native
        result = SbyResult(status="PASS", depth_reached=job.depth, harness=prepared.harness_info())
        if not native.ok:
            result.status = "ERROR"
            result.error_message = native.error
            return result
        result.assertion_results = to_entries(native)
        result.sanity = {"status": native.sanity, "message": "" if native.sanity == "OK" else
                         "The assumptions stop the design from running the whole BMC depth after reset."}
        for entry in result.assertion_results:
            if entry["verdict"] == "FAIL":
                result.status = "FAIL"
                result.failed_assertions.append({"name": entry["name"], "file": "", "line": 0,
                                                 "step": entry["step"], "message": entry["message"]})
                result.counterexample_vcd = result.counterexample_vcd or entry["counterexample_vcd"]
            elif entry["verdict"] in ("ERROR", "TIMEOUT") and result.status == "PASS":
                result.status = entry["verdict"]
        if result.status == "PASS" and any(e["verdict"] == "VACUOUS" for e in result.assertion_results):
            result.status = "VACUOUS"
        result.elapsed_seconds = native.seconds
        return result

    # ── SymbiYosys Execution ──────────────────────────────

    def _run_sby(self, sby_file: str, work_dir: str, timeout: int = 300) -> SbyResult:
        """Execute SymbiYosys and parse its output."""
        try:
            # in a process group of its own: on a timeout the solvers under sby are killed too
            env, problem = sby_environment()
            if problem:
                return SbyResult(status="ERROR", return_code=-1,
                                 error_message=f"The proof engine cannot be started: {problem}")
            follow = self._follow_engines(Path(sby_file).parent)
            try:
                proc = run_tree(sby_command(sby_file), timeout=timeout, cancel=self.cancel,
                                cwd=os.path.dirname(sby_file), **({"env": env} if env else {}))
            finally:
                follow()

            return parse_sby_output(
                stdout=proc.stdout,
                stderr=proc.stderr,
                returncode=proc.returncode,
                work_dir=work_dir,
            )

        except MemoryLimitExceeded as e:
            logger.warning(f"SymbiYosys stopped: {e}")
            return SbyResult(
                status="ERROR",
                return_code=-1,
                error_message=(f"The proof tools needed more than {e.limit_mb} MB of memory "
                               f"(PRAMAN_JOB_MEMORY_MB) and were stopped; this check is too big for the "
                               f"server's memory"),
            )

        except subprocess.TimeoutExpired:
            logger.warning(f"SymbiYosys timed out after {timeout}s")
            return SbyResult(
                status="TIMEOUT",
                return_code=-1,
                error_message=f"Solver timed out after {timeout} seconds. Try reducing BMC depth.",
            )

        except FileNotFoundError:
            logger.error("sby executable not found")
            return SbyResult(
                status="ERROR",
                return_code=-1,
                error_message="SymbiYosys (sby) not found. Is OSS CAD Suite in PATH?",
            )

        except Exception as e:
            logger.error(f"SymbiYosys execution error: {e}")
            return SbyResult(
                status="ERROR",
                return_code=-1,
                error_message=str(e),
            )

    _RUN_KINDS = [("_pre_prove", "precondition proof"), ("_pre", "precondition"), ("_prove", "proof"),
                  ("_livewit", "liveness witness"), ("_live", "liveness")]
    _BATCH_KINDS = [(r"__bmc\d+$", "bounded check"), (r"__cover\d+$", "covers"), (r"__prove\d+$", "proof"),
                    (r"__00_sanity$", "assumption check")]

    def describe_run(self, name: str) -> tuple[str, str]:
        """(property label, kind of run) of a run by its folder name; label "" for a batch."""
        best = ""
        for prefix in self._run_labels:
            if name.startswith(prefix) and len(prefix) > len(best):
                best = prefix
        if best:
            rest = name[len(best):]
            kind = next((k for suffix, k in self._RUN_KINDS if rest.startswith(suffix)),
                        "bounded check" if not rest else rest.strip("_"))
            return self._run_labels[best], kind
        kind = next((k for pattern, k in self._BATCH_KINDS if re.search(pattern, name)), "run")
        return "", kind

    def _follow_engines(self, run_dir: Path) -> Callable[[], None]:
        """Start reading the solver output of the run in `run_dir` (with on_engine);
        the function returned stops it (after the last lines)."""
        if self.on_engine is None:
            return lambda: None
        from app.praman.services.engine_log import follow_run
        label, kind = self.describe_run(run_dir.name)
        on_engine, stop = self.on_engine, threading.Event()

        def emit(text: str, progress: bool) -> None:
            try:
                on_engine(label, kind, text, progress)
            except Exception:                       # the display never stops a proof
                logger.debug("on_engine failed", exc_info=True)
        thread = threading.Thread(target=follow_run, args=(run_dir, emit, stop), daemon=True,
                                  name=f"engines-{run_dir.name}")
        try:
            thread.start()
        except RuntimeError:                      # no thread to spare: the check runs without live output
            logger.warning("no thread for the solver output of %s; it is not shown", run_dir.name)
            return lambda: None

        def finish() -> None:
            stop.set()
            thread.join(timeout=5)
        return finish

    def _run_isolated_assertions(
        self,
        project_name: str,
        lowered_rtl: str,
        assert_labels: list[str],
        mode: str,
        depth: int,
        solver: str,
        timeout: int,
        stage: Callable[..., SbyProject],
    ) -> SbyResult:
        """
        Check each lowered assertion/cover in its own SymbiYosys projects and
        assign it a verdict (see VERDICTS).

        Assertions: bounded check (shortest counterexample) -> precondition
        cover (vacuity) -> full proof with abc pdr (mode "prove" only).
        Covers: bounded search -> unreachability proof (mode "prove" only).
        A job-level sanity check confirms the assumptions let the design run
        the whole depth; if not, every passing assertion is vacuous.

        Properties (and the sanity check) are independent, so they run in
        parallel on up to MAX_PARALLEL_CHECKS worker threads; each thread
        spends its time waiting on sby subprocesses.
        """
        aggregate = SbyResult(status="PASS")
        parent_dir = FORMAL_WORK_DIR / project_name
        assertions_dir = parent_dir / "assertions"

        if parent_dir.exists():
            remove_inside(parent_dir, FORMAL_WORK_DIR)
        assertions_dir.mkdir(parents=True, exist_ok=True)

        aggregate.log_paths["job_dir"] = str(parent_dir)
        aggregate.log_paths["assertions_dir"] = str(assertions_dir)

        full_proof = mode == "prove"
        scans = sorted(set(self.scans)) if self.scans else [min(timeout, PROOF_TIMEOUT_SECONDS)]
        proof_timeout = scans[-1]
        # With scans the bounded checks follow them too: the batched runs get
        # the first limit (one hard property must not hold up the whole batch),
        # and a property checked on its own gets the limit of the current scan.
        batch_timeout = scans[0] if self.scans else timeout
        build_allowance = math.ceil(2 * (self.build_seconds or 0)) if self.scans else 0
        label_types = self._label_type_map(lowered_rtl)
        if self.only is not None:
            assert_labels = [l for l in assert_labels if l in self.only]
            # covers asked for by name that are not properties of their own: the
            # related covers of an assertion that is not proven itself (a case split)
            assert_labels += sorted(l for l in self.only if l not in assert_labels
                                    and label_types.get(l) == "COVER")
        cached = self._cached_results(assert_labels, assertions_dir.parent) if self.cache is not None else {}
        assert_labels = [l for l in assert_labels if l not in cached]

        def run(run_name: str, monitor: str, run_mode: str, engine: str = "smtbmc",
                run_timeout: int = timeout, sanity_cycles: int = 0, run_depth: int = 0) -> tuple[str, SbyResult]:
            """Stage and run one SymbiYosys project; returns (work_dir, result).
            run_depth: cycles of this run when not the job's depth."""
            run_dir = assertions_dir / run_name[:96]
            run_solver = solver if engine.split()[0] == "smtbmc" and "\n" not in engine else ""
            run_timeout += build_allowance
            project = stage(run_dir, monitor, run_mode, engine, run_solver, run_timeout, sanity_cycles,
                            **({"run_depth": run_depth} if run_depth else {}))
            t_run = time.time()
            result = self._run_sby(project.sby_file, project.work_dir, run_timeout)
            # sby reports whole seconds only; use wall-clock time instead
            result.elapsed_seconds = time.time() - t_run
            if not KEEP_ARTIFACTS:
                # Models and source copies are not needed once the result is
                # parsed; dropping them now bounds disk use during long jobs.
                bulky = [p for p in Path(project.work_dir).rglob("*")
                         if p.is_dir() and p.name in _BULKY_DIRS]
                for path in bulky:
                    clear_inside(path, Path(project.work_dir))
            return project.work_dir, result

        def tracked(task):
            """Run task(run) with its own record of sby runs, so concurrent
            tasks never share state; returns (task result, logs, sby seconds)."""
            runs: list[tuple[str, SbyResult]] = []

            def tracked_run(*args, **kwargs):
                work_dir, result = run(*args, **kwargs)
                runs.append((work_dir, result))
                return work_dir, result

            value = task(tracked_run)
            logs = [
                f"=== {Path(work_dir).name} ===\n{result.engine_output}"
                for work_dir, result in runs if result.engine_output
            ]
            return value, logs, sum(result.elapsed_seconds for _, result in runs)

        def check_sanity(run_fn) -> dict[str, str]:
            """Assumption sanity check (needs the wrapper, so DUT runs only)."""
            _, sanity_result = run_fn(
                f"{project_name}__00_sanity",
                self._isolate(lowered_rtl, None),
                "cover",
                sanity_cycles=sanity_cycles,
            )
            return _classify_sanity(self, sanity_result, sanity_cycles) or \
                {"status": "ERROR", "message": sanity_result.error_message.strip()[-500:]}

        def check_property(index: int, label: str, batch: "_Batch", budget: int = proof_timeout):
            base = f"{project_name}__{index:02d}_{label}"
            check = self._check_cover if label_types.get(label) == "COVER" else self._check_assert
            return lambda run_fn: check(label, base, lowered_rtl, run_fn, depth, full_proof,
                                        budget, batch, bounded_timeout=budget if self.scans else timeout)

        # 2 reset cycles, plus Yosys samples clocked covers one step late
        sanity_cycles = max(1, depth - 4)
        asserts = [l for l in assert_labels if label_types.get(l) != "COVER"]
        covers = [l for l, kind in label_types.items() if kind == "COVER"]   # incl. __pre covers
        if self.only is not None:
            covers = [l for l in covers if l in self.only or l.removesuffix(PRECONDITION_SUFFIX) in self.only
                      or l.removesuffix(WITNESS_SUFFIX) in self.only]
        covers = [l for l in covers if l not in cached and l.removesuffix(PRECONDITION_SUFFIX) not in cached
                  and l.removesuffix(WITNESS_SUFFIX) not in cached]
        if self.on_property is not None:
            for entry in cached.values():
                self.on_property(dict(entry))

        def batch_run(name: str, active: set, run_mode: str, engine: str = "smtbmc",
                      run_timeout: int = timeout, cycles: int = 0):
            def task(run_fn):
                return run_fn(name, self._isolate(lowered_rtl, active), run_mode,
                              engine=engine, run_timeout=run_timeout, sanity_cycles=cycles)
            return task

        # ── Batched runs (chunked, in parallel), then per-property work ──
        t_checks = time.time()
        self._run_labels = {f"{project_name}__{index:02d}_{label}": label
                            for index, label in enumerate(assert_labels, start=1)}
        workers = max(1, min(MAX_PARALLEL_CHECKS, len(assert_labels) + 1))
        pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="formal")
        combined_logs: list[str] = []
        try:
            # 1. Bounded check of every assertion, and every cover / precondition
            #    cover / the sanity cover, in chunks.
            futures = []
            for i, chunk in enumerate(_chunks(asserts, BMC_CHUNK)):
                futures.append(("bmc", pool.submit(tracked, batch_run(
                    f"{project_name}__bmc{i:03d}", set(chunk), "bmc", engine="smtbmc --keep-going",
                    run_timeout=batch_timeout))))
            cover_chunks = _chunks(covers, COVER_CHUNK) or [[]]   # the sanity cover runs in the first
            for i, chunk in enumerate(cover_chunks):
                futures.append(("cover", pool.submit(tracked, batch_run(
                    f"{project_name}__cover{i:03d}", set(chunk), "cover", run_timeout=batch_timeout,
                    cycles=sanity_cycles if i == 0 else 0))))
            batch = _Batch()
            for kind, future in futures:
                run_result, logs, _ = future.result()
                combined_logs += logs
                batch.add(self, kind, run_result)

            # 2. Full proofs of the assertions that passed, in chunks.
            if full_proof:
                passing = [l for l in asserts if (batch.bmc.get(l) or {}).get("status") == "PASS"]
                proof_futures = [
                    (chunk, pool.submit(tracked, batch_run(
                        f"{project_name}__prove{i:03d}", set(chunk), "prove",
                        engine=f"abc --keep-going {PROOF_ENGINE.split()[-1]}", run_timeout=scans[0])))
                    for i, chunk in enumerate(_chunks(passing, PROVE_CHUNK))
                ]
                for chunk, future in proof_futures:
                    (_, prove_result), logs, _ = future.result()
                    combined_logs += logs
                    batch.proven |= _proven_in_chunk(prove_result, chunk)

            sanity = batch.sanity   # from the first cover run, else a run of its own
            if sanity is None:
                sanity, sanity_logs, _ = pool.submit(tracked, check_sanity).result()
                combined_logs += sanity_logs

            # 3. Per property, scan by scan: all undecided properties with the
            #    shortest proof time limit, those still undecided with the next.
            settled_results: dict[str, tuple] = {}
            spent: dict[str, float] = {}
            pending = list(enumerate(assert_labels, start=1))
            for scan, budget in enumerate(scans):
                def settled(entry, last=scan == len(scans) - 1) -> bool:
                    return last or not full_proof or not _inconclusive(entry) \
                        or bool(self.cancel is not None and self.cancel.is_set())

                def notify(future, label, scan=scan, budget=budget, settled=settled, sanity=sanity):
                    if future.cancelled() or future.exception() is not None:
                        return
                    entry, _, seconds = future.result()
                    if settled(entry):
                        if self.on_property is not None:
                            self.on_property(_finalize(_with_witness(dict(entry), batch, label_types), sanity,
                                                       seconds + spent.get(label, 0.0)))
                    elif self.on_progress is not None:
                        self.on_progress(label, budget, scans[scan + 1])

                futures = [(index, label, pool.submit(tracked, check_property(index, label, batch, budget)))
                           for index, label in pending]
                for _, label, future in futures:
                    future.add_done_callback(lambda f, label=label, notify=notify: notify(f, label))
                pending = []
                for index, label, future in futures:
                    entry, logs, seconds = future.result()
                    earlier = settled_results[label][1] if label in settled_results else []
                    spent[label] = spent.get(label, 0.0) + seconds
                    settled_results[label] = (entry, earlier + logs, spent[label])
                    if not settled(entry):
                        pending.append((index, label))
                if not pending:
                    break
            outcomes = [settled_results[label] for label in assert_labels]
        except BaseException:
            # e.g. a staging error in the first project: stop the rest
            pool.shutdown(wait=True, cancel_futures=True)
            raise
        pool.shutdown(wait=True)
        aggregate.sanity = sanity
        aggregate.elapsed_seconds = time.time() - t_checks

        for entry, logs, seconds in outcomes:
            entry = _finalize(_with_witness(entry, batch, label_types), sanity, seconds)
            aggregate.assertion_results.append(entry)
            self._keep_result(entry)
            combined_logs.extend(logs)
        aggregate.assertion_results.extend(cached.values())

        # ── Assertions the lowering could not handle ──
        for label, (kind, reason) in self._unsupported_labels(lowered_rtl).items():
            if self.only is not None and label not in self.only:
                continue
            aggregate.assertion_results.append({
                "name": label, "type": kind,
                "verdict": "ERROR", "status": "ERROR", "verdict_detail": reason,
                "message": reason, "bound": 0, "step": 0, "location": "", "file": "",
                "line": 0, "tracefile": "", "precondition": None,
            })

        for entry in aggregate.assertion_results:
            verdict = entry["verdict"]
            if verdict == "FAIL":
                aggregate.status = "FAIL"
                aggregate.failed_assertions.append({
                    "name": entry["name"],
                    "file": entry.get("file", ""),
                    "line": entry.get("line", 0),
                    "step": entry.get("step", 0),
                    "message": entry.get("message", ""),
                })
                if not aggregate.counterexample_vcd:
                    aggregate.counterexample_vcd = entry.get("counterexample_vcd", "")
            elif verdict in {"ERROR", "TIMEOUT"} and aggregate.status == "PASS":
                aggregate.status = verdict
                aggregate.error_message += (
                    ("\n" if aggregate.error_message else "")
                    + f"{entry['name']}: {entry.get('message', '').strip()}"
                )

        # Nothing failed but something checked nothing: don't report a clean PASS
        if aggregate.status == "PASS" and any(
            e["verdict"] == "VACUOUS" for e in aggregate.assertion_results
        ):
            aggregate.status = "VACUOUS"

        aggregate.depth_reached = depth
        aggregate.engine_output = "\n\n".join(combined_logs)

        if not KEEP_ARTIFACTS:
            shown = {e.get("counterexample_vcd", "") for e in aggregate.assertion_results
                     if e.get("verdict") in {"FAIL", "COVERED"}}
            freed = prune_run_artifacts(parent_dir, {p for p in shown if p})
            logger.info(f"[{project_name}] Removed {freed / 1e6:.1f} MB of solver artifacts")
        return aggregate

    def _check_assert(self, label, base, lowered_rtl, run, depth, full_proof, proof_timeout,
                      batch: Optional["_Batch"] = None, bounded_timeout: Optional[int] = None) -> dict[str, Any]:
        """Bounded check, vacuity check and (optionally) full proof of one assertion.
        Results already found by the batched runs are reused.  bounded_timeout:
        time limit of its own bounded runs (default: the job's)."""
        bounded = {"run_timeout": bounded_timeout} if bounded_timeout else {}
        entry = batch.bmc.get(label) if batch else None
        # In a scan, a property the batched bounded check did not decide goes
        # straight to the proof engines (on a design where every bounded step is
        # slow, a bounded check of the whole depth is the slowest way to an answer):
        #   1. k-induction over a few cycles by every SMT solver installed, racing.
        #      Most properties that hold are inductive at once, and the solvers
        #      differ widely (parity and popcount logic that stops Yices is quick
        #      for Boolector).  A proof by induction holds at every depth.
        #   2. Not inductive there: the whole depth, with PDR in the race; the
        #      base case of the induction is the bounded check.  If the solvers
        #      did not even finish the few cycles, PDR alone gets the time.
        proof_first = bool(entry is None and full_proof and self.scans)
        early_proof = False
        if proof_first:
            monitor = self._isolate(lowered_rtl, label)
            induction, everything = _scan_engines()
            prove_dir, proof = run(f"{base}_prove", monitor, "prove", engine=induction,
                                   run_timeout=proof_timeout, run_depth=min(depth, SCAN_INDUCTION_DEPTH))
            engines_label = SCAN_INDUCTION_LABEL
            if proof.status not in ("PASS", "FAIL"):
                undecided_in_time = proof.raw_status == "UNKNOWN"
                prove_dir, proof = run(f"{base}_prove", monitor, "prove",
                                       engine=everything if undecided_in_time else PROOF_ENGINE,
                                       run_timeout=proof_timeout)
                engines_label = PROOF_ENGINE_LABEL
            entry = self._result_entry(label, "ASSERT", proof, prove_dir)
            if proof.status == "FAIL":
                return self._verdict(entry, "FAIL", f"Counterexample at step {entry['step']}.", engine=engines_label)
            if proof.status == "ERROR":                  # the tools failed: not a result about the design
                return self._verdict(entry, "ERROR", _run_error(proof))
            entry["message"] = ""
            if proof.status == "PASS":
                early_proof = True
                entry["status"], entry["engine"] = "PASS", engines_label
            elif proof.raw_status == "UNKNOWN":
                entry["status"] = "PASS"            # its base case covered the depth: no counterexample there
            else:
                entry["status"] = "TIMEOUT"
        if entry is None:
            work_dir, bmc = run(base, self._isolate(lowered_rtl, label), "bmc", **bounded)
            entry = self._result_entry(label, "ASSERT", bmc, work_dir)
        elif not early_proof:
            entry = dict(entry)
        if entry["status"] == "FAIL":
            return self._verdict(entry, "FAIL", f"Counterexample at step {entry['step']}.")
        # In a scan, a bounded check that ran out of time is not the end: the
        # proof engines do not need it (a proof holds at every depth, and PDR
        # finds counterexamples too), so they still get this scan's time.
        bounded_open = bool(entry["status"] == "TIMEOUT" and full_proof and self.scans)
        if entry["status"] in {"ERROR", "TIMEOUT"} and not bounded_open:
            return self._verdict(entry, entry["status"], entry.get("message", ""))
        if bounded_open:
            entry["message"] = ""

        # Vacuity: can the property's antecedent match at all?
        pre_label = label + PRECONDITION_SUFFIX
        precondition = None
        if self._has_label(lowered_rtl, pre_label):
            pre_entry = batch.cover.get(pre_label) if batch else None
            if pre_entry is None:
                _, pre = run(f"{base}_pre", self._isolate(lowered_rtl, pre_label), "cover", **bounded)
                if pre.status == "ERROR":                # not "not reached": the check did not run
                    return self._verdict(entry, "ERROR", _run_error(pre))
                pre_entry = self._select(pre, pre_label)
            if pre_entry and pre_entry["status"] == "PASS":
                precondition = {"status": "REACHED", "step": pre_entry.get("step", 0)}
            elif full_proof:
                _, pre_proof = run(
                    f"{base}_pre_prove", self._isolate(lowered_rtl, pre_label, as_assert=True),
                    "prove", engine=PROOF_ENGINES, run_timeout=proof_timeout,
                )
                if pre_proof.status == "ERROR":
                    return self._verdict(entry, "ERROR", _run_error(pre_proof))
                proven = pre_proof.status == "PASS"
                precondition = {"status": "UNREACHABLE" if proven else "NOT_REACHED", "step": 0}
            else:
                precondition = {"status": "NOT_REACHED", "step": 0}
        entry["precondition"] = precondition

        if precondition and precondition["status"] == "UNREACHABLE":
            return self._verdict(entry, "VACUOUS", "The antecedent can never match (proven), so this assertion checks nothing.",
                                 engine=PROOF_ENGINE_LABEL)

        proven = early_proof or bool(batch and label in batch.proven)
        if full_proof and not proven and not proof_first:      # (proof_first: it had its run above)
            prove_dir, proof = run(
                f"{base}_prove", self._isolate(lowered_rtl, label), "prove",
                engine=PROOF_ENGINES, run_timeout=proof_timeout,
            )
            if proof.status == "FAIL":
                entry = self._result_entry(label, "ASSERT", proof, prove_dir, precondition)
                return self._verdict(entry, "FAIL", f"Counterexample beyond the BMC depth (step {entry['step']}).",
                                     engine=PROOF_ENGINE_LABEL)
            proven = proof.status == "PASS"

        live_detail = ""
        live_parts = self._live_parts(lowered_rtl, label)
        if live_parts and shutil.which("suprove") is None:
            live_detail = " Liveness part not checked (the suprove engine is not installed)."
            live_parts_to_run = []
        else:
            live_parts_to_run = live_parts
        for i, (live_label, witness_label) in enumerate(live_parts_to_run):
            fair_label = live_label.replace(LIVE_INFIX, LIVE_FAIR_INFIX)     # its own fairness, if any
            _, live = run(f"{base}_live{i}", self._isolate(lowered_rtl, {live_label, fair_label}), "live",
                          engine=LIVE_ENGINE, run_timeout=proof_timeout)
            if live.status == "FAIL":
                # suprove gives no trace; draw one: the obligation still pending
                # after most of the depth
                cycles = max(1, depth - 6)
                monitor = f"`define {WITNESS_MACRO} {cycles}\n" + self._isolate(lowered_rtl, witness_label)
                wit_dir, wit = run(f"{base}_livewit{i}", monitor, "cover")
                shown = self._result_entry(witness_label, "COVER", wit, wit_dir)
                for key in ("counterexample_vcd", "tracefile", "step", "log_paths", "project_dir"):
                    entry[key] = shown.get(key, entry.get(key))
                entry["trace_kind"] = "LIVE"
                entry["live_index"] = i
                if self._has_label(lowered_rtl, fair_label):          # s_eventually always p
                    detail = ("Liveness violation: p can fail again and again, forever (proven). "
                              + ("The waveform shows it failing twice after the attempt started."
                                 if entry.get("counterexample_vcd") else
                                 "No waveform: no example of two failures within the depth."))
                else:
                    detail = ("Liveness violation: an obligation can stay pending forever (proven). "
                              + (f"The waveform shows it still pending {cycles} cycles after it started."
                                 if entry.get("counterexample_vcd") else
                                 f"No waveform: no example of it pending {cycles} cycles within the depth."))
                return self._verdict(entry, "FAIL", detail, engine=LIVE_ENGINE)
            if live.status != "PASS":
                why = "timed out" if live.status == "TIMEOUT" else f"ended with {live.status}"
                live_detail = f" Liveness part not proven (suprove {why})."
        if live_parts and not live_detail:
            live_detail = " Liveness part proven (suprove)."

        if precondition and precondition["status"] == "NOT_REACHED":
            # (whether it holds at every depth all the same: a case of a split that
            # does not occur within the depth is still a proven case)
            entry["safety_proven"] = bool(proven and (not live_parts or live_detail == " Liveness part proven (suprove)."))
            return self._verdict(
                entry, "VACUOUS",
                f"The antecedent never matches within {depth} cycles, so this assertion checked nothing.",
                bound=depth,
            )
        live_proven = not live_parts or live_detail == " Liveness part proven (suprove)."
        if proven and live_proven:
            return self._verdict(entry, "PROVEN", "Holds for all reachable states (full proof)." + live_detail,
                                 engine=(entry.get("engine") if early_proof else "") or
                                        PROOF_ENGINE_LABEL + (f" + {LIVE_ENGINE}" if live_parts else ""))
        if bounded_open and not proven:
            return self._verdict(entry, "TIMEOUT", f"The proof engines did not decide it within {proof_timeout} seconds."
                                 if proof_first else
                                 f"Neither the bounded check ({depth} cycles) nor the full proof "
                                 f"finished within {bounded_timeout} seconds.")
        detail = f"No counterexample within {depth} cycles"
        if proven:
            detail = "Safety part proven."
        else:
            detail += "; full proof inconclusive." if full_proof else " (bounded check only)."
        return self._verdict(entry, "HOLDS_BOUNDED", detail + live_detail, bound=depth)

    def _check_cover(self, label, base, lowered_rtl, run, depth, full_proof, proof_timeout,
                     batch: Optional["_Batch"] = None, bounded_timeout: Optional[int] = None) -> dict[str, Any]:
        """Bounded search for a cover; optionally prove it unreachable."""
        bounded = {"run_timeout": bounded_timeout} if bounded_timeout else {}
        entry = batch.cover.get(label) if batch else None
        if entry is None:
            work_dir, cover = run(base, self._isolate(lowered_rtl, label), "cover", **bounded)
            entry = self._result_entry(label, "COVER", cover, work_dir)
            run_status, run_error = cover.status, cover.error_message
        else:
            entry = dict(entry)
            run_status, run_error = ("PASS" if entry["status"] == "PASS" else "FAIL"), ""
        if entry["status"] == "PASS":
            return self._verdict(entry, "COVERED", f"Reached at step {entry['step']}.")
        if entry["status"] in {"ERROR", "TIMEOUT"} or run_status not in {"FAIL", "PASS"}:
            return self._verdict(entry, entry["status"] if entry["status"] in {"ERROR", "TIMEOUT"} else "ERROR",
                                 entry.get("message", "") or run_error)
        if full_proof:
            _, proof = run(
                f"{base}_prove", self._isolate(lowered_rtl, label, as_assert=True),
                "prove", engine=PROOF_ENGINES, run_timeout=proof_timeout,
            )
            if proof.status == "PASS":
                return self._verdict(entry, "UNREACHABLE", "Can never be reached (proven).", engine=PROOF_ENGINE_LABEL)
            if proof.status == "FAIL":
                return self._verdict(entry, "COVERED", f"Reachable, but only after more than {depth} cycles.",
                                     engine=PROOF_ENGINE_LABEL)
        return self._verdict(entry, "NOT_REACHED", f"Not reached within {depth} cycles.", bound=depth)

    def _cached_results(self, labels: list[str], job_dir: Path) -> dict[str, dict]:
        """{label: result} of the properties whose result the cache already has
        (their traces written into this job's folder)."""
        found = {}
        for label in labels:
            key = self._cache_keys.get(label)
            try:
                hit = self.cache.get(key) if key else None
            except Exception:
                logger.exception("result cache read failed")
                hit = None
            if hit is None:
                continue
            entry, trace = dict(hit[0]), hit[1]
            entry.update(cached=True, elapsed_seconds=0.0, project_dir="", log_paths={}, counterexample_vcd="")
            if trace:
                path = job_dir / "cached" / f"{label[:80]}.vcd"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(trace)
                entry["counterexample_vcd"] = str(path)
            found[label] = entry
        return found

    def _keep_result(self, entry: dict) -> None:
        """Keep a decided result (with its trace) for later runs."""
        key = self._cache_keys.get(entry.get("name", ""))
        if self.cache is None or not key or entry.get("cached"):
            return
        from app.praman.services.result_cache import DECIDED
        if entry.get("verdict") not in DECIDED or entry.get("status") == "ERROR":
            return
        trace = None
        vcd = entry.get("counterexample_vcd") or ""
        if vcd and os.path.exists(vcd):
            trace = Path(vcd).read_bytes()
        kept = {k: v for k, v in entry.items() if k not in ("project_dir", "log_paths", "counterexample_vcd",
                                                            "tracefile", "elapsed_seconds")}
        try:
            self.cache.put(key, kept, trace)
        except Exception:
            logger.exception("result cache write failed")

    @staticmethod
    def _verdict(entry: dict[str, Any], verdict: str, detail: str, bound: int = 0,
                 engine: str = "") -> dict[str, Any]:
        entry["verdict"] = verdict
        entry["verdict_detail"] = detail
        entry["bound"] = bound
        entry["engine"] = engine or entry.get("engine", "")
        return entry

    def _result_entry(self, label: str, kind: str, result: SbyResult, work_dir: str,
                      precondition: Optional[dict] = None) -> dict[str, Any]:
        """Per-property result dict for `label` out of one SymbiYosys run."""
        selected = self._select(result, label)
        if not selected:
            selected = {
                "name": label,
                "status": result.status if result.status in {"PASS", "FAIL", "ERROR", "TIMEOUT"} else "ERROR",
                "type": kind,
                "location": "",
                "file": "",
                "line": 0,
                "step": 0,
                "message": result.error_message,
                "tracefile": "",
            }
        selected = dict(selected)
        selected["name"] = label
        selected["type"] = kind
        selected["project_dir"] = work_dir
        # Only a failed assertion or a reached cover has a trace, and it must
        # be this property's own: a batched run writes one per property
        # (engine_0/traceN.vcd), so the run-level trace may belong to another.
        has_trace = selected.get("status") == ("FAIL" if kind == "ASSERT" else "PASS")
        task_dir = result.log_paths.get("task_dir", "")
        tracefile = selected.get("tracefile", "")
        own_trace = os.path.join(task_dir, tracefile) if task_dir and tracefile else ""
        if not has_trace:
            selected["counterexample_vcd"] = ""
        elif own_trace and os.path.exists(own_trace):
            selected["counterexample_vcd"] = own_trace
        else:
            # Single-property run without a JUnit tracefile entry
            selected["counterexample_vcd"] = result.counterexample_vcd
        selected["log_paths"] = result.log_paths
        selected["precondition"] = precondition
        return selected

    @staticmethod
    def _select(result: SbyResult, label: str) -> Optional[dict[str, Any]]:
        """Find `label` in a run's results; JUnit names may be hierarchical
        (formal_wrapper.u_monitor.<label>)."""
        return next(
            (a for a in result.assertion_results
             if a["name"] == label or a["name"].endswith(f".{label}")),
            None,
        )

    # ── Lowered-monitor helpers ───────────────────────────
    #
    # Lowered statements look like "<label>: assert(...);" / "<label>: cover(...);",
    # either on their own line or after an "if (...)".

    _STATEMENT_RE = re.compile(r'(?<![\w.$])(\w+)\s*:\s*(assert|cover|assume)\s*(property\s*)?\(')
    # Statements the compiler adds for liveness: <label>__live<i> / <label>__lwit<i> / <label>__lfair<i>
    _LIVE_PART_RE = re.compile(rf'^(\w+?)(?:{LIVE_INFIX}|{WITNESS_INFIX}|{LIVE_FAIR_INFIX})\d+$')

    def _statements(self, lowered_rtl: str) -> list[tuple[str, str, int, int]]:
        """(label, kind, start, end) for every assert/cover statement, where
        [start, end) spans "<label>: kind(...);" with balanced parentheses."""
        found = []
        for m in self._STATEMENT_RE.finditer(lowered_rtl):
            depth, i = 1, m.end()
            while i < len(lowered_rtl) and depth:
                depth += {"(": 1, ")": -1}.get(lowered_rtl[i], 0)
                i += 1
            semi = re.match(r'\s*;', lowered_rtl[i:])
            end = i + semi.end() if semi else i
            if m.group(3):
                # "property" statements: the compiler's liveness assertions and the
                # fairness only they use (other assumptions always stay)
                if m.group(2) == "assert" and LIVE_INFIX in m.group(1):
                    kind = "live"
                elif m.group(2) == "assume" and LIVE_FAIR_INFIX in m.group(1):
                    kind = "fair"
                else:
                    continue
            elif m.group(2) == "assume":
                continue
            else:
                kind = m.group(2)
            found.append((m.group(1), kind, m.start(), end))
        return found

    def _live_parts(self, lowered_rtl: str, label: str) -> list[tuple[str, str]]:
        """(liveness assertion, witness cover) labels of `label`."""
        names = {l for l, _, _, _ in self._statements(lowered_rtl)}
        parts = []
        for i in itertools.count():
            live = f"{label}{LIVE_INFIX}{i}"
            if live not in names:
                return parts
            parts.append((live, f"{label}{WITNESS_INFIX}{i}"))
        return parts

    def _extract_lowered_assert_labels(self, lowered_rtl: str) -> list[str]:
        """Labels of all lowered assert/cover statements (in order), excluding
        precondition covers."""
        labels: list[str] = []
        for label, _, _, _ in self._statements(lowered_rtl):
            if not label.endswith((PRECONDITION_SUFFIX, WITNESS_SUFFIX)) and not self._LIVE_PART_RE.match(label) \
                    and label not in labels:
                labels.append(label)
        return labels

    def _label_type_map(self, lowered_rtl: str) -> dict[str, str]:
        """Return a mapping of label -> 'ASSERT' | 'COVER' from the lowered RTL."""
        return {label: kind.upper() for label, kind, _, _ in self._statements(lowered_rtl)
                if not self._LIVE_PART_RE.match(label)}

    def _has_label(self, lowered_rtl: str, label: str) -> bool:
        return any(l == label for l, _, _, _ in self._statements(lowered_rtl))

    def _isolate(self, lowered_rtl: str, active_label, as_assert: bool = False) -> "IsolatedMonitor":
        """Disable every assert/cover except `active_label` (a label or a set
        of labels; assumptions stay).

        With as_assert, the active cover becomes "assert(0)" so a proof
        engine can show it is unreachable.
        """
        out, pos = [], 0
        active = active_label if isinstance(active_label, set) else {active_label}
        for label, kind, start, end in self._statements(lowered_rtl):
            out.append(lowered_rtl[pos:start])
            if label not in active:
                out.append(f"begin end /* disabled {kind} {label} */")
            elif as_assert and kind == "cover":
                out.append(f"{label}: assert(0);")
            else:
                out.append(lowered_rtl[start:end])
            pos = end
        out.append(lowered_rtl[pos:])
        return IsolatedMonitor("".join(out), active=frozenset(active), as_assert=as_assert)

    def _unsupported_labels(self, lowered_rtl: str) -> dict[str, tuple[str, str]]:
        """Assertions the lowering recorded as unsupported: {label: (TYPE, reason)}."""
        return {
            m.group(1): (m.group(2).upper(), m.group(3).strip())
            for m in re.finditer(rf'//\s*{UNSUPPORTED_MARKER}\s+(\w+)\s+(\w+):\s*(.*)', lowered_rtl)
        }

    # ── Lower Only (no sby execution) ─────────────────────

    def lower_only(self, sva_code: str, dut_code: str = "") -> dict:
        """Compile the SVA into monitors without running formal (for inspection)."""
        return run_isolated(_lower_only, sva_code, dut_code)

    # ── Health Check ──────────────────────────────────────

    def health(self) -> dict:
        """Check formal verification subsystem health."""
        return {
            "sby": ("available" if not sby_environment()[1] else "broken") if self.sby_available else "not_installed",
            "sby_problem": sby_environment()[1] if self.sby_available else "",
            "yosys": "available" if self.yosys_available else "not_installed",
            "sby_path": shutil.which("sby") or "",
            "yosys_path": shutil.which("yosys") or "",
            "work_dir": str(FORMAL_WORK_DIR),
            "active_jobs": sum(1 for j in _jobs.values() if j.status in ("queued", "lowering", "proving")),
            "total_jobs": len(_jobs),
        }


_BULKY_FILE_SUFFIXES = (".yw", ".aiw", ".smtc", "_tb.v")
_BULKY_DIRS = {"model", "src"}


def prune_run_artifacts(job_dir: Path, keep_traces: set[str]) -> int:
    """Delete solver models, source copies, witness files and traces that
    are not shown in the UI; keep logs, status and the `keep_traces` VCDs.
    Returns the number of bytes freed."""
    keep = {os.path.realpath(p) for p in keep_traces}
    freed = 0
    for root, dirs, files in os.walk(job_dir):
        for d in [d for d in dirs if d in _BULKY_DIRS]:
            path = os.path.join(root, d)
            freed += _tree_size(path)
            clear_inside(Path(path), Path(job_dir))
            dirs.remove(d)
        for f in files:
            path = os.path.join(root, f)
            unwanted_trace = f.endswith(".vcd") and os.path.realpath(path) not in keep
            if f.endswith(_BULKY_FILE_SUFFIXES) or unwanted_trace:
                try:
                    freed += os.path.getsize(path)
                    os.remove(path)
                except OSError:
                    pass
    return freed


SCAN_INDUCTION_DEPTH = 2            # cycles of the first, quick k-induction of a scan
SCAN_INDUCTION_LABEL = "k-induction"


def _scan_engines() -> tuple[str, str]:
    """(k-induction engines, all proof engines) of a scan: Yices and the other
    SMT solvers that are installed, one sby engine each (they race)."""
    induction = ["smtbmc yices"] + [f"smtbmc {s}" for s in ("boolector", "bitwuzla") if shutil.which(s)]
    return "\n".join(induction), "\n".join([PROOF_ENGINE, *induction])


def _inconclusive(entry: dict) -> bool:
    """A bounded check or a full proof did not finish within the time limit
    of its scan: a longer one may decide the property."""
    verdict = entry.get("verdict")
    if verdict in ("HOLDS_BOUNDED", "NOT_REACHED", "TIMEOUT"):
        return True
    return verdict == "VACUOUS" and (entry.get("precondition") or {}).get("status") == "NOT_REACHED"


def _with_witness(entry: dict, batch: "_Batch", label_types: dict[str, str]) -> dict:
    """The witness cover of an assertion (WITNESS_SUFFIX, present with
    witness_covers), from the batched cover run: entry["witness"] =
    {status: REACHED | UNREACHABLE | NOT_REACHED, step}."""
    if entry.get("type") == "COVER":
        return entry
    # An assertion decided before its vacuity check (a counterexample, a time
    # limit): the batched cover run may still know that its antecedent matched.
    pre = batch.cover.get(entry.get("name", "") + PRECONDITION_SUFFIX)
    if not entry.get("precondition") and pre and pre.get("status") == "PASS":
        entry["precondition"] = {"status": "REACHED", "step": pre.get("step", 0)}
    label = entry.get("name", "") + WITNESS_SUFFIX
    if label_types.get(label) != "COVER":
        return entry
    found = batch.cover.get(label)
    if found and found.get("status") == "PASS":
        entry["witness"] = {"status": "REACHED", "step": found.get("step", 0)}
    elif (entry.get("precondition") or {}).get("status") == "UNREACHABLE":
        entry["witness"] = {"status": "UNREACHABLE", "step": 0}     # no match of the antecedent, no pass
    else:
        entry["witness"] = {"status": "NOT_REACHED", "step": 0}
    return entry


ABSTRACT_KINDS = ("init:", "counter:")
DROP_COVERS = "dropcov:"              # check_cov per instance: Praman's covers of this instance are removed


def design_edits(top: str, cut: list[str], without: list[str] = ()) -> list[str]:
    """Yosys commands (after prep) changing the design as the user asked:
      cut      signals cut (stopat): each is driven by a free value ($anyseq)
               instead of its logic, any value in any cycle.  The design is
               flattened, so a signal below the top is named by its path.
               Entries "init:<reg>" and "counter:<reg>" are abstractions
               (abstract -init_value / -counter): the register starts from
               any value after reset, or may jump to any value in any cycle.
      without  assumptions left out (assume -disable), by label.
    A name that matches nothing is an error, never silently ignored: an
    assumption that stayed would make proofs pass that should not."""
    if not cut and not without:
        return []
    out = ["flatten"]
    abstract = [c for c in cut if c.startswith(ABSTRACT_KINDS)]
    dropped = [c.split(":", 1)[1] for c in cut if c.startswith(DROP_COVERS)]
    cut = [c for c in cut if not c.startswith(ABSTRACT_KINDS) and not c.startswith(DROP_COVERS)]
    for instance in dropped:
        # coverage of one instance at a time: the covers Praman put into the others go
        # (the pipeline moves them into the instance's monitor: u_b.__va_mon.__pm_cov_1; a proof
        # that one is unreachable checks it as an assertion)
        out.append(f"chformal -cover -assert -remove {top}/n:{instance}.__pm_* {top}/n:{instance}.__va_mon.__pm_*")
    for n, entry in enumerate(abstract):
        kind, signal = entry.split(":", 1)
        out += [f"select -assert-count 1 {top}/w:{signal}",
                f"select -assert-min 1 {top}/w:{signal} %ci1 {top}/t:*ff* %i"]   # a register, or nothing changes
        if kind == "init":
            # free while the reset is held: after it, the register holds any value
            out.append(f"abstract -state -enable {IN_RESET_NET} {top}/w:{signal}")
        else:
            # a counter: any cycle it may jump to any value, otherwise it counts as written
            jump = f"__pm_jump_{n}"
            out += [f"add -wire {jump} 1 {top}", f"cutpoint {top}/w:{jump}",
                    f"abstract -state -enable {jump} {top}/w:{signal}"]
    if cut:
        out += [f"select -assert-count 1 {top}/w:{signal}" for signal in cut]
        out.append("cutpoint " + " ".join(f"{top}/w:{signal}" for signal in cut))
    for label in without:
        out.append(f"select -assert-min 1 {top}/n:{label} {top}/n:*.{label}")
    if without:
        out.append("chformal -assume -remove " + " ".join(f"{top}/n:{l} {top}/n:*.{l}" for l in without))
    return [*out, "opt_clean"]


def check_cut(prepared, signals: list[str], timeout: int = 300, registers: bool = False) -> Optional[str]:
    """None if every signal can be cut (stopat), else which cannot.
    registers: each must also be the output of a register (abstract)."""
    import tempfile
    from app.praman.services.sby_generator import sanitize_filename
    from app.praman.services.yosys_reader import read_commands
    with tempfile.TemporaryDirectory(prefix="pm_cut_") as tmp:
        files = prepared.sources(0)
        files[MONITOR_FILE] = prepared.monitor_text
        names = []
        for name, text in files.items():
            clean = sanitize_filename(name)
            (Path(tmp) / clean).write_text(text)
            names.append(clean)
        for signal in signals:
            script = "; ".join([*read_commands(names, prepared.top, prepared.reader), *(prepared.script or []),
                                f"prep -top {prepared.top}", "flatten",
                                f"select -assert-count 1 {prepared.top}/w:{signal}",
                                *([f"select -assert-min 1 {prepared.top}/w:{signal} %ci1 {prepared.top}/t:*ff* %i"]
                                  if registers else [])])
            done = run_tree(["yosys", "-q", "-p", script], timeout=timeout, cwd=tmp)
            if done.returncode != 0:
                return signal
    return None


def cone_inputs(prepared, label: str, cut: list[str] = (), timeout: int = 300) -> Optional[set[str]]:
    """The inputs of the top module in the cone of influence of property
    `label` (through any number of cells and registers, after the design
    edits `cut`): the only inputs whose values can change whether it fails.
    None when the cone cannot be computed."""
    import tempfile
    from app.praman.services.sby_generator import sanitize_filename
    from app.praman.services.yosys_reader import read_commands
    top = prepared.top
    with tempfile.TemporaryDirectory(prefix="pm_coi_") as tmp:
        files = prepared.sources(0)
        files[MONITOR_FILE] = prepared.monitor_text
        names = []
        for name, text in files.items():
            clean = sanitize_filename(name)
            (Path(tmp) / clean).write_text(text)
            names.append(clean)
        edits = [e for e in design_edits(top, list(cut)) if e != "opt_clean"] or ["flatten"]
        script = "; ".join([*read_commands(names, top, prepared.reader), *(prepared.script or []),
                            f"prep -top {top}", *edits,
                            f"select -assert-min 1 {top}/c:{label} {top}/c:*.{label} %u",
                            f"select -list {top}/c:{label} {top}/c:*.{label} %u %ci* {top}/i:* %i"])
        done = run_tree(["yosys", "-p", script], timeout=timeout, cwd=tmp)
        if done.returncode != 0:
            return None
    return {line.split("/", 1)[1].strip() for line in done.stdout.splitlines()
            if line.startswith(f"{top}/") and "/" in line}


class IsolatedMonitor(str):
    """The text of an isolated monitor (FormalService._isolate), remembering
    which statements it keeps active: a run can then start from the model
    built once with every statement (SharedModel) instead of reading the
    sources again."""
    active: frozenset
    as_assert: bool

    def __new__(cls, text: str, active: frozenset = frozenset(), as_assert: bool = False):
        obj = super().__new__(cls, text)
        obj.active, obj.as_assert = active, as_assert
        return obj


# FORMAL_REUSE_MODEL=0 reads the sources in every run, as before
REUSE_MODEL = os.environ.get("FORMAL_REUSE_MODEL", "1") != "0"
SHARED_MODEL_FILE = "va_model.il"


class SharedModel:
    """The design with every monitor statement, read and prepared by Yosys
    once per job.  A run whose monitor is a plain isolation starts from it and
    removes the assertions and covers it does not check (chformal -remove;
    assumptions are never removed), instead of reading the SystemVerilog
    again - on large designs that is most of a short run.  Removing a check
    cannot change what the design can do, so the result is the same."""

    def __init__(self, prepared, lowered: str, work_dir: Path, timeout: int, cancel=None, cut=None):
        self.prepared, self.lowered, self.work_dir = prepared, lowered, work_dir
        self.cut = list(cut or [])
        self.timeout, self.cancel = timeout, cancel
        self._lock = threading.Lock()
        self._text: Optional[str] = None
        self._names: Optional[set[str]] = None
        self._failed = False

    def text(self) -> Optional[str]:
        """The RTLIL of the model (built on first use); None if it cannot be built."""
        with self._lock:
            if self._text is None and not self._failed:
                try:
                    self._text = self._build()
                except Exception as e:                  # the runs read the sources instead
                    logger.warning(f"shared model not built, each run reads the sources: {e}")
                    self._failed = True
            return self._text

    def _build(self) -> str:
        from app.praman.services.sby_generator import sanitize_filename
        from app.praman.services.yosys_reader import read_commands
        prepared = self.prepared
        src = self.work_dir / "shared_model"
        clear_inside(src, FORMAL_WORK_DIR)
        src.mkdir(parents=True)
        files = prepared.sources(0)
        files[MONITOR_FILE] = self.lowered
        names = []
        for name, text in files.items():
            clean = sanitize_filename(name)
            (src / clean).write_text(text)
            names.append(clean)
        script = "; ".join([*read_commands(names, prepared.top, prepared.reader), *(prepared.script or []),
                            f"prep -top {prepared.top}", *self.cut, f"write_rtlil {SHARED_MODEL_FILE}"])
        done = run_tree(["yosys", "-q", "-p", script], timeout=self.timeout, cancel=self.cancel, cwd=str(src))
        model = src / SHARED_MODEL_FILE
        if done.returncode != 0 or not model.exists():
            raise RuntimeError((done.stderr or done.stdout or "yosys failed").strip()[-300:])
        text = model.read_text()
        if not KEEP_ARTIFACTS:
            clear_inside(src, FORMAL_WORK_DIR)
        return text

    _CHECK_CELL = re.compile(r"^\s*cell \$(?:check|assert|cover|live|fair) \\?(\S+)", re.M)

    def has_checks(self, active) -> bool:
        """Every check a run keeps is in the model under its name (a flattened
        design names them `<instance>.<label>`).  Otherwise the run reads the
        sources: removing a check it meant to keep would prove it vacuously."""
        if self._text is None:
            return False
        if self._names is None:
            self._names = set(self._CHECK_CELL.findall(self._text))
        labels = [label for label in active if label]
        return bool(labels) and all(any(n == label or n.endswith("." + label) for n in self._names)
                                    for label in labels)

    @staticmethod
    def keep_only(active) -> list[str]:
        """Yosys commands removing every assertion, cover and liveness check
        not in `active` (assumptions stay).  A label matches its cell with or
        without the instance prefix flattening gives it."""
        keep = sorted(label for label in active if label)
        return ["select -none",
                "select -add t:$check t:$assert t:$cover t:$live t:$fair",
                *([f"select -del {' '.join(f'n:{label} n:*.{label}' for label in keep)}"] if keep else []),
                "chformal -assert -cover -live -fair -remove %",
                "select -clear"]


def _finalize(entry: dict, sanity: dict, seconds: float) -> dict:
    """A property's result as reported: vacuous when the assumptions are
    contradictory, with the legacy status and the time its own runs took."""
    if (entry["type"] != "COVER" and sanity["status"] == "OVERCONSTRAINED"
            and entry["verdict"] in {"PROVEN", "HOLDS_BOUNDED"}):
        entry["verdict"] = "VACUOUS"
        entry["verdict_detail"] = sanity["message"]
    entry["status"] = LEGACY_STATUS[entry["verdict"]]
    entry["elapsed_seconds"] = round(seconds, 2)
    return entry


def prune_old_jobs(work_dir: Path, days: float) -> None:
    """Delete job folders not modified for `days` days."""
    if days <= 0 or not work_dir.exists():
        return
    cutoff = time.time() - days * 86400
    jobs_dir = work_dir / "queue" / "jobs"
    old = [e for e in jobs_dir.iterdir()] if jobs_dir.exists() else []      # proof jobs' events and results
    for entry in [*work_dir.iterdir(), *old]:
        if entry.name == "queue":                 # the queue itself stays; its old jobs go
            continue
        try:
            if entry.is_dir() and entry.stat().st_mtime < cutoff:
                clear_inside(entry, Path(work_dir))
                logger.info(f"Removed job folder older than {days:g} days: {entry.name}")
        except OSError:
            continue


def _tree_size(path: str) -> int:
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _run_error(result: SbyResult) -> str:
    """Why a run failed (the tools, not the design), for the property's detail."""
    lines = [l.strip() for l in (result.error_message or "").strip().splitlines() if l.strip()]
    errors = [re.sub(r"^.*?\bERROR:\s*", "", l) for l in lines if re.search(r"\bERROR:", l)]
    why = (errors or lines or ["the proof tools failed"])[-1].rstrip(".")
    return f"The check could not be run: {why}."


@dataclass
class _Batch:
    """Results of the batched runs, by label; a missing label means the
    property is checked in its own run instead."""
    bmc: dict[str, dict] = field(default_factory=dict)
    cover: dict[str, dict] = field(default_factory=dict)
    proven: set[str] = field(default_factory=set)
    sanity: Optional[dict] = None

    def add(self, service: "FormalService", kind: str, run) -> None:
        """Record the per-property results of one batched bmc/cover run."""
        if run is None:
            return
        work_dir, result = run
        if result.status not in {"PASS", "FAIL"}:     # ERROR/TIMEOUT: fall back per property
            return
        wanted = "ASSERT" if kind == "bmc" else "COVER"
        target = self.bmc if kind == "bmc" else self.cover
        for a in result.assertion_results:
            label = a["name"].split(".")[-1]
            if label == SANITY_COVER_LABEL:
                continue
            if a.get("type") == wanted and a["status"] in {"PASS", "FAIL"}:
                target[label] = service._result_entry(label, wanted, _only(result, a), work_dir)
        if kind == "cover" and self.sanity is None:
            self.sanity = _classify_sanity(service, result, None)


def _chunks(labels: list[str], size: int) -> list[list[str]]:
    return [labels[i:i + size] for i in range(0, len(labels), size)]


_ABC_SUMMARY = re.compile(r"Properties:\s+All = (\d+)\.\s+Proved = (\d+)\.\s+Disproved = (\d+)\.\s+Undecided = (\d+)")
_FAILED_ASSERTION = re.compile(r"failed assertion [\w.$\\]*?(\w+) at ")


def _proven_in_chunk(result: SbyResult, chunk: list[str]) -> set[str]:
    """Labels of a keep-going proof chunk that were proven.  Only when the
    engine decided every property; otherwise none (they are re-proved alone)."""
    text = (result.detailed_logs.get("engine_log", "") or "") + "\n" + (result.engine_output or "")
    summary = _ABC_SUMMARY.search(text)
    if result.status not in {"PASS", "FAIL"} or summary is None or int(summary.group(4)) != 0:
        return set()
    if result.status == "PASS":
        return set(chunk)
    failed = set(_FAILED_ASSERTION.findall(text))
    return set(chunk) - failed


def _only(result: SbyResult, assertion: dict) -> SbyResult:
    """A view of a batched result that contains a single property."""
    view = SbyResult(status=assertion["status"], log_paths=result.log_paths,
                     counterexample_vcd=result.counterexample_vcd)
    view.assertion_results = [assertion]
    return view


def _classify_sanity(service: "FormalService", result: SbyResult, cycles: Optional[int]) -> Optional[dict]:
    """Sanity verdict from a cover run that included the sanity cover."""
    entry = service._select(result, SANITY_COVER_LABEL)
    if entry is None:
        return None
    if entry["status"] == "PASS":
        return {"status": "OK", "message": "Design runs the whole BMC depth after reset under all assumptions."}
    return {
        "status": "OVERCONSTRAINED",
        "message": ("The assumptions stop the design from running the whole BMC depth after reset. "
                    "Assertions that pass are vacuous; check the assume properties for contradictions."),
    }


async def run_formal_async(
    sva_code: str,
    dut_code: str = "",
    dut_filename: str = "dut.sv",
    dut_top: str = "",
    mode: str = "bmc",
    depth: int = 20,
    solver: str = "",
    timeout: int = 300,
    project_name: str = "",
    reset_signal: str = "",
    reset_polarity: str = "auto",
    clock_signal: str = "",
    auto_checks: bool = False,
    engine: str = "sby",
) -> FormalJob:
    """
    Run formal verification in a background thread (non-blocking).
    Returns the job immediately; poll status via get_job().
    """
    job_id = project_name or f"formal_{uuid.uuid4().hex[:8]}"

    # Create job entry immediately
    job = FormalJob(
        job_id=job_id,
        status="queued",
        created_at=datetime.now().isoformat(),
        sva_code=sva_code,
        dut_code=dut_code,
        dut_filename=dut_filename,
        mode=mode,
        depth=depth,
        solver=solver,
        timeout=timeout,
        dut_top=dut_top,
        reset_signal=reset_signal,
        reset_polarity=reset_polarity,
        clock_signal=clock_signal,
        auto_checks=auto_checks,
        engine=engine,
    )
    remember_job(job)

    # Start in the thread pool and return at once; callers poll get_job().
    # (Awaiting here made HTTP requests last as long as the whole job, so a
    # proxy timeout could cut them off while the job kept running.)
    loop = asyncio.get_running_loop()
    future = loop.run_in_executor(None, lambda: _run_formal_sync(job))
    _background.add(future)
    future.add_done_callback(_background_done)

    return job


# Jobs started by run_formal_async; referenced until done so they are not
# garbage-collected.
_background: set = set()


def _background_done(future) -> None:
    _background.discard(future)
    if not future.cancelled() and future.exception() is not None:
        logger.error("Background formal job crashed", exc_info=future.exception())


def _run_formal_sync(job: FormalJob):
    """Synchronous formal execution (called from thread pool)."""
    service = formal_service
    result_job = service.run_formal(
        sva_code=job.sva_code,
        dut_code=job.dut_code,
        dut_filename=job.dut_filename,
        dut_top=job.dut_top,
        mode=job.mode,
        depth=job.depth,
        solver=job.solver,
        timeout=job.timeout,
        project_name=job.job_id,
        reset_signal=job.reset_signal,
        reset_polarity=job.reset_polarity,
        clock_signal=job.clock_signal,
        auto_checks=job.auto_checks,
        engine=job.engine,
    )

    # Update the tracked job in-place
    job.status = result_job.status
    job.result = result_job.result
    job.lowered_rtl = result_job.lowered_rtl
    job.debug_info = result_job.debug_info
    job.parse_summary = result_job.parse_summary
    job.sby_project_dir = result_job.sby_project_dir
    job.lowering_time = result_job.lowering_time
    job.proving_time = result_job.proving_time
    job.total_time = result_job.total_time
    job.error_message = result_job.error_message
    job.completed_at = result_job.completed_at


# ═══════════════════════════════════════════════════════════════
# COUNTEREXAMPLE READING
# ═══════════════════════════════════════════════════════════════

def read_counterexample_vcd(vcd_path: str, max_signals: int = 64,
                            prefer: Optional[list[str]] = None, per_signal: int = 500,
                            max_timepoints: int = 1000) -> dict:
    """
    Read a counterexample VCD file and extract waveform-friendly signal data.
    Returns a compact representation that is still usable by the debug assistant.
    """
    if not os.path.exists(vcd_path):
        return {"error": f"VCD file not found: {vcd_path}"}

    try:
        lines = Path(vcd_path).read_text(encoding="utf-8", errors="replace").splitlines()

        var_map: dict[str, dict] = {}
        transitions: list[dict] = []
        timepoints: list[int] = []
        current_time = 0
        definitions_complete = False
        scope_stack: list[str] = []
        timescale = ""

        def normalize_value(raw_value: str) -> str:
            value = raw_value.strip()
            return value.lower() if value else "x"

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if not definitions_complete and line.startswith("$timescale"):
                timescale = line.replace("$timescale", "").replace("$end", "").strip()
                continue

            if not definitions_complete and line.startswith("$scope"):
                parts = line.split()
                if len(parts) >= 3:
                    scope_stack.append(parts[2])
                continue

            if not definitions_complete and line.startswith("$upscope"):
                if scope_stack:
                    scope_stack.pop()
                continue

            if line.startswith("$var"):
                parts = line.split()
                if len(parts) >= 6:
                    var_type = parts[1]
                    try:
                        width = int(parts[2])
                    except ValueError:
                        width = 1
                    symbol = parts[3]
                    name = " ".join(parts[4:-1])
                    full_name = ".".join([*scope_stack, name]) if scope_stack else name
                    scope = ".".join(scope_stack)
                    var_map[symbol] = {
                        "name": name,
                        "full_name": full_name,
                        "scope": scope,
                        "width": width,
                        "type": var_type,
                    }
                continue

            if line.startswith("$enddefinitions"):
                definitions_complete = True
                continue

            if not definitions_complete:
                continue

            if line.startswith("#"):
                try:
                    current_time = int(line[1:])
                    if not timepoints or timepoints[-1] != current_time:
                        timepoints.append(current_time)
                except ValueError:
                    continue
                continue

            if line.startswith("$"):
                continue

            value = ""
            symbol = ""
            if line[0] in "01xXzZuUwWlLhH-":
                value = normalize_value(line[0])
                symbol = line[1:].strip()
            elif line[0] in "bBrR":
                parts = line.split(maxsplit=1)
                if len(parts) == 2:
                    value = normalize_value(parts[0][1:])
                    symbol = parts[1].strip()

            if not symbol or symbol not in var_map:
                continue

            sig = var_map[symbol]
            transitions.append({
                "time": current_time,
                "signal": sig["full_name"],
                "name": sig["name"],
                "value": value,
                "width": sig["width"],
                "type": sig["type"],
            })

        # Signals named in `prefer` (e.g. the failing property's) come first,
        # then design signals; the checker's internal wires last
        rank = {name: i for i, name in enumerate(prefer or [])}
        signal_defs = sorted(var_map.values(),
                             key=lambda item: (rank.get(item["full_name"], len(rank)),
                                               ".__va_mon." in item["full_name"], item["full_name"]))
        selected_defs = signal_defs[:max_signals]
        # smt_step places the failure marker; keep it even past the limit
        selected_defs += [s for s in signal_defs[max_signals:] if s["name"] == "smt_step"]
        selected_names = {sig["full_name"] for sig in selected_defs}
        selected_transitions = [
            transition for transition in transitions
            if transition["signal"] in selected_names
        ]

        timeline = {
            sig["full_name"]: [
                transition
                for transition in selected_transitions
                if transition["signal"] == sig["full_name"]
            ]
            for sig in selected_defs
        }

        signal_details = []
        for sig in selected_defs:
            sig_timeline = timeline[sig["full_name"]]
            initial_value = sig_timeline[0]["value"] if sig_timeline else "x"
            final_value = sig_timeline[-1]["value"] if sig_timeline else initial_value
            signal_details.append({
                "name": sig["name"],
                "full_name": sig["full_name"],
                "scope": sig["scope"],
                "width": sig["width"],
                "type": sig["type"],
                "initial_value": initial_value,
                "final_value": final_value,
                "transitions": sig_timeline[:per_signal],
            })
        max_time = max(timepoints, default=0)

        return {
            "path": vcd_path,
            "timescale": timescale or "1ns",
            "signals": [sig["full_name"] for sig in selected_defs],
            "signal_details": signal_details,
            "total_cycles": max_time,
            "timepoints": timepoints[:max_timepoints],
            "start_time": timepoints[0] if timepoints else 0,
            "end_time": max_time,
            "transitions": selected_transitions[:1000],
            "timeline": timeline,
            "signal_count": len(selected_defs),
        }

    except Exception as e:
        logger.error(f"Failed to parse VCD: {e}")
        return {"error": str(e)}


def format_counterexample_for_llm(vcd_data: dict, max_cycles: int = 30) -> str:
    """
    Format counterexample data into a text summary suitable for
    the LLM debug assistant to analyze.
    """
    if "error" in vcd_data:
        return f"VCD parsing error: {vcd_data['error']}"

    lines = []
    lines.append(f"COUNTEREXAMPLE TRACE ({vcd_data.get('total_cycles', '?')} cycles, {vcd_data.get('signal_count', '?')} signals)")
    lines.append("")

    # Build cycle-by-cycle state
    signals = vcd_data.get("signals", [])

    if not signals:
        return "No signal data in counterexample."

    # Track current values
    current_values = {sig: "x" for sig in signals}

    # Collect all unique timestamps
    all_times = sorted(set(t["time"] for t in vcd_data.get("transitions", [])))
    all_times = [t for t in all_times if t <= max_cycles * 10]  # rough cycle limit

    for t in all_times:
        # Update values at this timestamp
        for trans in vcd_data.get("transitions", []):
            if trans["time"] == t:
                current_values[trans["signal"]] = trans["value"]

        # Format state
        state_parts = [f"{sig}={current_values[sig]}" for sig in signals[:10]]
        lines.append(f"  @{t}: {', '.join(state_parts)}")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════
# SINGLETON
# ═══════════════════════════════════════════════════════════════

formal_service = FormalService()
