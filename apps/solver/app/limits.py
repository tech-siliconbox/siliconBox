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
