import { Button, buttonVariants } from '@/components/ui/button';
import type { CommandKind } from '../command-specs';
import type { SessionState } from '../hooks/use-praman-session';

export type ToolAction =
  | { kind: 'command'; line: string }
  | { kind: 'form'; form: CommandKind }
  | { kind: 'example' }
  | { kind: 'stop' }
  | { kind: 'history' };

type ToolBarProps = {
  state: SessionState;
  /** The analyze line for the session's design and property files, when it has any. */
  analyzeLine: string | null;
  hasScript: boolean;
  scriptUrl: string;
  onAction: (action: ToolAction) => void;
};

const PLACE_TEXT: Readonly<Record<SessionState['place'], string>> = {
  opening: 'Opening the session…',
  waiting: 'Waiting for a free place on the formal tool',
  open: 'Session open',
  closed: 'Session closed',
};

type Tool = { label: string; action: ToolAction; enabled: boolean };

/** The menu's buttons, each enabled only when its command can run. */
function tools(state: SessionState, analyzeLine: string | null, hasScript: boolean): Tool[] {
  const ready = state.place === 'open';
  const idle = ready && !state.busy && !state.proofRunning;
  const phase = state.snapshot?.phase ?? 'empty';
  const elaborated = idle && phase === 'elaborated';
  return [
    { label: 'Load example', action: { kind: 'example' }, enabled: ready },
    {
      label: 'Analyze',
      action: { kind: 'command', line: analyzeLine ?? '' },
      enabled: idle && analyzeLine !== null,
    },
    {
      label: 'Elaborate',
      action: { kind: 'form', form: 'elaborate' },
      enabled: idle && phase !== 'empty',
    },
    { label: 'Clock and reset', action: { kind: 'form', form: 'setup' }, enabled: elaborated },
    { label: 'Limits', action: { kind: 'form', form: 'limits' }, enabled: ready },
    { label: 'Prove', action: { kind: 'command', line: 'prove -all' }, enabled: elaborated },
    { label: 'Stop', action: { kind: 'stop' }, enabled: state.proofRunning },
    {
      label: 'Run script',
      action: { kind: 'command', line: 'source pm.tcl' },
      enabled: idle && hasScript,
    },
  ];
}

function SessionStatus({ state }: { state: SessionState }) {
  const position =
    state.place === 'waiting' && state.position !== null
      ? `: number ${state.position} in line`
      : '';
  const left =
    state.secondsLeft === null
      ? ''
      : ` · ${Math.floor(state.secondsLeft / 60)} proof minutes left today`;
  return (
    <span className="text-[12px] text-muted-foreground" aria-live="polite">
      {PLACE_TEXT[state.place]}
      {position}
      {left}
    </span>
  );
}

/** Praman's menu actions as one row, with where the session stands and the proof time left. */
export function ToolBar({ state, analyzeLine, hasScript, scriptUrl, onAction }: ToolBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Praman"
      className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2"
    >
      {tools(state, analyzeLine, hasScript).map((tool) => (
        <Button
          key={tool.label}
          size="sm"
          variant={tool.label === 'Prove' ? 'primary' : 'secondary'}
          disabled={!tool.enabled}
          onClick={() => onAction(tool.action)}
        >
          {tool.label}
        </Button>
      ))}
      <a href={scriptUrl} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
        Download script
      </a>
      <Button size="sm" variant="secondary" onClick={() => onAction({ kind: 'history' })}>
        Run history
      </Button>
      <span className="flex-1" />
      <SessionStatus state={state} />
    </div>
  );
}
