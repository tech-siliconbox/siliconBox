import {
  type PramanCeilings,
  TOOL_IDLE_MINUTES,
  TOOL_RETENTION_DAYS,
  TOOL_SESSIONS_KEPT,
} from '@siliconbox/shared';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { SESSION_SCRIPT } from '../abilities';
import { StatusIcon } from './status-icon';
import { Code } from './welcome';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

const STEPS: readonly [string, ReactNode][] = [
  [
    'Add Files',
    'Your design (.sv, .v) and its properties: SVA assertions, assumptions and covers.',
  ],
  ['Analyze', 'Praman reads the files and checks their syntax.'],
  ['Elaborate', 'Choose the top module; Praman builds the design and lists every property.'],
  [
    'Clock / Reset',
    <>
      Name the clock and the reset (for example <Code>clk</Code> and <Code>!rst_n</Code>).
    </>,
  ],
  [
    'Prove',
    'Formal engines check every property for every input sequence, not just the ones a test would try.',
  ],
  ['Read the results', 'Each property gets a result in the Properties Table (below).'],
  ['Debug', 'Open the waveform of a failing assertion to see the exact cycles that break it.'],
];

const RESULTS: readonly [Parameters<typeof StatusIcon>[0]['status'], string][] = [
  ['proven', 'Proven: the assertion holds for every input, at any depth.'],
  ['covered', 'Covered: the cover can happen; its trace shows how.'],
  ['cex', 'Counterexample: the assertion fails; its waveform shows how.'],
  ['unreachable', 'Unreachable: the cover can never happen.'],
  ['undetermined', 'Undetermined: no answer within the proof time (Bound shows how deep it got).'],
  ['running', 'Running: the engines are still working on it.'],
  ['not_run', 'Not run: prove to check it.'],
];

/** How Praman works and how to use it, step by step, with the learner's own limits. */
export function HowItWorks({
  ceilings,
  onNewSession,
}: {
  ceilings: PramanCeilings;
  /** Without a session, the guide starts one. */
  onNewSession?: () => void;
}) {
  return (
    <article className="flex max-w-3xl flex-col gap-6 p-6 text-[13px] leading-relaxed text-muted-foreground">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-tight text-foreground">How Praman works</h2>
        <p>
          Praman is a formal verification tool. You describe what your design must do as properties,
          and Praman proves them for every possible input, or shows the exact trace that breaks one.
          There is no testbench to write.
        </p>
        {onNewSession !== undefined && (
          <div>
            <Button size="sm" onClick={onNewSession}>
              New Session
            </Button>
          </div>
        )}
      </header>
      <Flow />
      <Results />
      <Deeper />
      <Console />
      <Limits ceilings={ceilings} />
    </article>
  );
}

function Flow() {
  return (
    <Section title="The flow, button by button">
      <ol className="ml-5 flex list-decimal flex-col gap-1">
        {STEPS.map(([step, what]) => (
          <li key={step}>
            <b className="text-foreground">{step}:</b> {what}
          </li>
        ))}
      </ol>
      <p>
        Short on time? <b className="text-foreground">Load Example Files</b> (File menu) adds a
        small FIFO with a bug, and Praman writes <Code>{SESSION_SCRIPT}</Code> for any design and
        SVA files you add: <b className="text-foreground">Run Script</b> runs every step at once.
      </p>
    </Section>
  );
}

function Results() {
  return (
    <Section title="Reading the results">
      <ul className="flex flex-col gap-1">
        {RESULTS.map(([status, meaning]) => (
          <li key={status} className="flex items-center gap-2">
            <StatusIcon status={status} size={14} />
            {meaning}
          </li>
        ))}
      </ul>
      <p>
        Filter the table by result, type or name; choose an instance in the Design Hierarchy to see
        only its properties. The ⋯ menu of a row proves it alone, finds the assumptions it needs, or
        splits it into cases. In the waveform, <b className="text-foreground">Drivers</b> shows what
        set a signal, <b className="text-foreground">What If…</b> proves again with values you pin,
        and <b className="text-foreground">Quiet Trace</b> finds the calmest failing trace.
      </p>
    </Section>
  );
}

function Deeper() {
  return (
    <Section title="Going deeper">
      <p>
        <b className="text-foreground">Reports:</b> Assertion Strength (would your assertions notice
        a bug?), Formal Coverage (can every branch be reached?), Proof Core (which lines do the
        proofs rely on?) and Equivalence Check (does a revised design behave the same?).{' '}
        <b className="text-foreground">Prove:</b> check your assumptions, dead ends and reset; load
        connectivity checks from a spreadsheet; make tasks with their own assumptions; abstract a
        register to make a hard proof easier.
      </p>
    </Section>
  );
}

function Console() {
  return (
    <Section title="The Tcl console">
      <p>
        Every button runs a Tcl command, which the log shows after <Code>%</Code>. Type them
        yourself in the console: <Code>help</Code> lists them all, Tab completes a command or a
        property name, and the arrows bring back earlier lines. File &gt; Save Session Script keeps
        everything you ran as a script to run again.
      </p>
    </Section>
  );
}

function Limits({ ceilings }: { ceilings: PramanCeilings }) {
  return (
    <Section title="Your limits">
      <ul className="ml-5 list-disc">
        <li>
          Each proof runs up to {ceilings.proofSeconds / 60} minutes, and traces reach{' '}
          {ceilings.traceLength} cycles (set them lower in Prove &gt; Proof Limits).
        </li>
        <li>
          {ceilings.dailySeconds / 60} proof minutes a day: the time engines really run, shown in
          the status bar.
        </li>
        <li>
          You keep up to {TOOL_SESSIONS_KEPT} sessions for {TOOL_RETENTION_DAYS} days. One is open
          at a time; it closes after {TOOL_IDLE_MINUTES} minutes without a command and opens again
          from where you left it. When the tool is busy you wait in line and see your place.
        </li>
      </ul>
    </Section>
  );
}
