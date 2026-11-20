import type { CommandKind } from './command-specs';

/** The deeper checks' result panels, opened in the centre beside the property table. */
export type ReportTab = 'strength' | 'coverage' | 'equivalence';

/** The deeper checks' own dialogs. */
export type CheckDialog = 'equivalence' | 'connectivity' | 'task' | 'abstract';

/** The panels the View menu shows or hides. */
export type Panel = 'left' | 'log' | 'console';

/** A line of a file to show (from 1). */
export type FileLine = { name: string; line: number };

/** Everything a menu item or a tool does, as data the screen carries out. */
export type ToolAction =
  | { kind: 'command'; line: string }
  | { kind: 'form'; form: CommandKind }
  | { kind: 'dialog'; dialog: CheckDialog }
  /** Runs the check (when there is a line) and shows its result panel. */
  | { kind: 'report'; tab: ReportTab; line: string | null }
  | { kind: 'downloadReport' }
  /** Opens a session file in the editor, at `line` (from 1) when there is one. */
  | { kind: 'openFile'; name: string; line?: number }
  | { kind: 'caseSplit'; property: string }
  /** Opens another of the learner's sessions (one restored from a run). */
  | { kind: 'openSession'; sessionId: string }
  | { kind: 'newSession' }
  | { kind: 'sessions' }
  | { kind: 'addFiles' }
  | { kind: 'example' }
  | { kind: 'download' }
  | { kind: 'stop' }
  | { kind: 'history' }
  | { kind: 'view'; panel: Panel }
  | { kind: 'about' }
  /** Shows how Praman works and how to use it. */
  | { kind: 'guide' };
