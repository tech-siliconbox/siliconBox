import { type Abilities, SESSION_SCRIPT } from './abilities';
import type { Panel, ToolAction } from './tool-actions';

export type MenuItem = {
  label: string;
  action: ToolAction;
  enabled: boolean;
  /** The Tcl command the item stands for, shown beside it. */
  hint?: string;
  /** For a View item: whether its panel is shown. */
  checked?: boolean;
};

/** A menu of the menu bar; `null` draws a separator line. */
export type Menu = { label: string; items: (MenuItem | null)[] };

const command = (label: string, line: string, enabled: boolean): MenuItem => ({
  label,
  action: { kind: 'command', line },
  enabled,
  hint: line,
});

function fileMenu(can: Abilities): Menu {
  return {
    label: 'File',
    items: [
      { label: 'New Session', action: { kind: 'newSession' }, enabled: true },
      { label: 'Sessions…', action: { kind: 'sessions' }, enabled: true },
      null,
      { label: 'Add Files…', action: { kind: 'addFiles' }, enabled: can.open },
      command('Run Script', `source ${SESSION_SCRIPT}`, can.script),
      { label: 'Load Example Files', action: { kind: 'example' }, enabled: can.open },
      null,
      { label: 'Save Session Script', action: { kind: 'download' }, enabled: can.session },
      { label: 'Run History…', action: { kind: 'history' }, enabled: true },
    ],
  };
}

function viewMenu(shown: Readonly<Record<Panel, boolean>>): Menu {
  const toggle = (label: string, panel: Panel): MenuItem => ({
    label,
    action: { kind: 'view', panel },
    enabled: true,
    checked: shown[panel],
  });
  return {
    label: 'View',
    items: [toggle('Design Hierarchy', 'left'), toggle('Log', 'log'), toggle('Console', 'console')],
  };
}

function designMenu(can: Abilities): Menu {
  return {
    label: 'Design',
    items: [
      {
        ...command('Analyze All Source Files', can.analyze ?? '', can.analyze !== null),
        hint: 'analyze -sv',
      },
      { label: 'Elaborate…', action: { kind: 'form', form: 'elaborate' }, enabled: can.elaborate },
      {
        label: 'Clock and Reset…',
        action: { kind: 'form', form: 'setup' },
        enabled: can.elaborated,
      },
      null,
      command('Clear All', 'clear -all', can.idle),
    ],
  };
}

function proveMenu(can: Abilities): Menu {
  return {
    label: 'Prove',
    items: [
      command('Prove All', 'prove -all', can.elaborated),
      { label: 'Stop', action: { kind: 'stop' }, enabled: can.stop, hint: 'stop' },
      null,
      command('Check Assumptions', 'check_assumptions', can.elaborated),
      command('Check Dead Ends', 'check_assumptions -dead_end', can.elaborated),
      command('Check Reset', 'check_reset', can.elaborated),
      null,
      { label: 'Proof Limits…', action: { kind: 'form', form: 'limits' }, enabled: can.open },
    ],
  };
}

function reportsMenu(can: Abilities): Menu {
  return {
    label: 'Reports',
    items: [
      command('Summary', 'report', can.elaborated),
      command('Design Information', 'get_design_info', can.elaborated),
      null,
      { label: 'Run History…', action: { kind: 'history' }, enabled: true },
    ],
  };
}

const TOOLS_MENU: Menu = {
  label: 'Tools',
  items: [
    { label: 'Run History…', action: { kind: 'history' }, enabled: true },
    { label: 'Sessions…', action: { kind: 'sessions' }, enabled: true },
  ],
};

/** Praman's menu bar: every item, enabled only when it can run now. */
export function pramanMenus(can: Abilities, shown: Readonly<Record<Panel, boolean>>): Menu[] {
  return [
    fileMenu(can),
    viewMenu(shown),
    designMenu(can),
    proveMenu(can),
    reportsMenu(can),
    TOOLS_MENU,
    {
      label: 'Help',
      items: [
        command('Commands', 'help', can.open),
        { label: 'About Praman', action: { kind: 'about' }, enabled: true },
      ],
    },
  ];
}
