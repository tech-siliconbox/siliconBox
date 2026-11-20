'use client';

import { API_ROUTES, type PramanCeilings } from '@siliconbox/shared';
import type { Abilities } from '../abilities';
import type { SessionActions, SessionState } from '../hooks/use-praman-session';
import { propertyMenu } from '../menus';
import { tclWord } from '../tcl';
import type { CoverageItem } from '../praman-reports';
import type { PramanProperty } from '../praman-snapshot';
import type { FileLine, ReportTab, ToolAction } from '../tool-actions';
import { CoveragePanel } from './coverage-panel';
import { EquivalencePanel } from './equivalence-panel';
import { HowItWorks } from './how-it-works';
import { PanelTabs } from './panel-tabs';
import { PropertyTable } from './property-table';
import { RunHistory } from './run-history';
import { SourceEditor } from './source-editor';
import { StrengthPanel } from './strength-panel';
import { TraceHost } from './trace-host';
import { DesignGuide, NoSessionGuide } from './welcome';

/** The centre's tabs: the property table always, then results, open files and the run history. */
export const PROPERTIES_TAB = 'properties';
export const HISTORY_TAB = 'history';
export const GUIDE_TAB = 'guide';
export const fileTab = (name: string) => `file:${name}`;
export const reportTab = (tab: ReportTab) => `report:${tab}`;
const REPORT_TABS: readonly ReportTab[] = ['strength', 'coverage', 'equivalence'];

const REPORT_LABEL: Readonly<Record<string, string>> = {
  [reportTab('strength')]: 'Assertion Strength',
  [reportTab('coverage')]: 'Coverage',
  [reportTab('equivalence')]: 'Equivalence',
  [HISTORY_TAB]: 'Run History',
  [GUIDE_TAB]: 'How Praman Works',
};
const labelOf = (tab: string) => REPORT_LABEL[tab] ?? tab.slice('file:'.length);

type Session = { id: string; state: SessionState; actions: SessionActions };

type CenterPanelProps = {
  session: Session | null;
  can: Abilities;
  /** Open tabs after the property table, in order. */
  tabs: readonly string[];
  active: string;
  onSelect: (tab: string) => void;
  onCloseTab: (tab: string) => void;
  onAction: (action: ToolAction) => void;
  ceilings: PramanCeilings;
  /** The instance chosen in the hierarchy ('' for all). */
  instance: string;
  /** Now, in milliseconds, for the time of properties still running. */
  now: number;
  /** The file and line last asked for, to show when its tab is open. */
  goto: FileLine | null;
  /** The property chosen in the table (the log can choose one too). */
  selected: string | null;
  onSelectProperty: (id: string) => void;
};

/** The property table, the deeper checks' results, the files open in tabs, and the run history. */
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

function TabBody({ session, active, onCloseTab, onAction, ...rest }: TabBodyProps) {
  if (active === GUIDE_TAB) {
    const start = () => onAction({ kind: 'newSession' });
    return (
      <HowItWorks ceilings={rest.ceilings} {...(session === null ? { onNewSession: start } : {})} />
    );
  }
  if (active === HISTORY_TAB) {
    return <RunHistory onClose={() => onCloseTab(HISTORY_TAB)} onAction={onAction} />;
  }
  if (session === null) return <NoSessionGuide onNew={() => onAction({ kind: 'newSession' })} />;
  if (active.startsWith('file:')) {
    return (
      <SourceEditor
        key={active}
        sessionId={session.id}
        name={labelOf(active)}
        goto={rest.goto?.name === labelOf(active) ? rest.goto : null}
        onSave={session.actions.putFile}
        onClose={() => onCloseTab(active)}
      />
    );
  }
  const report = REPORT_TABS.find((tab) => reportTab(tab) === active);
  if (report !== undefined) {
    return <Report tab={report} session={session} can={rest.can} onAction={onAction} />;
  }
  return <Properties session={session} onAction={onAction} {...rest} />;
}

type PanelProps = { session: Session; can: Abilities; onAction: (action: ToolAction) => void };

/** Choosing a task in the table runs `task -set`; '' is the design's own properties. */
const taskLine = (task: string) => `task -set ${tclWord(task === '' ? '<embedded>' : task)}`;

/** A property written in a file opens there; one made in Tcl has no file to open. */
const hasSource = (property: PramanProperty) => property.file !== '' && property.file !== 'Tcl';

type PropertiesProps = PanelProps &
  Pick<CenterPanelProps, 'instance' | 'now' | 'selected' | 'onSelectProperty'>;

function Properties({ session, can, onAction, ...rest }: PropertiesProps) {
  const snapshot = session.state.snapshot;
  if (snapshot === null || snapshot.properties.length === 0) {
    return (
      <DesignGuide
        files={snapshot?.files.length ?? 0}
        onAdd={() => onAction({ kind: 'addFiles' })}
        onExample={() => onAction({ kind: 'example' })}
      />
    );
  }
  const traceOf = (id: string) =>
    `${API_ROUTES.toolSessionTrace(session.id)}?${new URLSearchParams({ property: id })}`;
  return (
    <TraceHost top={snapshot.top} reset={snapshot.reset}>
      {(open) => (
        <PropertyTable
          properties={snapshot.properties}
          instance={rest.instance}
          now={rest.now}
          selected={rest.selected}
          onSelect={rest.onSelectProperty}
          tasks={snapshot.tasks}
          task={snapshot.task}
          onTask={(task) => onAction({ kind: 'command', line: taskLine(task) })}
          onSource={(p) =>
            hasSource(p) && onAction({ kind: 'openFile', name: p.file, line: p.line })
          }
          onTrace={(property) =>
            open({
              url: traceOf(property.id),
              title: property.name,
              analysis: { sessionId: session.id, property: property.id, job: '', whatIf: true },
            })
          }
          menuOf={(property) => propertyMenu(property, snapshot.properties, can)}
          onChoose={(item) => onAction(item.action)}
        />
      )}
    </TraceHost>
  );
}

function Report({ tab, session, can, onAction }: PanelProps & { tab: ReportTab }) {
  const snapshot = session.state.snapshot;
  if (tab === 'strength') {
    return (
      <StrengthPanel
        strength={snapshot?.strength ?? null}
        properties={snapshot?.properties ?? []}
        canRun={can.elaborated}
        onRun={(line) => onAction({ kind: 'command', line })}
      />
    );
  }
  return tab === 'coverage' ? (
    <CoverageReport session={session} can={can} onAction={onAction} />
  ) : (
    <EquivalenceReport session={session} can={can} onAction={onAction} />
  );
}

function CoverageReport({ session, can, onAction }: PanelProps) {
  const traceOf = (item: CoverageItem) =>
    `${API_ROUTES.toolSessionCoverageTrace(session.id)}?${new URLSearchParams({ label: item.label, instance: item.instance })}`;
  return (
    <TraceHost
      top={session.state.snapshot?.top ?? ''}
      reset={session.state.snapshot?.reset ?? null}
    >
      {(open) => (
        <CoveragePanel
          coverage={session.state.snapshot?.coverage ?? null}
          canRun={can.elaborated}
          onRun={(line) => onAction({ kind: 'command', line })}
          onSource={(name, line) => onAction({ kind: 'openFile', name, line })}
          onTrace={(item) =>
            open({
              url: traceOf(item),
              title: item.what || item.label,
              analysis: {
                sessionId: session.id,
                property: item.label,
                job: item.job_id,
                whatIf: false,
              },
            })
          }
        />
      )}
    </TraceHost>
  );
}

function EquivalenceReport({ session, can, onAction }: PanelProps) {
  return (
    <TraceHost
      top={session.state.snapshot?.top ?? ''}
      reset={session.state.snapshot?.reset ?? null}
    >
      {(open) => (
        <EquivalencePanel
          equivalence={session.state.snapshot?.equivalence ?? null}
          canRun={can.elaborated}
          onCheck={() => onAction({ kind: 'dialog', dialog: 'equivalence' })}
          onTrace={() =>
            open({
              url: API_ROUTES.toolSessionEquivalenceTrace(session.id),
              title: 'Equivalence difference',
            })
          }
        />
      )}
    </TraceHost>
  );
}
