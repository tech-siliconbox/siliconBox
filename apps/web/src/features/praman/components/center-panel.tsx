'use client';

import { API_ROUTES } from '@siliconbox/shared';
import { useState } from 'react';
import type { SessionActions, SessionState } from '../hooks/use-praman-session';
import type { PramanProperty } from '../praman-snapshot';
import { PanelTabs } from './panel-tabs';
import { PropertyTable } from './property-table';
import { RunHistory } from './run-history';
import { SourceEditor } from './source-editor';
import { TracePanel } from './trace-panel';
import { DesignGuide, NoSessionGuide } from './welcome';

/** The centre's tabs: the property table always, then open files and the run history. */
export const PROPERTIES_TAB = 'properties';
export const HISTORY_TAB = 'history';
export const fileTab = (name: string) => `file:${name}`;

type Session = { id: string; state: SessionState; actions: SessionActions };

type CenterPanelProps = {
  session: Session | null;
  /** Open tabs after the property table, in order. */
  tabs: readonly string[];
  active: string;
  onSelect: (tab: string) => void;
  onCloseTab: (tab: string) => void;
  onNewSession: () => void;
  onAddFiles: () => void;
};

const labelOf = (tab: string) => (tab === HISTORY_TAB ? 'Run History' : tab.slice('file:'.length));

/** The property table (with a trace under it), the files open in tabs, and the run history. */
export function CenterPanel({ tabs, active, onSelect, onCloseTab, ...rest }: CenterPanelProps) {
  const all = [
    { id: PROPERTIES_TAB, label: 'Properties Table' },
    ...tabs.map((tab) => ({ id: tab, label: labelOf(tab), closable: true })),
  ];
  return (
    <div className="flex min-w-0 flex-1 flex-col border border-border bg-background">
      <PanelTabs
        label="Results"
        tabs={all}
        active={active}
        onSelect={onSelect}
        onClose={onCloseTab}
      />
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col overflow-auto">
        <TabBody active={active} onCloseTab={onCloseTab} {...rest} />
      </div>
    </div>
  );
}

type TabBodyProps = Omit<CenterPanelProps, 'tabs' | 'onSelect'>;

function TabBody({ session, active, onCloseTab, onNewSession, onAddFiles }: TabBodyProps) {
  if (active === HISTORY_TAB) return <RunHistory onClose={() => onCloseTab(HISTORY_TAB)} />;
  if (session === null) return <NoSessionGuide onNew={onNewSession} />;
  if (active.startsWith('file:')) {
    return (
      <SourceEditor
        key={active}
        sessionId={session.id}
        name={labelOf(active)}
        onSave={session.actions.putFile}
        onClose={() => onCloseTab(active)}
      />
    );
  }
  return <Properties session={session} onAddFiles={onAddFiles} />;
}

function Properties({ session, onAddFiles }: { session: Session; onAddFiles: () => void }) {
  const [trace, setTrace] = useState<PramanProperty | null>(null);
  const snapshot = session.state.snapshot;
  if (snapshot === null || snapshot.properties.length === 0) {
    return (
      <DesignGuide
        files={snapshot?.files.length ?? 0}
        onAdd={onAddFiles}
        onExample={() => void session.actions.loadExample()}
      />
    );
  }
  return (
    <>
      <PropertyTable properties={snapshot.properties} onTrace={setTrace} />
      {trace !== null && (
        <TracePanel
          url={`${API_ROUTES.toolSessionTrace(session.id)}?property=${encodeURIComponent(trace.id)}`}
          title={trace.name}
          onClose={() => setTrace(null)}
        />
      )}
    </>
  );
}
