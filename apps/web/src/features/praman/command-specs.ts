import type { PramanCeilings } from '@siliconbox/shared';
import type { PramanSnapshot, Port } from './praman-snapshot';
import { tclCommand } from './tcl';

/** One field of a command form; `max` caps a number at the learner's ceiling. */
type CommandField = {
  name: string;
  label: string;
  defaultValue: string;
  /** A check box sends 'on' when ticked (its default is 'on' or ''). */
  type: 'text' | 'number' | 'check';
  max?: number;
  hint?: string;
};

export type CommandSpec = {
  title: string;
  fields: CommandField[];
  /** The Tcl line the form runs, from what was entered. */
  build: (values: Readonly<Record<string, string>>) => string;
};

/** The menu's command forms; Clock and Reset has a dialog of its own. */
export type CommandKind = 'elaborate' | 'setup' | 'limits';
type SpecKind = Exclude<CommandKind, 'setup'>;

const minutes = (seconds: number) => String(Math.max(1, Math.round(seconds / 60)));

function elaborateSpec(snapshot: PramanSnapshot | null): CommandSpec {
  return {
    title: 'Elaborate',
    fields: [
      { name: 'top', label: 'Top module', defaultValue: snapshot?.top ?? '', type: 'text' },
      {
        name: 'witness',
        label: 'Witness covers, besides the precondition covers',
        defaultValue: 'on',
        type: 'check',
        hint: 'For an assertion a |-> b: a cover that a happens and b holds.',
      },
    ],
    build: ({ top = '', witness = '' }) =>
      tclCommand(
        'elaborate',
        '-top',
        top.trim(),
        ...(witness === 'on' ? [] : ['-create_related_covers', 'precondition']),
      ),
  };
}

/** The Clock and Reset dialog's choices: the clock, the reset signal and whether it is low. */
export type ClockReset = { clock: string; reset: string; low: boolean };

/** The 1-bit inputs of the top module: what can be a clock or a reset. */
export const bitInputs = (ports: readonly Port[]) =>
  ports.filter((port) => port.direction === 'input' && port.width === 1).map((port) => port.name);

/** What the dialog shows first: the declared clock and reset, else what Praman found. */
export function clockResetDefaults(snapshot: PramanSnapshot | null): ClockReset {
  if (snapshot === null) return { clock: '', reset: '', low: true };
  const { detected, reset } = snapshot;
  const inputs = bitInputs(snapshot.ports);
  const clock = snapshot.clock ?? detected.clocks.find((name) => inputs.includes(name)) ?? '';
  return reset === null
    ? { clock, reset: detected.signal, low: detected.active_low ?? true }
    : { clock, reset: reset.signal, low: reset.active_low };
}

/** The Tcl the dialog runs: `clock` and `reset`, or -none for either. */
export function clockResetLine({ clock, reset, low }: ClockReset): string {
  const clockLine = clock === '' ? 'clock -none' : tclCommand('clock', clock);
  const resetLine = reset === '' ? 'reset -none' : tclCommand('reset', `${low ? '!' : ''}${reset}`);
  return `${clockLine}; ${resetLine}`;
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
        name: 'each',
        label: 'Limit of one engine run (minutes)',
        defaultValue: minutes(settings?.per_property_time_limit ?? ceilings.proofSeconds),
        type: 'number',
        max: proofMinutes,
        hint: 'The longest any one property may take, so a hard one cannot hold up the rest.',
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
    build: ({ minutes: time = '1', each = time, cycles = '20' }) =>
      [
        `set_prove_time_limit ${Number(time)}m`,
        `set_prove_per_property_time_limit ${Number(each)}m`,
        `set_max_trace_length ${Number(cycles)}`,
      ].join('; '),
  };
}

/** The menu's command forms, filled in from the session's state and the learner's ceilings. */
export function commandSpecs(
  snapshot: PramanSnapshot | null,
  ceilings: PramanCeilings,
): Record<SpecKind, CommandSpec> {
  return {
    elaborate: elaborateSpec(snapshot),
    limits: limitsSpec(snapshot, ceilings),
  };
}
