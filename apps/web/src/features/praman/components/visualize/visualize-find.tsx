'use client';

import { useState } from 'react';
import type { View } from '../../hooks/use-visualize';
import { ExprError } from '../../trace-expr';
import { type Signal, findCycle, isInternal } from '../../visualize';
import { Choice } from '../choice';
import { SMALL_CONTROL } from '../small-control';
import type { BodyProps } from './visualize-body';
import { TOOL } from './visualize-tools';

type FindProps = BodyProps & { view: View; signal: Signal | null };

/** Add signals or an expression row, find a cycle where an expression holds, and pin values. */
export function VisualizeFind(props: FindProps) {
  const [note, setNote] = useState('');
  const message = note || props.whatIf.status.message;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-1.5">
      <AddSignals {...props} />
      <AddExpression {...props} onNote={setNote} />
      <Find {...props} onNote={setNote} />
      <Pins {...props} />
      {props.whatIf.status.busy && <span className="text-info">Proving the what-if…</span>}
      {message !== '' && (
        <span role="status" className="text-warning">
          {message}
        </span>
      )}
    </div>
  );
}

function AddSignals({ cycles, view }: FindProps) {
  const [internals, setInternals] = useState(false);
  const [text, setText] = useState('');
  const paths = cycles.signals
    .map((s) => s.fullName)
    .filter((path) => internals || !isInternal(path));
  const add = () => {
    const path = paths.find((each) => each === text.trim() || each.endsWith(`.${text.trim()}`));
    if (path === undefined || view.rows.some((row) => row.kind === 'signal' && row.path === path))
      return;
    view.setRows([...view.rows, { key: `s:${path}`, kind: 'signal', path }]);
    setText('');
  };
  return (
    <form action={add} className="flex items-center gap-1.5">
      <input
        aria-label="Add signals"
        list="visualize-signals"
        placeholder="Add signals: name or path"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={`${SMALL_CONTROL} w-52`}
      />
      <datalist id="visualize-signals">
        {paths.map((path) => (
          <option key={path} value={path} />
        ))}
      </datalist>
      <Choice type="checkbox" checked={internals} onChange={setInternals}>
        internals
      </Choice>
    </form>
  );
}

type NoteProps = FindProps & { onNote: (note: string) => void };

/** A message for the reader when an expression cannot be read. */
const problemOf = (error: unknown) =>
  error instanceof ExprError ? error.message : 'The expression cannot be read.';

function AddExpression({ view, cycles, top, onNote }: NoteProps) {
  const [text, setText] = useState('');
  const add = () => {
    try {
      findCycle(cycles, top, text, { from: -1, step: 1 });
      view.setRows([...view.rows, { key: `x:${text}`, kind: 'expr', text }]);
      setText('');
      onNote('');
    } catch (error) {
      onNote(problemOf(error));
    }
  };
  return (
    <form action={add}>
      <input
        aria-label="Add an expression row"
        placeholder="Add expression: count == 5 && push"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={`${SMALL_CONTROL} w-60`}
      />
    </form>
  );
}

function Find({ view, cycles, top, onNote }: NoteProps) {
  const [text, setText] = useState('');
  const find = (step: 1 | -1) => {
    try {
      const cycle = findCycle(cycles, top, text, { from: view.cursor, step });
      onNote(
        cycle === null
          ? `It does not hold ${step === 1 ? 'after' : 'before'} cycle ${view.cursor}.`
          : '',
      );
      if (cycle !== null) view.moveCursor(cycle);
    } catch (error) {
      onNote(problemOf(error));
    }
  };
  return (
    <form action={() => find(1)} className="flex items-center gap-1">
      <input
        aria-label="Find a cycle where an expression holds"
        placeholder="Find: $rose(push)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={`${SMALL_CONTROL} w-44`}
      />
      <button
        type="button"
        title="The cycle before where it holds"
        disabled={text.trim() === ''}
        onClick={() => find(-1)}
        className={TOOL}
      >
        ◀
      </button>
      <button
        type="submit"
        title="The next cycle where it holds"
        disabled={text.trim() === ''}
        className={TOOL}
      >
        ▶
      </button>
    </form>
  );
}

function Pins({ whatIf }: FindProps) {
  const { draft, pins } = whatIf;
  if (draft === null && pins.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pins.map((pin, index) => (
        <span
          key={`${pin.signal}@${pin.cycle}`}
          className="flex items-center gap-1 rounded-[3px] border border-info bg-info-light px-1.5 font-mono text-[12px]"
        >
          {pin.signal} = {pin.value} @{pin.cycle}
          <button
            type="button"
            aria-label={`Unpin ${pin.signal} at cycle ${pin.cycle}`}
            onClick={() => whatIf.setPins(pins.filter((_, at) => at !== index))}
            className="text-muted-foreground hover:text-danger"
          >
            ×
          </button>
        </span>
      ))}
      {draft !== null && <PinDraft whatIf={whatIf} />}
      {pins.length > 0 && (
        <button
          type="button"
          disabled={whatIf.status.busy}
          onClick={whatIf.prove}
          className={`${TOOL} font-semibold text-info`}
        >
          Prove with {pins.length === 1 ? 'this value' : 'these values'}
        </button>
      )}
    </div>
  );
}

/** The value being pinned: the selected signal at the cursor, its value to edit. */
function PinDraft({ whatIf }: Pick<FindProps, 'whatIf'>) {
  const { draft, pins } = whatIf;
  if (draft === null) return null;
  const pin = () => {
    whatIf.setPins([...pins, draft]);
    whatIf.setDraft(null);
  };
  return (
    <form action={pin} className="flex items-center gap-1 font-mono text-[12px]">
      {draft.signal} @{draft.cycle} =
      <input
        aria-label="Pinned value"
        value={draft.value}
        onChange={(e) => whatIf.setDraft({ ...draft, value: e.target.value })}
        className={`${SMALL_CONTROL} w-24`}
      />
      <button type="submit" className={TOOL}>
        Pin
      </button>
    </form>
  );
}
