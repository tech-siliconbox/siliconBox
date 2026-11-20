'use client';

import { API_ROUTES, type PramanCeilings } from '@siliconbox/shared';
import { useState } from 'react';
import { type CommandKind, commandSpecs } from '../command-specs';
import {
  type SessionActions,
  type SessionState,
  usePramanSession,
} from '../hooks/use-praman-session';
import type { PramanProperty, PramanSnapshot } from '../praman-snapshot';
import { tclCommand } from '../tcl';
import { CommandForm } from './command-form';
import { FilesPanel } from './files-panel';
import { HierarchyPanel } from './hierarchy-panel';
import { LogPanel } from './log-panel';
import { PropertyTable } from './property-table';
import { RunHistory } from './run-history';
import { SourceEditor } from './source-editor';
import { type ToolAction, ToolBar } from './tool-bar';
import { TracePanel } from './trace-panel';

const SOURCE = /\.(sv|v)$/i;

type Center = { kind: 'properties' } | { kind: 'file'; name: string } | { kind: 'history' };

/** The analyze line for every design and property file of the session, or null without any. */
function analyzeLine(snapshot: PramanSnapshot | null): string | null {
  const sources = (snapshot?.files ?? []).filter((file) => SOURCE.test(file.name));
  return sources.length === 0
    ? null
    : tclCommand('analyze', '-sv', ...sources.map((file) => file.name));
}

type SessionViewProps = { sessionId: string; ceilings: PramanCeilings };

/** One open session: menu, files and hierarchy, properties or a file, the log and the console. */
export function SessionView({ sessionId, ceilings }: SessionViewProps) {
  const { state, actions } = usePramanSession(sessionId);
  const [center, setCenter] = useState<Center>({ kind: 'properties' });
  const [form, setForm] = useState<CommandKind | null>(null);

  const act = (action: ToolAction) => {
    if (action.kind === 'command') void actions.command(action.line);
    if (action.kind === 'form') setForm(action.form);
    if (action.kind === 'history') setCenter({ kind: 'history' });
    if (action.kind === 'example') void actions.loadExample();
    if (action.kind === 'stop') void actions.stop();
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_13rem] border border-border bg-background">
      <ToolBar
        state={state}
        analyzeLine={analyzeLine(state.snapshot)}
        hasScript={state.snapshot?.files.some((file) => file.name === 'pm.tcl') ?? false}
        scriptUrl={API_ROUTES.toolSessionScript(sessionId)}
        onAction={act}
      />
      <div className="grid min-h-0 grid-cols-[15rem_minmax(0,1fr)]">
        <LeftPanel
          state={state}
          actions={actions}
          onOpen={(name) => setCenter({ kind: 'file', name })}
        />
        <MainPanel
          {...{ sessionId, ceilings, state, actions, center }}
          form={form}
          onCloseForm={() => setForm(null)}
          onCenter={setCenter}
        />
      </div>
      <LogPanel
        events={state.events}
        onCommand={actions.command}
        disabled={state.place !== 'open'}
      />
    </div>
  );
}

type PanelProps = { state: SessionState; actions: SessionActions };

function LeftPanel({ state, actions, onOpen }: PanelProps & { onOpen: (name: string) => void }) {
  const [tab, onTab] = useState<'files' | 'hierarchy'>('files');
  const tabs = [
    { id: 'files', label: 'Files' },
    { id: 'hierarchy', label: 'Hierarchy' },
  ] as const;
  const addAll = async (files: { name: string; text: string }[]) => {
    for (const file of files) await actions.putFile(file.name, file.text);
  };
  return (
    <aside className="flex min-h-0 flex-col overflow-auto border-r border-border">
      <div role="tablist" aria-label="Session" className="flex border-b border-border">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className="flex-1 px-2 py-1.5 text-[12px] font-semibold aria-selected:border-b-2 aria-selected:border-foreground"
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'files' ? (
        <FilesPanel
          files={state.snapshot?.files ?? []}
          onOpen={onOpen}
          onAdd={addAll}
          onDelete={actions.deleteFile}
        />
      ) : (
        <HierarchyPanel tree={state.snapshot?.tree ?? null} />
      )}
    </aside>
  );
}

type MainProps = CenterProps & {
  ceilings: PramanCeilings;
  form: CommandKind | null;
  onCloseForm: () => void;
};

/** The error to show, the open command form, then properties, a file or the run history. */
function MainPanel({ ceilings, form, onCloseForm, ...center }: MainProps) {
  const { state, actions } = center;
  return (
    <div className="flex min-h-0 flex-col overflow-hidden">
      {state.error !== null && (
        <p role="alert" className="border-b border-border px-4 py-2 text-[13px] text-destructive">
          {state.error}
        </p>
      )}
      {form !== null && (
        <CommandForm
          spec={commandSpecs(state.snapshot, ceilings)[form]}
          onRun={actions.command}
          onClose={onCloseForm}
        />
      )}
      <CenterPanel {...center} />
    </div>
  );
}

type CenterProps = PanelProps & {
  center: Center;
  sessionId: string;
  onCenter: (center: Center) => void;
};

function CenterPanel({ center, sessionId, state, actions, onCenter }: CenterProps) {
  const [trace, setTrace] = useState<PramanProperty | null>(null);
  const back = () => onCenter({ kind: 'properties' });
  if (center.kind === 'file') {
    return (
      <SourceEditor
        sessionId={sessionId}
        name={center.name}
        onSave={actions.putFile}
        onClose={back}
      />
    );
  }
  if (center.kind === 'history') return <RunHistory onClose={back} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PropertyTable properties={state.snapshot?.properties ?? []} onTrace={setTrace} />
      {trace !== null && (
        <TracePanel
          url={`${API_ROUTES.toolSessionTrace(sessionId)}?property=${encodeURIComponent(trace.id)}`}
          title={trace.name}
          onClose={() => setTrace(null)}
        />
      )}
    </div>
  );
}
