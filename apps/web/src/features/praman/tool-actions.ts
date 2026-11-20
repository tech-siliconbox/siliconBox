import type { CommandKind } from './command-specs';

/** The panels the View menu shows or hides. */
export type Panel = 'left' | 'log' | 'console';

/** Everything a menu item or a tool does, as data the screen carries out. */
export type ToolAction =
  | { kind: 'command'; line: string }
  | { kind: 'form'; form: CommandKind }
  | { kind: 'newSession' }
  | { kind: 'sessions' }
  | { kind: 'addFiles' }
  | { kind: 'example' }
  | { kind: 'download' }
  | { kind: 'stop' }
  | { kind: 'history' }
  | { kind: 'view'; panel: Panel }
  | { kind: 'about' };
