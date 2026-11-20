import { cn } from '@/lib/cn';
import type { Link, SessionState } from '../hooks/use-praman-session';

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
      <ServerLight link={state.link} />
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

const LIGHT: Readonly<
  Record<Link['state'], { className: string; text: (ms: number | null) => string }>
> = {
  unknown: { className: 'bg-muted-foreground', text: () => 'Checking the server' },
  live: { className: 'bg-ok', text: (ms) => `The server answers (${ms ?? 0} ms)` },
  slow: { className: 'bg-warning', text: (ms) => `The server is slow (${ms ?? 0} ms)` },
  down: {
    className: 'bg-danger',
    text: () => 'The server does not answer; Praman keeps trying',
  },
};

/** Is the server there? Green when it answers the page's polls, amber when slow, red when not. */
function ServerLight({ link }: { link: Link }) {
  const light = LIGHT[link.state];
  const text = light.text(link.ms);
  return (
    <span role="img" aria-label={text} title={text} className="flex items-center">
      <span className={cn('size-2 rounded-full', light.className)} />
    </span>
  );
}
