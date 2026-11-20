import type { SessionState } from './hooks/use-praman-session';
import type { PramanSnapshot } from './praman-snapshot';
import { tclCommand } from './tcl';

const SOURCE = /\.(sv|v)$/i;
/** The script Praman writes for uploaded design and SVA files. */
export const SESSION_SCRIPT = 'pm.tcl';

/** The analyze line for every design and property file of the session, or null without any. */
function analyzeLine(snapshot: PramanSnapshot | null): string | null {
  const sources = (snapshot?.files ?? []).filter((file) => SOURCE.test(file.name));
  return sources.length === 0
    ? null
    : tclCommand('analyze', '-sv', ...sources.map((file) => file.name));
}

const hasScript = (snapshot: PramanSnapshot | null) =>
  snapshot?.files.some((file) => file.name === SESSION_SCRIPT) === true;

const hasProved = (snapshot: PramanSnapshot | null) =>
  snapshot !== null && snapshot.proof.finished_at !== null;

/** What can run now; every menu item and tool is enabled from it. */
export type Abilities = {
  /** A session is chosen. */
  session: boolean;
  open: boolean;
  /** Open, and no command or proof is running. */
  idle: boolean;
  /** The analyze line, when there are sources to analyze. */
  analyze: string | null;
  elaborate: boolean;
  elaborated: boolean;
  stop: boolean;
  script: boolean;
  /** A proof has finished: its HTML report can be downloaded. */
  proved: boolean;
};

const NOTHING: Abilities = {
  session: false,
  open: false,
  idle: false,
  analyze: null,
  elaborate: false,
  elaborated: false,
  stop: false,
  script: false,
  proved: false,
};

/** What the session in `state` can do now; null while no session is chosen. */
export function abilitiesOf(state: SessionState | null): Abilities {
  if (state === null) return NOTHING;
  const open = state.place === 'open';
  const idle = open && !state.busy && !state.proofRunning;
  const { snapshot } = state;
  const phase = snapshot?.phase ?? 'empty';
  return {
    session: true,
    open,
    idle,
    analyze: idle ? analyzeLine(snapshot) : null,
    elaborate: idle && phase !== 'empty',
    elaborated: idle && phase === 'elaborated',
    stop: state.proofRunning,
    script: idle && hasScript(snapshot),
    proved: hasProved(snapshot),
  };
}
