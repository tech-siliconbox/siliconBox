'use client';

import { resizePanel } from '../hooks/use-layout';
import type { SessionActions, SessionState } from '../hooks/use-praman-session';
import { LogPanel } from './log-panel';
import { Splitter } from './splitter';
import { TclConsole } from './tcl-console';

type ScreenDocksProps = {
  session: { state: SessionState; actions: SessionActions } | null;
  shown: { log: boolean; console: boolean };
  /** The property chosen in the table: the log can show only its engine detail. */
  selected: string | null;
  /** What the log's lines open: a file at a line, a property in the table. */
  onLocation: (name: string, line: number) => void;
  onProperty: (id: string) => void;
};

/** What the console needs from the session; without one it is switched off. */
function consoleOf(session: ScreenDocksProps['session']) {
  if (session === null) {
    return { run: () => Promise.resolve(), disabled: true, busy: false, names: [] };
  }
  const { state, actions } = session;
  return {
    run: actions.command,
    disabled: state.place !== 'open',
    busy: state.busy || state.proofRunning,
    names: state.snapshot?.properties.map((property) => property.name) ?? [],
  };
}

/** The log and the Tcl console under the workspace, each below a bar that resizes it. */
export function ScreenDocks({ session, shown, selected, ...links }: ScreenDocksProps) {
  const tcl = consoleOf(session);
  const focus = session?.state.snapshot?.properties.find((each) => each.id === selected) ?? null;
  return (
    <>
      {shown.log && (
        <>
          <Splitter
            label="Resize the log"
            orientation="horizontal"
            onMove={(by) => resizePanel('log', -by)}
          />
          <div className="mx-1 mb-1 h-[var(--pm-log,11rem)] shrink-0 border border-border bg-background">
            <LogPanel events={session?.state.events ?? []} focus={focus} {...links} />
          </div>
        </>
      )}
      {shown.console && (
        <>
          <Splitter
            label="Resize the console"
            orientation="horizontal"
            onMove={(by) => resizePanel('console', -by)}
          />
          <div className="mx-1 mb-1 h-[var(--pm-console,4.5rem)] shrink-0 border border-border">
            <TclConsole
              onCommand={tcl.run}
              disabled={tcl.disabled}
              busy={tcl.busy}
              propertyNames={tcl.names}
            />
          </div>
        </>
      )}
    </>
  );
}
