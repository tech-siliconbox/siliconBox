import { describe, expect, it } from 'vitest';
import { abilitiesOf } from './abilities';
import { pramanMenus } from './menus';

const SHOWN = { left: true, log: true, console: false } as const;

const itemsOf = (menu: string) =>
  pramanMenus(abilitiesOf(null), SHOWN)
    .find((each) => each.label === menu)
    ?.items.filter((item) => item !== null) ?? [];

describe('pramanMenus', () => {
  it('has the menus of the tool, in order', () => {
    expect(pramanMenus(abilitiesOf(null), SHOWN).map((menu) => menu.label)).toEqual([
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
    const enabled = pramanMenus(abilitiesOf(null), SHOWN)
      .flatMap((menu) => menu.items)
      .filter((item) => item?.enabled === true && item.action.kind !== 'view')
      .map((item) => item?.label);
    expect(new Set(enabled)).toEqual(
      new Set(['New Session', 'Sessions…', 'Run History…', 'About Praman']),
    );
  });

  it('ticks the panels that are shown', () => {
    expect(itemsOf('View').map((item) => [item.label, item.checked])).toEqual([
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
