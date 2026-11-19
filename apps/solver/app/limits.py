"""Hard limits the solver enforces whatever the caller asks for.

The web app already caps depth and time per level (packages/shared/src/schemas/drill.ts,
DRILL_LIMITS). These are the solver's own ceiling, so a bug or a forged call upstream still
cannot hold a CPU for long (hardening finding 3).
"""

MODES = frozenset({"bmc", "prove", "cover"})
SOLVERS = frozenset({"boolector", "yices", "z3"})

MAX_DEPTH = 200
MAX_TIMEOUT_SECONDS = 300

# Hardening finding 11: sizes of the code a job may carry.
MAX_DESIGN_BYTES = 256 * 1024
MAX_PROPERTIES_BYTES = 64 * 1024

# Bounds on what a result carries back.
MAX_LOG_CHARS = 64 * 1024
MAX_TRACES = 8
MAX_TRACE_SIGNALS = 64
MAX_TRACE_TRANSITIONS = 2_000

# Per-job container (app.runners.ContainerRunner).
RUNNER_MEMORY = "1g"
RUNNER_CPUS = "1"
RUNNER_PIDS = 256
RUNNER_WORK_MB = 256
RUNNER_TMP_MB = 64

# Praman sessions (ADR 0031). The web app sends each learner's ceilings for their level; these
# are the solver's own absolute ceilings (the Advance values), whatever a call asks for.
PRAMAN_MAX_PROOF_SECONDS = 30 * 60
PRAMAN_MAX_TRACE_LENGTH = 200
PRAMAN_MAX_DAILY_SECONDS = 240 * 60  # Advance's proof minutes a day
PRAMAN_MAX_FILES_BYTES = 1024 * 1024
PRAMAN_MAX_TRACE_BYTES = 2 * 1024 * 1024
PRAMAN_IDLE_SECONDS = 15 * 60  # a session with no command for this long, and no proof, closes

# Per-session container (app.session_runners): 1 CPU like a job, more memory for a whole tool.
PRAMAN_SESSION_MEMORY = "1536m"
# Praman's own knobs, sized for one CPU: one check and one compile at a time, Tcl well inside
# the container's memory.
PRAMAN_SESSION_TUNING = {
    "PRAMAN_TCL_MEMORY_MB": "256",
    "FORMAL_MAX_PARALLEL": "1",
    "FORMAL_COMPILE_WORKERS": "1",
}
