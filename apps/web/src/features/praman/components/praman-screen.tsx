'use client';

import { API_ROUTES, type PramanCeilings } from '@siliconbox/shared';
import { useRef, useState } from 'react';
import { commandSpecs } from '../command-specs';
import { resetLayout, resizePanel, togglePanel, useLayout } from '../hooks/use-layout';
import { useNow } from '../hooks/use-now';
import type { SessionActions, SessionState } from '../hooks/use-praman-session';
import { pramanMenus } from '../menus';
import { proofProgress } from '../proof-clock';
import type { TextFile } from '../read-files';
import { tclCommand } from '../tcl';
import type { FileLine, ToolAction } from '../tool-actions';
import { type OpenTrace, propertyTrace } from '../trace-tools';
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
import { ClockResetDialog } from './clock-reset-dialog';
import { CommandDialog } from './command-dialog';
import { DropFiles } from './drop-files';
import { FilePicker } from './file-picker';
import { LeftPanel } from './left-panel';
import { MenuBar } from './menu-bar';
import { ScreenDocks } from './screen-docks';
import { SessionStatus } from './session-status';
import { Splitter } from './splitter';
import { StatusBar } from './status-bar';
import { ToolBar } from './tool-bar';
import { VisualizeWindow } from './visualize/visualize-window';

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
  | 'command'
  | 'report'
  | 'view'
  | 'openFile'
  | 'openSession'
  | 'form'
  | 'dialog'
  | 'caseSplit'
  | 'trace'
  | 'copy'
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

type Tabs = ReturnType<typeof useTabs>;

/**
 * Where the learner's attention is: the file and line last asked for (from a property, the
 * hierarchy, coverage or the log), the property chosen in the table, and the instance chosen in
 * the hierarchy ('' for all).
 */
function useFocus(tabs: Tabs) {
  const [goto, setGoto] = useState<FileLine | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [instance, setInstance] = useState('');
  const openFile = (name: string, line = 0) => {
    tabs.open(fileTab(name));
    // A new object each time, so asking for the same line again shows it again.
    if (line > 0) setGoto({ name, line });
  };
  const showProperty = (id: string) => {
    setSelected(id);
    tabs.setActive(PROPERTIES_TAB);
  };
  return { goto, openFile, selected, setSelected, showProperty, instance, setInstance };
}

type Pickers = { files: () => void; script: () => void };

/** The actions that need nothing but the session and the screen's own parts. */
function simpleActions(
  { session, onNewSession, onSessions }: PramanScreenProps,
  { tabs, pickers, about }: { tabs: Tabs; pickers: Pickers; about: () => void },
): Record<SimpleKind, () => void> {
  const actions = session?.actions ?? null;
  return {
    newSession: onNewSession,
    sessions: onSessions,
    addFiles: pickers.files,
    scriptFile: pickers.script,
    example: () => void actions?.loadExample(),
    download: () => session && window.location.assign(API_ROUTES.toolSessionScript(session.id)),
    downloadReport: () =>
      session && window.location.assign(API_ROUTES.toolSessionReport(session.id)),
    stop: () => void actions?.stop(),
    history: () => tabs.open(HISTORY_TAB),
    guide: () => tabs.open(GUIDE_TAB),
    about,
    resetLayout,
  };
}

/** Copies text to the clipboard; a browser that refuses (no permission) copies nothing. */
const copyText = (text: string) => void navigator.clipboard.writeText(text).catch(() => undefined);

/** The screen's own state: open tabs, the focus, the dialog and trace, what each action does. */
function useScreen(props: PramanScreenProps, pickers: Pickers) {
  const { session } = props;
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [trace, setTrace] = useState<OpenTrace | null>(null);
  const tabs = useTabs(session !== null);
  const focus = useFocus(tabs);
  const about = () => setDialog({ kind: 'about' });
  const simple = simpleActions(props, { tabs, pickers, about });
  const openTrace = (id: string) => {
    const property = session?.state.snapshot?.properties.find((each) => each.id === id);
    if (session !== null && property !== undefined) setTrace(propertyTrace(session.id, property));
  };
  const check = (action: Extract<ToolAction, { kind: 'command' | 'report' }>) => {
    if (action.line !== null) void session?.actions.command(action.line);
    if (action.kind === 'report') tabs.open(reportTab(action.tab));
  };
  const act = (action: ToolAction) => {
    if (action.kind === 'command' || action.kind === 'report') check(action);
    else if (action.kind === 'view') togglePanel(action.panel);
    else if (action.kind === 'openFile') focus.openFile(action.name, action.line);
    else if (action.kind === 'openSession') props.onOpenSession(action.sessionId);
    else if (action.kind === 'trace') openTrace(action.property);
    else if (action.kind === 'copy') copyText(action.text);
    else if (opensDialog(action)) setDialog(action);
    else simple[action.kind]();
  };
  return { tabs, focus, act, dialog, closeDialog: () => setDialog(null), trace, setTrace };
}

type Screen = ReturnType<typeof useScreen>;

/** Adds files to the session, or adds a script and runs it. */
function fileActions(session: ScreenSession | null) {
  const add = async (files: TextFile[]) => {
    for (const file of files) await session?.actions.putFile(file.name, file.text);
  };
  const runScript = async ([script]: TextFile[]) => {
    if (session === null || script === undefined) return;
    if ((await session.actions.putFile(script.name, script.text)) !== null) return;
    await session.actions.command(tclCommand('source', script.name));
  };
  return { add, runScript };
}

/** Praman as the learner sees it: menu bar, toolbar, panels, log, console and status bar. */
export function PramanScreen(props: PramanScreenProps) {
  const { session, ceilings, notice } = props;
  const state = session?.state ?? null;
  const files = useRef<HTMLInputElement>(null);
  const script = useRef<HTMLInputElement>(null);
  const pickers = { files: () => files.current?.click(), script: () => script.current?.click() };
  const screen = useScreen(props, pickers);
  // The ref apart from the layout: refs are not read while rendering.
  const { shown, root } = useLayout();
  const can = abilitiesOf(state);
  const now = useNow(state?.proofRunning === true);
  const add = fileActions(session);
  return (
    <DropFiles ref={root} onDrop={session === null ? null : add.add}>
      <Bars session={session} screen={screen} can={can} shown={shown} notice={notice} now={now} />
      <Workspace
        session={session}
        screen={screen}
        can={can}
        shown={shown}
        ceilings={ceilings}
        now={now}
      />
      <ScreenDocks
        session={session}
        shown={shown}
        selected={screen.focus.selected}
        onLocation={screen.focus.openFile}
        onProperty={screen.focus.showProperty}
      />
      <StatusBar state={state} />
      <FilePicker ref={files} onAdd={add.add} />
      <FilePicker ref={script} onAdd={add.runScript} accept=".tcl" multiple={false} />
      <Dialogs session={session} ceilings={ceilings} screen={screen} />
      <Trace session={session} screen={screen} />
    </DropFiles>
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

/** Which panels show (the View menu ticks them). */
type Shown = ReturnType<typeof useLayout>['shown'];

type BarsProps = PartProps & { can: Abilities; shown: Shown; notice: string | null; now: number };

/** The menu bar, the toolbar with the proof's clock, and a problem to show under them. */
function Bars({ session, screen, can, shown, notice, now }: BarsProps) {
  const state = session?.state ?? null;
  return (
    <>
      <MenuBar menus={pramanMenus(can, shown, selectedOf(session, screen))} onAction={screen.act}>
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

type WorkspaceProps = PartProps & {
  can: Abilities;
  shown: Shown;
  ceilings: PramanCeilings;
  now: number;
};

function Workspace({ session, screen, can, shown, ceilings, now }: WorkspaceProps) {
  const { tabs } = screen;
  return (
    <div className="flex min-h-0 flex-1 gap-0.5 p-1">
      {shown.left && (
        <>
          <LeftPanel
            snapshot={session?.state.snapshot ?? null}
            instance={screen.focus.instance}
            onInstance={screen.focus.setInstance}
            onOpen={screen.focus.openFile}
            onDelete={(name) => session?.actions.deleteFile(name) ?? Promise.resolve()}
          />
          <Splitter
            label="Resize the design panel"
            orientation="vertical"
            onMove={(by) => resizePanel('left', by)}
          />
        </>
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
        instance={screen.focus.instance}
        now={now}
        goto={screen.focus.goto}
        selected={screen.focus.selected}
        onSelectProperty={screen.focus.setSelected}
        onOpenTrace={screen.setTrace}
      />
    </div>
  );
}

/** The property chosen in the table, when there is one. */
const selectedOf = (session: ScreenSession | null, screen: Screen) =>
  session?.state.snapshot?.properties.find((each) => each.id === screen.focus.selected) ?? null;

/** Visualize, over the tool, for the trace asked for. */
function Trace({ session, screen }: PartProps) {
  const { trace, setTrace } = screen;
  if (trace === null) return null;
  const snapshot = session?.state.snapshot ?? null;
  return (
    <VisualizeWindow
      key={trace.url}
      {...trace}
      top={snapshot?.top ?? ''}
      reset={snapshot?.reset ?? null}
      onClose={() => setTrace(null)}
    />
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
  if (dialog.form === 'setup') {
    return <ClockResetDialog snapshot={snapshot} onRun={run} onClose={closeDialog} />;
  }
  return (
    <CommandDialog
      spec={commandSpecs(snapshot, ceilings)[dialog.form]}
      onRun={run}
      onClose={closeDialog}
    />
  );
}
