'use client';

import { useState } from 'react';
import type { View } from '../../hooks/use-visualize';
import { useSignalLists } from '../../hooks/use-signal-lists';
import type { TraceAnalysis } from '../../trace-tools';
import { type Cycles, savedRows, withList } from '../../visualize';
import { SMALL_CONTROL } from '../small-control';
import { TOOL } from './visualize-common';

type SignalListsProps = {
  analysis: TraceAnalysis;
  top: string;
  cycles: Cycles;
  view: View;
  onNote: (note: string) => void;
};

const SAVE = 'save';

/**
 * Signal lists, kept with the session for its top module: save the signals and expressions shown
 * under a name, show a saved list (beside the property's own rows), or delete one.
 */
export function SignalLists({ analysis, top, cycles, view, onNote }: SignalListsProps) {
  const { lists, save, remove } = useSignalLists(analysis.sessionId, top);
  const [naming, setNaming] = useState(false);
  const rows = savedRows(view.rows);
  const choose = (value: string) => {
    // "show:<name>" or "delete:<name>"; a name may hold a colon itself.
    const at = value.indexOf(':');
    const what = at < 0 ? value : value.slice(0, at);
    const chosen = at < 0 ? '' : value.slice(at + 1);
    const list = lists.find((each) => each.name === chosen);
    if (what === SAVE) setNaming(true);
    else if (what === 'show' && list !== undefined) view.setRows(withList(view.rows, cycles, list));
    else if (what === 'delete') void remove(chosen).then((problem) => onNote(problem ?? ''));
  };
  const saveRows = async (name: string) => {
    const problem = await save(name, rows);
    onNote(problem ?? `Saved the list ${name}.`);
    if (problem === null) setNaming(false);
  };
  return (
    <div className="flex items-center gap-1">
      <select
        aria-label="Signal lists"
        title="Save the rows of this view, or show a saved list"
        value=""
        onChange={(event) => choose(event.target.value)}
        className={SMALL_CONTROL}
      >
        <option value="">Signal lists…</option>
        <option value={SAVE} disabled={rows.length === 0}>
          Save these rows…
        </option>
        <ListOptions verb="show" label="Show" names={lists.map((list) => list.name)} />
        <ListOptions verb="delete" label="Delete" names={lists.map((list) => list.name)} />
      </select>
      {naming && <SaveList onSave={saveRows} />}
    </div>
  );
}

function ListOptions({ verb, label, names }: { verb: string; label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <optgroup label={label}>
      {names.map((name) => (
        <option key={name} value={`${verb}:${name}`}>
          {name}
        </option>
      ))}
    </optgroup>
  );
}

/** The name to save the rows under. */
function SaveList({ onSave }: { onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  return (
    <form action={() => void onSave(name.trim())} className="flex items-center gap-1">
      <input
        aria-label="Name of the signal list"
        placeholder="List name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={`${SMALL_CONTROL} w-32`}
      />
      <button type="submit" disabled={name.trim() === ''} className={TOOL}>
        Save list
      </button>
    </form>
  );
}
