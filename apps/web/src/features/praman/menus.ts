import { type Abilities, SESSION_SCRIPT } from './abilities';
import type { PramanProperty } from './praman-snapshot';
import { tclWord } from './tcl';
import type { CheckDialog, Panel, ReportTab, ToolAction } from './tool-actions';

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

/** Runs a check and shows its result panel. */
const report = (label: string, tab: ReportTab, line: string, enabled: boolean): MenuItem => ({
  label,
  action: { kind: 'report', tab, line },
  enabled,
  hint: line,
});

/** Opens a check's dialog, which builds its command. */
const dialog = (label: string, which: CheckDialog, hint: string, enabled: boolean): MenuItem => ({
  label,
  action: { kind: 'dialog', dialog: which },
  enabled,
  hint,
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
      dialog('Load Connectivity…', 'connectivity', 'check_conn', can.elaborated),
      dialog('New Task…', 'task', 'task -create', can.elaborated),
      dialog('Abstract a Register…', 'abstract', 'abstract', can.elaborated),
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
      report('Assertion Strength', 'strength', 'check_strength', can.elaborated),
      report('Formal Coverage', 'coverage', 'check_cov', can.elaborated),
      report('Proof Core', 'coverage', 'check_cov -type proof', can.elaborated),
      dialog('Equivalence Check…', 'equivalence', 'check_equivalence', can.elaborated),
      null,
      { label: 'Download Report', action: { kind: 'downloadReport' }, enabled: can.proved },
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
        { label: 'How Praman Works', action: { kind: 'guide' }, enabled: true },
        { label: 'About Praman', action: { kind: 'about' }, enabled: true },
      ],
    },
  ];
}

const provable = (p: PramanProperty, can: Abilities) =>
  can.elaborated && p.supported && (p.type === 'assert' || p.type === 'cover');

/** A proven assertion or an unreachable cover: the assumptions it needs can be found. */
const decided = (p: PramanProperty) =>
  p.type === 'assert' ? p.status === 'proven' : p.type === 'cover' && p.status === 'unreachable';

/** The table's own properties (not related covers or cases) can be disabled or split. */
const shapeable = (p: PramanProperty, can: Abilities) =>
  can.elaborated && p.supported && p.parent === '';

/** The menu of one row of the property table: prove it alone, and shape how it is proven. */
export function propertyMenu(
  property: PramanProperty,
  properties: readonly PramanProperty[],
  can: Abilities,
): (MenuItem | null)[] {
  const name = tclWord(property.name.split(':')[0] ?? property.name);
  const ownOrCase = property.parent === '' || property.related === 'case';
  const split = properties.some((p) => p.parent === property.id && p.related === 'case');
  const toggle = property.disabled ? '-enable' : '-disable';
  return [
    command('Prove Property', `prove -property ${name}`, provable(property, can)),
    command(
      'Needed Assumptions',
      `get_needed_assumptions -property ${name}`,
      can.elaborated && decided(property) && ownOrCase,
    ),
    {
      label: 'Show Source',
      action: { kind: 'openFile', name: property.file, line: property.line },
      enabled: !['', 'Tcl'].includes(property.file),
    },
    null,
    command(
      property.disabled ? 'Enable' : 'Disable',
      `${property.type} ${toggle} ${name}`,
      shapeable(property, can),
    ),
    command(
      'Remove',
      `${property.type} -remove ${name}`,
      shapeable(property, can) && property.file === 'Tcl',
    ),
    null,
    {
      label: 'Case Split…',
      action: { kind: 'caseSplit', property: property.id },
      enabled: shapeable(property, can) && property.type === 'assert',
    },
    command('Remove Case Split', `case_split -property ${name} -clear`, can.elaborated && split),
  ];
}
