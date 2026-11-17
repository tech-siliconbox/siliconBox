import type { CheckResult, GradingView, PublishedDrill, RunView } from '@siliconbox/shared';
import { cn } from '@/lib/cn';
import type { RunPhase } from '../hooks/use-drill-run';
import { WaveformView } from './waveform-view';

type Target = PublishedDrill['target'];

const STATUS_CLASS: Record<CheckResult['status'], string> = {
  PASS: 'border-success text-success',
  FAIL: 'border-destructive text-destructive',
  TIMEOUT: 'border-warning text-warning',
  ERROR: 'border-warning text-warning',
  SKIPPED: 'border-border text-muted-foreground',
};

const GOAL: Record<Target, string> = {
  PASS: 'This Drill is solved when every property holds on the design and your checker would catch each seeded bug.',
  FAIL: 'This Drill is solved when your properties catch the bug in the design and still hold on a correct version of it.',
};

function StatusBadge({ status, target }: { status: CheckResult['status']; target?: Target }) {
  // On a find-the-bug Drill a failing property is the goal.
  const bugFound = target === 'FAIL' && status === 'FAIL';
  return (
    <span
      className={cn(
        'rounded border px-2 py-0.5 font-mono text-[11px] font-bold',
        bugFound ? STATUS_CLASS.PASS : STATUS_CLASS[status],
      )}
    >
      {bugFound ? 'BUG FOUND' : status}
    </span>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={check.status} />
        <span className="font-mono text-[12px] text-muted-foreground">{check.kind}</span>
        <span className="font-mono text-[13px] font-semibold">{check.name}</span>
        {check.step !== null && (
          <span className="text-[12px] text-muted-foreground">at cycle {check.step}</span>
        )}
      </div>
      {check.message && <p className="text-[13px] text-muted-foreground">{check.message}</p>}
      {check.trace && (
        <details>
          <summary className="cursor-pointer text-[13px] font-semibold">Show trace</summary>
          <div className="mt-2">
            <WaveformView trace={check.trace} title={`Trace for ${check.name}`} />
          </div>
        </details>
      )}
    </li>
  );
}

/** How the checker did on the Drill's hidden designs: counts only, never the designs. */
function gradingText(grading: GradingView): string {
  if (grading.state === 'pending') {
    return `Checking your properties against ${grading.total} hidden design${grading.total === 1 ? '' : 's'}…`;
  }
  if (grading.kind === 'bugVariants') {
    return `Your properties caught ${grading.met} of ${grading.total} seeded bugs.`;
  }
  return grading.met === grading.total
    ? 'Your properties hold on a correct version of this design.'
    : 'One of your properties also fails on a correct version of this design: it is stricter than the specification.';
}

function RunResultView({ view, target }: { view: RunView; target: Target }) {
  const result = view.result;
  if (result === null) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={result.status} target={target} />
        {view.solved !== null && (
          <span className={cn('text-[13px] font-semibold', view.solved ? 'text-success' : '')}>
            {view.solved ? 'Solved' : 'Not solved yet'}
          </span>
        )}
        <span className="font-mono text-[11px] text-muted-foreground">
          {result.elapsedSeconds.toFixed(1)} s · depth {result.depthReached}
        </span>
      </div>
      {view.grading && <p className="text-[13px] font-semibold">{gradingText(view.grading)}</p>}
      {view.solved === false && <p className="text-[13px] text-muted-foreground">{GOAL[target]}</p>}
      <p className="text-[13px]">{result.message}</p>
      <ul className="divide-y divide-border">
        {result.checks.map((check) => (
          <CheckRow key={check.name} check={check} />
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer text-[13px] font-semibold">Solver log</summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-3 font-mono text-[11px] leading-relaxed">
          {result.log}
        </pre>
      </details>
    </div>
  );
}

function waitingText(view: RunView): string {
  if (view.state === 'running') return 'Running on the formal tool…';
  return view.position === null ? 'Queued…' : `Queued: position ${view.position} in line…`;
}

/** What the last run did: waiting, the solver's answer per property, or why it could not run. */
export function RunOutput({ phase, target }: { phase: RunPhase; target: Target }) {
  return (
    <section aria-label="Output" aria-live="polite" className="flex flex-col gap-3 p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Output
      </h2>
      {phase.kind === 'idle' && (
        <p className="text-[13px] text-muted-foreground">
          Write your properties, then press “Run verification”. {GOAL[target]}
        </p>
      )}
      {phase.kind === 'starting' && <p className="text-[13px]">Submitting…</p>}
      {phase.kind === 'waiting' && <p className="text-[13px]">{waitingText(phase.view)}</p>}
      {phase.kind === 'failed' && (
        <p role="alert" className="text-[13px] text-destructive">
          {phase.message}
        </p>
      )}
      {phase.kind === 'done' && <RunResultView view={phase.view} target={target} />}
    </section>
  );
}
