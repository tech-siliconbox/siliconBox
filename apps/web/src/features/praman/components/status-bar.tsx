import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { SessionState } from '../hooks/use-praman-session';
import type { PramanSnapshot } from '../praman-snapshot';
import { propertyCounts } from '../property-status';

function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('flex h-full items-center gap-1 border-r border-border px-3', className)}>
      {children}
    </span>
  );
}

const COUNTS = [
  { tally: 'pass', mark: '✓', className: 'text-ok', title: 'Proven or covered' },
  {
    tally: 'fail',
    mark: '✗',
    className: 'text-danger',
    title: 'Counterexample, unreachable, vacuous or not checkable',
  },
  { tally: 'open', mark: '?', className: 'text-warning', title: 'Undetermined or stopped' },
  { tally: 'todo', mark: '○', className: 'text-muted-foreground', title: 'Not run' },
] as const;

function Design({ snapshot }: { snapshot: PramanSnapshot }) {
  const reset = snapshot.reset;
  const counts = propertyCounts(snapshot.properties);
  return (
    <>
      <Cell>
        Clock <b>{snapshot.clock ?? 'not declared'}</b>
      </Cell>
      <Cell>
        Reset{' '}
        <b>{reset === null ? 'not declared' : `${reset.active_low ? '!' : ''}${reset.signal}`}</b>
      </Cell>
      {COUNTS.map(({ tally, mark, className, title }) => (
        <Cell key={tally}>
          <span aria-hidden="true" className={className}>
            {mark}
          </span>
          <span className="sr-only">{title}:</span>
          <b title={title}>{counts[tally]}</b>
        </Cell>
      ))}
    </>
  );
}

/** What the session is doing, with a dot: green when ready, blue while working. */
function activityOf(state: SessionState | null): { text: string; working: boolean } {
  if (state === null) return { text: 'No session', working: false };
  if (state.place !== 'open')
    return { text: state.place === 'closed' ? 'Closed' : 'Waiting', working: false };
  if (state.proofRunning) return { text: 'Proving', working: true };
  return state.busy ? { text: 'Running', working: true } : { text: 'Ready', working: false };
}

function FileCells({ snapshot }: { snapshot: PramanSnapshot | null }) {
  const files = snapshot?.files ?? [];
  const analyzed = files.filter((file) => file.analyzed).length;
  return (
    <>
      <Cell>
        Files <b>{files.length}</b>
      </Cell>
      <Cell>
        Analyzed <b>{analyzed === 0 ? 'no' : `${analyzed} file${analyzed === 1 ? '' : 's'}`}</b>
      </Cell>
      <Cell>
        Elaborated <b>{snapshot?.phase === 'elaborated' ? snapshot.top : 'no'}</b>
      </Cell>
    </>
  );
}

function Activity({ state }: { state: SessionState | null }) {
  const activity = activityOf(state);
  const left = state?.secondsLeft ?? null;
  return (
    <div className="ml-auto flex h-full items-center">
      {left !== null && <Cell>{Math.floor(left / 60)} proof minutes left today</Cell>}
      <span role="status" className="flex items-center gap-1.5 px-3">
        <span
          aria-hidden="true"
          className={cn(
            'size-2 rounded-full',
            state?.place === 'open' ? 'bg-ok' : 'bg-muted-foreground',
            activity.working && 'animate-pulse bg-info',
          )}
        />
        {activity.text}
      </span>
    </div>
  );
}

/** The bottom line of the tool: where the design stands, the results, and the proof time left. */
export function StatusBar({ state }: { state: SessionState | null }) {
  const snapshot = state?.snapshot ?? null;
  return (
    <div className="flex h-6 shrink-0 items-center border-t border-border bg-muted text-[12px]">
      <FileCells snapshot={snapshot} />
      {snapshot?.phase === 'elaborated' && <Design snapshot={snapshot} />}
      <Activity state={state} />
    </div>
  );
}
