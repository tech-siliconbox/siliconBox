import type { Level } from './level';

// Drill settings the server attaches to every run. Learners never choose them (CLAUDE.md rule 6).

export const DRILL_MODES = ['bmc', 'prove', 'cover'] as const;
export const DRILL_SOLVERS = ['boolector', 'yices', 'z3'] as const;
/** PASS: the learner proves the design correct. FAIL: the learner's properties must find the bug. */
export const DRILL_TARGETS = ['PASS', 'FAIL'] as const;

/**
 * Per-level caps on depth and solver time. Starting values, to tune from real run data
 * (docs/architecture/solver-integration.md: "hard timeout and depth cap set per level").
 */
export const DRILL_LIMITS: Readonly<
  Record<Level, { maxDepth: number; maxTimeoutSeconds: number }>
> = {
  basic: { maxDepth: 40, maxTimeoutSeconds: 60 },
  intermediate: { maxDepth: 80, maxTimeoutSeconds: 120 },
  advance: { maxDepth: 150, maxTimeoutSeconds: 300 },
};

/** A plain SystemVerilog identifier: nothing that could smuggle commands into the .sby file. */
export const TOP_MODULE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** Why these settings break the level's caps, or null when they are within them. */
export function drillLimitProblem(
  level: Level,
  settings: { depth: number; timeoutSeconds: number },
): string | null {
  const { maxDepth, maxTimeoutSeconds } = DRILL_LIMITS[level];
  if (settings.depth > maxDepth)
    return `Depth ${settings.depth} is over the ${level} cap of ${maxDepth}.`;
  if (settings.timeoutSeconds > maxTimeoutSeconds) {
    return `Timeout ${settings.timeoutSeconds}s is over the ${level} cap of ${maxTimeoutSeconds}s.`;
  }
  return null;
}
