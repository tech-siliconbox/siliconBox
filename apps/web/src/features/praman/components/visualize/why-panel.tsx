'use client';

import type { View } from '../../hooks/use-visualize';
import { PanelTabs } from '../panel-tabs';
import type { BodyProps } from './visualize-body';
import { DriversTab } from './drivers-tab';
import { WhyDiagram } from './why-diagram';
import { WhyFails } from './why-fails';

export type DetailTab = 'why' | 'drivers' | 'diagram';
/** A signal at a cycle: what drove it there is what the drivers tabs show. */
export type DriverQuery = { signal: string; cycle: number };

const TABS = [
  { id: 'why', label: 'Why it fails' },
  { id: 'drivers', label: 'Drivers' },
  { id: 'diagram', label: 'Why diagram' },
] as const;

type WhyPanelProps = BodyProps & {
  view: View;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  query: DriverQuery | null;
  onQuery: (query: DriverQuery) => void;
};

/** Under the waves: why it fails cycle by cycle, what drove a signal, and the chain behind it. */
export function WhyPanel(props: WhyPanelProps) {
  const { tab, onTab, view, query } = props;
  const job = props.whatIf.edited?.job ?? props.analysis?.job ?? '';
  const ask = (signal: string, cycle: number) => {
    props.onQuery({ signal, cycle });
    onTab('drivers');
  };
  return (
    <section aria-label="Details" className="flex h-64 shrink-0 flex-col border-t border-border">
      <PanelTabs
        label="Details"
        tabs={TABS}
        active={tab}
        onSelect={(id) => onTab(TABS.find((t) => t.id === id)?.id ?? 'why')}
      />
      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto p-3 text-[13px]">
        {tab === 'why' && (
          <WhyFails
            trace={props.trace}
            cursor={view.cursor}
            onCycle={view.moveCursor}
            onSignal={(path) => ask(path, view.cursor)}
          />
        )}
        {tab === 'drivers' && <DriversTab analysis={props.analysis} query={query} job={job} />}
        {tab === 'diagram' && (
          <WhyDiagram analysis={props.analysis} query={query} job={job} onQuery={props.onQuery} />
        )}
      </div>
    </section>
  );
}
