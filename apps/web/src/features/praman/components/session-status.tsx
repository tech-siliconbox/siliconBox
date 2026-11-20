import { cn } from '@/lib/cn';
import type { SessionState } from '../hooks/use-praman-session';

const PLACE_TEXT: Readonly<Record<SessionState['place'], string>> = {
  opening: 'Opening the session…',
  waiting: 'Waiting for a free place on the formal tool',
  open: 'Session open',
  closed: 'Session closed',
};

const DOT: Readonly<Record<SessionState['place'], string>> = {
  opening: 'bg-warning',
  waiting: 'bg-warning',
  open: 'bg-ok',
  closed: 'bg-muted-foreground',
};

/** Where the chosen session stands on the formal tool, and its name, at the menu bar's end. */
export function SessionStatus({ state, name }: { state: SessionState | null; name: string }) {
  if (state === null) return <span>No session</span>;
  const position =
    state.place === 'waiting' && state.position !== null
      ? `: number ${state.position} in line`
      : '';
  return (
    <>
      <span
        aria-live="polite"
        className="flex items-center gap-1.5 rounded-[3px] border border-border bg-background px-2 py-0.5 text-foreground"
      >
        <span aria-hidden="true" className={cn('size-2 rounded-full', DOT[state.place])} />
        {PLACE_TEXT[state.place]}
        {position}
      </span>
      <span className="max-w-48 truncate">{name}</span>
    </>
  );
}
