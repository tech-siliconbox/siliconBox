import { describe, expect, it } from 'vitest';
import { abilitiesOf } from './abilities';
import type { SessionState } from './hooks/use-praman-session';
import { pramanMenus, propertyMenu } from './menus';
import { PramanPropertySchema, PramanSnapshotSchema } from './praman-snapshot';

const SHOWN = { left: true, log: true, console: false } as const;

const itemsOf = (menu: string) =>
  pramanMenus(abilitiesOf(null), SHOWN, null)
    .find((each) => each.label === menu)
    ?.items.filter((item) => item !== null) ?? [];

describe('pramanMenus', () => {
  it('has the menus of the tool, in order', () => {
    expect(pramanMenus(abilitiesOf(null), SHOWN, null).map((menu) => menu.label)).toEqual([
      'File',
      'View',
      'Design',
      'Prove',
      'Reports',
      'Tools',
      'Help',
    ]);
  });

  it('without a session, offers only starting one, choosing one and the run history', () => {
    const enabled = pramanMenus(abilitiesOf(null), SHOWN, null)
      .flatMap((menu) => menu.items)
      .filter((item) => item?.enabled === true && item.action.kind !== 'view')
      .map((item) => item?.label);
    expect(new Set(enabled)).toEqual(
      new Set([
        'New Session',
        'Sessions…',
        'Run History…',
        'Reset Layout',
        'How Praman Works',
        'About Praman',
      ]),
    );
  });

  it('ticks the panels that are shown', () => {
    const panels = itemsOf('View').filter((item) => item.action.kind === 'view');
    expect(panels.map((item) => [item.label, item.checked])).toEqual([
      ['Design Hierarchy', true],
      ['Log', true],
      ['Console', false],
    ]);
  });

  it('shows the Tcl command a menu item runs', () => {
    expect(itemsOf('Prove').find((item) => item.label === 'Check Dead Ends')?.hint).toBe(
      'check_assumptions -dead_end',
    );
  });
});

const property = (fields: object) =>
  PramanPropertySchema.parse({
    id: 'a_flags',
    name: 'fifo.u.a_flags',
    type: 'assert',
    instance: 'u',
    ...fields,
  });

const elaborated: SessionState = {
  place: 'open',
  position: null,
  events: [],
  busy: false,
  proofRunning: false,
  secondsLeft: 3600,
  error: null,
  link: { state: 'live', ms: 40 },
  snapshot: PramanSnapshotSchema.parse({
    label: 'S',
    phase: 'elaborated',
    busy: false,
    top: 'fifo',
    clock: 'clk',
    reset: null,
    tree: null,
    files: [],
    properties: [],
    settings: { time_limit: 300, per_property_time_limit: 300, max_trace_length: 20 },
    proof: { running: false, started_at: null, total: 0, time_limit: 300 },
  }),
};

const enabledOf = (items: ReturnType<typeof propertyMenu>) =>
  items.filter((item) => item?.enabled === true).map((item) => item?.label);

describe('propertyMenu', () => {
  it('proves, disables and splits an assertion of the design, and shows its source', () => {
    const items = propertyMenu(
      property({ file: 'fifo_sva.sv', status: 'cex' }),
      [],
      abilitiesOf(elaborated),
    );
    expect(enabledOf(items)).toEqual([
      'Prove Property',
      'Show Source',
      'Disable',
      'Case Split…',
      'Copy Name',
    ]);
    expect(items[0]?.hint).toBe('prove -property fifo.u.a_flags');
  });

  it('asks for the needed assumptions of a proven assertion, and undoes a split', () => {
    const proven = property({ status: 'proven', file: 'Tcl', disabled: true });
    const cases = [property({ id: 'a_flags:case1', parent: 'a_flags', related: 'case' })];
    const items = propertyMenu(proven, cases, abilitiesOf(elaborated));
    expect(enabledOf(items)).toEqual([
      'Prove Property',
      'Needed Assumptions',
      'Enable',
      'Remove',
      'Case Split…',
      'Remove Case Split',
      'Copy Name',
    ]);
  });

  it('opens the trace of a property that has one', () => {
    const items = propertyMenu(property({ has_trace: true }), [], abilitiesOf(null));
    expect(items.find((item) => item?.label === 'View Trace')?.action).toEqual({
      kind: 'trace',
      property: 'a_flags',
    });
    expect(enabledOf(items)).toEqual(['View Trace', 'Copy Name']);
  });

  it('offers nothing to run without an elaborated, idle session', () => {
    expect(enabledOf(propertyMenu(property({}), [], abilitiesOf(null)))).toEqual(['Copy Name']);
  });
});

describe('Prove Selected Property', () => {
  const proveSelected = (selected: ReturnType<typeof property> | null) =>
    pramanMenus(abilitiesOf(elaborated), SHOWN, selected)
      .find((menu) => menu.label === 'Prove')
      ?.items.find((item) => item?.label === 'Prove Selected Property');

  it('proves the property chosen in the table', () => {
    const item = proveSelected(property({}));
    expect(item?.enabled).toBe(true);
    expect(item?.hint).toBe('prove -property fifo.u.a_flags');
  });

  it('waits for a property to be chosen', () => {
    expect(proveSelected(null)?.enabled).toBe(false);
  });
});
