import type { PramanCeilings } from '@siliconbox/shared';
import type { PramanSnapshot } from './praman-snapshot';
import { tclCommand } from './tcl';

/** One field of a command form; `max` caps a number at the learner's ceiling. */
type CommandField = {
  name: string;
  label: string;
  defaultValue: string;
  type: 'text' | 'number';
  max?: number;
  hint?: string;
};

export type CommandSpec = {
  title: string;
  fields: CommandField[];
  /** The Tcl line the form runs, from what was entered. */
  build: (values: Readonly<Record<string, string>>) => string;
};

export type CommandKind = 'elaborate' | 'setup' | 'limits';

const minutes = (seconds: number) => String(Math.max(1, Math.round(seconds / 60)));

function elaborateSpec(snapshot: PramanSnapshot | null): CommandSpec {
  return {
    title: 'Elaborate',
    fields: [{ name: 'top', label: 'Top module', defaultValue: snapshot?.top ?? '', type: 'text' }],
    build: ({ top = '' }) => tclCommand('elaborate', '-top', top.trim()),
  };
}

/** The reset as the form shows it: Praman's null is "not declared yet", an empty signal "none". */
function resetText(reset: PramanSnapshot['reset'] | undefined): string {
  if (reset === undefined || reset === null) return '!rst_n';
  return reset.signal === '' ? '' : `${reset.active_low ? '!' : ''}${reset.signal}`;
}

function setupSpec(snapshot: PramanSnapshot | null): CommandSpec {
  return {
    title: 'Clock and reset',
    fields: [
      { name: 'clock', label: 'Clock', defaultValue: snapshot?.clock ?? 'clk', type: 'text' },
      {
        name: 'reset',
        label: 'Reset',
        defaultValue: resetText(snapshot?.reset),
        type: 'text',
        hint: 'An expression such as !rst_n; leave it empty for a design without reset.',
      },
    ],
    build: ({ clock = '', reset = '' }) => {
      const resetLine = reset.trim() === '' ? 'reset -none' : tclCommand('reset', reset.trim());
      return `${tclCommand('clock', clock.trim())}; ${resetLine}`;
    },
  };
}

function limitsSpec(snapshot: PramanSnapshot | null, ceilings: PramanCeilings): CommandSpec {
  const proofMinutes = ceilings.proofSeconds / 60;
  const settings = snapshot?.settings;
  return {
    title: 'Proof limits',
    fields: [
      {
        name: 'minutes',
        label: 'Proof time (minutes)',
        defaultValue: minutes(settings?.time_limit ?? ceilings.proofSeconds),
        type: 'number',
        max: proofMinutes,
        hint: `Your level allows up to ${proofMinutes} minutes a proof.`,
      },
      {
        name: 'cycles',
        label: 'Trace length (cycles)',
        defaultValue: String(settings?.max_trace_length ?? 20),
        type: 'number',
        max: ceilings.traceLength,
        hint: `Your level allows up to ${ceilings.traceLength} cycles.`,
      },
    ],
    build: ({ minutes: time = '1', cycles = '20' }) =>
      `set_prove_time_limit ${Number(time)}m; set_max_trace_length ${Number(cycles)}`,
  };
}

/** The menu's command forms, filled in from the session's state and the learner's ceilings. */
export function commandSpecs(
  snapshot: PramanSnapshot | null,
  ceilings: PramanCeilings,
): Record<CommandKind, CommandSpec> {
  return {
    elaborate: elaborateSpec(snapshot),
    setup: setupSpec(snapshot),
    limits: limitsSpec(snapshot, ceilings),
  };
}
