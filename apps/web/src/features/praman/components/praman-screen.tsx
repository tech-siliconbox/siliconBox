'use client';

import { API_ROUTES, type PramanCeilings } from '@siliconbox/shared';
import { useRef, useState } from 'react';
import { commandSpecs } from '../command-specs';
import { useNow } from '../hooks/use-now';
import type { SessionActions, SessionState } from '../hooks/use-praman-session';
import { pramanMenus } from '../menus';
import { proofProgress } from '../proof-clock';
import type { Panel, ToolAction } from '../tool-actions';
import { AboutDialog } from './about-dialog';
import { CaseSplitDialog } from './case-split-dialog';
import { type Abilities, abilitiesOf } from '../abilities';
import {
  CenterPanel,
  GUIDE_TAB,
  HISTORY_TAB,
  PROPERTIES_TAB,
  fileTab,
  reportTab,
} from './center-panel';
import { CheckDialogs } from './check-dialogs';
import { CommandDialog } from './command-dialog';
import { FilePicker } from './file-picker';
import { LeftPanel } from './left-panel';
import { LogPanel } from './log-panel';
import { MenuBar } from './menu-bar';
import { SessionStatus } from './session-status';
import { StatusBar } from './status-bar';
import { TclConsole } from './tcl-console';
import { ToolBar } from './tool-bar';

type ScreenSession = {
  id: string;
  name: string;
  state: SessionState;
  actions: SessionActions;
};

type PramanScreenProps = {
  /** The chosen session; null until the learner starts or picks one. */
  session: ScreenSession | null;
  ceilings: PramanCeilings;
  /** A problem with the learner's sessions (the workbench's), shown under the toolbar. */
  notice: string | null;
  onNewSession: () => void;
  onSessions: () => void;
  onOpenSession: (sessionId: string) => void;
};

/** The dialog open over the tool, if any. */
type OpenDialog =
  Extract<ToolAction, { kind: 'form' | 'dialog' | 'caseSplit' }> | { kind: 'about' };

const opensDialog = (action: ToolAction): action is Exclude<OpenDialog, { kind: 'about' }> =>
  action.kind === 'form' || action.kind === 'dialog' || action.kind === 'caseSplit';

type SimpleKind = Exclude<
  ToolAction['kind'],
  'command' | 'report' | 'view' | 'openFile' | 'openSession' | 'form' | 'dialog' | 'caseSplit'
>;

/**
 * Tabs open after the property table: how Praman works, files, results and the run history. The
 * guide is open from the start, and shown first to a learner without a session.
 */
function useTabs(hasSession: boolean) {
  const [tabs, setTabs] = useState<string[]>([GUIDE_TAB]);
  const [active, setActive] = useState<string>(hasSession ? PROPERTIES_TAB : GUIDE_TAB);
  const open = (tab: string) => {
    if (!tabs.includes(tab)) setTabs([...tabs, tab]);
    setActive(tab);
  };
  const close = (tab: string) => {
    setTabs(tabs.filter((each) => each !== tab));
    if (active === tab) setActive(PROPERTIES_TAB);
  };
  return { tabs, active, setActive, open, close };
}

/** The screen's own state: panels shown, open tabs, the dialog, and what each action does. */
function useScreen(
  { session, onNewSession, onSessions, onOpenSession }: PramanScreenProps,
  openPicker: () => void,
) {
  const actions = session?.actions ?? null;
  const [shown, setShown] = useState<Record<Panel, boolean>>({
    left: true,
    log: true,
    console: true,
  });
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const tabs = useTabs(session !== null);
  const [instance, setInstance] = useState('');
  const simple: Record<SimpleKind, () => void> = {
    newSession: onNewSession,
    sessions: onSessions,
    addFiles: openPicker,
    example: () => void actions?.loadExample(),
    download: () => session && window.location.assign(API_ROUTES.toolSessionScript(session.id)),
    downloadReport: () =>
      session && window.location.assign(API_ROUTES.toolSessionReport(session.id)),
    stop: () => void actions?.stop(),
    history: () => tabs.open(HISTORY_TAB),
    guide: () => tabs.open(GUIDE_TAB),
    about: () => setDialog({ kind: 'about' }),
  };
  const check = (action: Extract<ToolAction, { kind: 'command' | 'report' }>) => {
    if (action.line !== null) void actions?.command(action.line);
    if (action.kind === 'report') tabs.open(reportTab(action.tab));
  };
  const act = (action: ToolAction) => {
    if (action.kind === 'command' || action.kind === 'report') check(action);
    else if (action.kind === 'view') setShown({ ...shown, [action.panel]: !shown[action.panel] });
    else if (action.kind === 'openFile') tabs.open(fileTab(action.name));
    else if (action.kind === 'openSession') onOpenSession(action.sessionId);
    else if (opensDialog(action)) setDialog(action);
    else simple[action.kind]();
  };
  return {
    shown,
    tabs,
    instance,
    setInstance,
    act,
    dialog,
    closeDialog: () => setDialog(null),
    openPicker,
  };
}

type Screen = ReturnType<typeof useScreen>;

/** Praman as the learner sees it: menu bar, toolbar, panels, log, console and status bar. */
export function PramanScreen(props: PramanScreenProps) {
  const { session, ceilings, notice } = props;
  const state = session?.state ?? null;
  const picker = useRef<HTMLInputElement>(null);
  const screen = useScreen(props, () => picker.current?.click());
  const can = abilitiesOf(state);
  const now = useNow(state?.proofRunning === true);
  const addFiles = async (files: { name: string; text: string }[]) => {
    for (const file of files) await session?.actions.putFile(file.name, file.text);
  };
  return (
    <div className="flex h-full min-h-0 flex-col border border-border bg-muted text-[13px]">
      <Bars session={session} screen={screen} can={can} notice={notice} now={now} />
      <Workspace session={session} screen={screen} can={can} ceilings={ceilings} now={now} />
      <Docks session={session} screen={screen} />
      <StatusBar state={state} />
      <FilePicker ref={picker} onAdd={addFiles} />
      <Dialogs session={session} ceilings={ceilings} screen={screen} />
    </div>
  );
}

type PartProps = { session: ScreenSession | null; screen: Screen };

function Problem({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="alert" className="border-b border-border bg-background px-3 py-1.5 text-danger">
      {text}
    </p>
  );
}

type BarsProps = PartProps & { can: Abilities; notice: string | null; now: number };

/** The menu bar, the toolbar with the proof's clock, and a problem to show under them. */
function Bars({ session, screen, can, notice, now }: BarsProps) {
  const state = session?.state ?? null;
  return (
    <>
      <MenuBar menus={pramanMenus(can, screen.shown)} onAction={screen.act}>
        <SessionStatus state={state} name={session?.name ?? ''} />
      </MenuBar>
      <ToolBar
        can={can}
        onAction={screen.act}
        progress={proofProgress(state?.snapshot ?? null, now)}
      />
      <Problem text={notice ?? state?.error ?? null} />
    </>
  );
}

type WorkspaceProps = PartProps & { can: Abilities; ceilings: PramanCeilings; now: number };

function Workspace({ session, screen, can, ceilings, now }: WorkspaceProps) {
  const { tabs } = screen;
  return (
    <div className="flex min-h-0 flex-1 gap-1 p-1">
      {screen.shown.left && (
        <LeftPanel
          snapshot={session?.state.snapshot ?? null}
          instance={screen.instance}
          onInstance={screen.setInstance}
          onOpen={(name) => tabs.open(fileTab(name))}
          onDelete={(name) => session?.actions.deleteFile(name) ?? Promise.resolve()}
        />
      )}
      <CenterPanel
        session={session}
        can={can}
        tabs={tabs.tabs}
        active={tabs.active}
        onSelect={tabs.setActive}
        onCloseTab={tabs.close}
        onAction={screen.act}
        ceilings={ceilings}
        instance={screen.instance}
        now={now}
      />
    </div>
  );
}

/** What the console needs from the session; without one it is switched off. */
function consoleOf(session: ScreenSession | null) {
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

function Docks({ session, screen }: PartProps) {
  const tcl = consoleOf(session);
  return (
    <>
      {screen.shown.log && (
        <div className="mx-1 mb-1 h-44 shrink-0 border border-border bg-background">
          <LogPanel events={session?.state.events ?? []} />
        </div>
      )}
      {screen.shown.console && (
        <div className="mx-1 mb-1 h-[4.5rem] shrink-0 border border-border">
          <TclConsole
            onCommand={tcl.run}
            disabled={tcl.disabled}
            busy={tcl.busy}
            propertyNames={tcl.names}
          />
        </div>
      )}
    </>
  );
}

function Dialogs({ session, ceilings, screen }: PartProps & { ceilings: PramanCeilings }) {
  const { dialog, closeDialog, act } = screen;
  const snapshot = session?.state.snapshot ?? null;
  const run = (line: string) => act({ kind: 'command', line });
  if (dialog === null) return null;
  if (dialog.kind === 'about') return <AboutDialog ceilings={ceilings} onClose={closeDialog} />;
  if (dialog.kind === 'dialog') {
    return (
      <CheckDialogs
        which={dialog.dialog}
        snapshot={snapshot}
        onAction={act}
        onClose={closeDialog}
      />
    );
  }
  if (dialog.kind === 'caseSplit') {
    const property = snapshot?.properties.find((each) => each.id === dialog.property);
    return property === undefined ? null : (
      <CaseSplitDialog property={property} onRun={run} onClose={closeDialog} />
    );
  }
  return (
    <CommandDialog
      spec={commandSpecs(snapshot, ceilings)[dialog.form]}
      onRun={run}
      onClose={closeDialog}
    />
  );
}
