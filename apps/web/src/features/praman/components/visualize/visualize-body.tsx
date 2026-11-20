'use client';

import { useState } from 'react';
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

/** The tools, the waves, and why it fails under them. */
export function VisualizeBody(props: BodyProps) {
  const { trace, cycles, top } = props;
  const { view, waves } = useView(cycles, trace, top);
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
