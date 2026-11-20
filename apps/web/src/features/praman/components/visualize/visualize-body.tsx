'use client';

import { useEffect, useState } from 'react';
import { type View, useView } from '../../hooks/use-visualize';
import type { Cycles, Signal } from '../../visualize';
import type { BodyProps, DetailTab, DriverQuery } from './visualize-common';
import { VisualizeFind } from './visualize-find';
import { VisualizeTools } from './visualize-tools';
import { WaveTable } from './wave-table';
import { WhyPanel } from './why-panel';

/** The chosen row's signal, when it is one. */
function selectedSignal(view: View, cycles: Cycles): Signal | null {
  const row = view.rows.find((each) => each.key === view.selected);
  return row?.kind === 'signal' ? (cycles.byPath.get(row.path) ?? null) : null;
}

/** Whether a key goes to a field the reader types in, not to the waves. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));

const KEYS: Readonly<Record<string, (view: View) => void>> = {
  ArrowLeft: (view) => view.moveCursor(view.cursor - 1),
  ArrowRight: (view) => view.moveCursor(view.cursor + 1),
  Home: (view) => view.moveCursor(0),
  End: (view) => view.moveCursor(Number.MAX_SAFE_INTEGER),
  '+': (view) => view.zoomBy(1.5),
  '=': (view) => view.zoomBy(1.5),
  '-': (view) => view.zoomBy(1 / 1.5),
  Delete: (view) => view.removeChosen(),
  Backspace: (view) => view.removeChosen(),
};
const ALT_KEYS: Readonly<Record<string, (view: View) => void>> = {
  ArrowUp: (view) => view.stepChosen(-1),
  ArrowDown: (view) => view.stepChosen(1),
};

/**
 * Visualize's keys, but in a field: ← → the cursor (Home, End), + − zoom, Delete removes the
 * chosen row, Alt+↑ ↓ moves it. Esc closes the window (the dialog's own).
 */
function useKeys(view: View) {
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      const run = (event.altKey ? ALT_KEYS : KEYS)[event.key];
      if (run === undefined || typing(event.target)) return;
      event.preventDefault();
      run(view);
    };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  }, [view]);
}

/** The tools, the waves, and why it fails under them. */
export function VisualizeBody(props: BodyProps) {
  const { trace, cycles, top } = props;
  const { view, waves } = useView(cycles, trace, top);
  useKeys(view);
  const [details, setDetails] = useState(true);
  const [tab, setTab] = useState<DetailTab>(
    (trace.debug?.explanation.length ?? 0) > 0 ? 'why' : 'drivers',
  );
  const [query, setQuery] = useState<DriverQuery | null>(null);
  const signal = selectedSignal(view, cycles);
  const why = (path: string) => {
    setQuery({ signal: path, cycle: view.cursor });
    setTab('drivers');
    setDetails(true);
  };
  return (
    <>
      <VisualizeTools
        {...props}
        view={view}
        signal={signal}
        details={details}
        onDetails={() => setDetails(!details)}
        onWhy={why}
      />
      <VisualizeFind {...props} view={view} signal={signal} />
      <WaveTable {...props} view={view} waves={waves} />
      {details && (
        <WhyPanel
          {...props}
          view={view}
          tab={tab}
          onTab={setTab}
          query={query}
          onQuery={setQuery}
        />
      )}
    </>
  );
}
