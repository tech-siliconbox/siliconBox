'use client';

import { API_ROUTES, type PramanCeilings } from '@siliconbox/shared';
import { useRef, useState } from 'react';
import { abilitiesOf } from '../abilities';
import { type CommandKind, commandSpecs } from '../command-specs';
import type { SessionActions, SessionState } from '../hooks/use-praman-session';
import { pramanMenus } from '../menus';
import type { Panel, ToolAction } from '../tool-actions';
import { AboutDialog } from './about-dialog';
import { CenterPanel, HISTORY_TAB, PROPERTIES_TAB, fileTab } from './center-panel';
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
};

type SimpleKind = Exclude<ToolAction['kind'], 'command' | 'form' | 'view'>;

/** Tabs open after the property table: files and the run history. */
function useTabs() {
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string>(PROPERTIES_TAB);
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

/** The screen's own state: panels shown, open tabs, dialogs, and what each action does. */
function useScreen(
  { session, onNewSession, onSessions }: PramanScreenProps,
  openPicker: () => void,
) {
  const actions = session?.actions ?? null;
  const [shown, setShown] = useState<Record<Panel, boolean>>({
    left: true,
    log: true,
    console: true,
  });
  const [form, setForm] = useState<CommandKind | null>(null);
  const [about, setAbout] = useState(false);
  const tabs = useTabs();
  const simple: Record<SimpleKind, () => void> = {
    newSession: onNewSession,
    sessions: onSessions,
    addFiles: openPicker,
    example: () => void actions?.loadExample(),
    download: () => session && window.location.assign(API_ROUTES.toolSessionScript(session.id)),
    stop: () => void actions?.stop(),
    history: () => tabs.open(HISTORY_TAB),
    about: () => setAbout(true),
  };
  const act = (action: ToolAction) => {
    if (action.kind === 'command') void actions?.command(action.line);
    else if (action.kind === 'form') setForm(action.form);
    else if (action.kind === 'view') setShown({ ...shown, [action.panel]: !shown[action.panel] });
    else simple[action.kind]();
  };
  const dialogs = {
    form,
    about,
    closeForm: () => setForm(null),
    closeAbout: () => setAbout(false),
  };
  return { shown, tabs, act, dialogs, openPicker };
}

type Screen = ReturnType<typeof useScreen>;

/** Praman as the learner sees it: menu bar, toolbar, panels, log, console and status bar. */
export function PramanScreen(props: PramanScreenProps) {
  const { session, ceilings, notice } = props;
  const state = session?.state ?? null;
  const picker = useRef<HTMLInputElement>(null);
  const screen = useScreen(props, () => picker.current?.click());
  const can = abilitiesOf(state);
  const problem = notice ?? state?.error ?? null;
  const addFiles = async (files: { name: string; text: string }[]) => {
    for (const file of files) await session?.actions.putFile(file.name, file.text);
  };
  return (
    <div className="flex h-full min-h-0 flex-col border border-border bg-muted text-[13px]">
      <MenuBar menus={pramanMenus(can, screen.shown)} onAction={screen.act}>
        <SessionStatus state={state} name={session?.name ?? ''} />
      </MenuBar>
      <ToolBar can={can} onAction={screen.act} />
      {problem !== null && (
        <p role="alert" className="border-b border-border bg-background px-3 py-1.5 text-danger">
          {problem}
        </p>
      )}
      <Workspace session={session} screen={screen} onNewSession={props.onNewSession} />
      <Docks session={session} screen={screen} />
      <StatusBar state={state} />
      <FilePicker ref={picker} onAdd={addFiles} />
      <Dialogs session={session} ceilings={ceilings} screen={screen} />
    </div>
  );
}

type PartProps = { session: ScreenSession | null; screen: Screen };

function Workspace({ session, screen, onNewSession }: PartProps & { onNewSession: () => void }) {
  const { tabs } = screen;
  return (
    <div className="flex min-h-0 flex-1 gap-1 p-1">
      {screen.shown.left && (
        <LeftPanel
          snapshot={session?.state.snapshot ?? null}
          onOpen={(name) => tabs.open(fileTab(name))}
          onDelete={(name) => session?.actions.deleteFile(name) ?? Promise.resolve()}
        />
      )}
      <CenterPanel
        session={session}
        tabs={tabs.tabs}
        active={tabs.active}
        onSelect={tabs.setActive}
        onCloseTab={tabs.close}
        onNewSession={onNewSession}
        onAddFiles={screen.openPicker}
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
  const { form, about, closeForm, closeAbout } = screen.dialogs;
  return (
    <>
      {form !== null && session !== null && (
        <CommandDialog
          spec={commandSpecs(session.state.snapshot, ceilings)[form]}
          onRun={session.actions.command}
          onClose={closeForm}
        />
      )}
      {about && <AboutDialog ceilings={ceilings} onClose={closeAbout} />}
    </>
  );
}
