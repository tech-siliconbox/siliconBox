import type { ReactNode } from 'react';

type StateGraphPanelProps = {
  title: string;
  text: string;
  graph: ReactNode;
  controls: ReactNode;
  status: ReactNode;
};

/** Frame shared by the simulation and formal halves of a state-graph block. */
export function StateGraphPanel({ title, text, graph, controls, status }: StateGraphPanelProps) {
  return (
    <section className="flex flex-col gap-3 rounded border border-border p-4">
      <header>
        <h4 className="text-[15px] font-semibold">{title}</h4>
        <p className="text-[13px] text-muted-foreground">{text}</p>
      </header>
      <div>{graph}</div>
      <div className="flex flex-wrap gap-2">{controls}</div>
      <p role="status" className="min-h-[3em] text-[13px]">
        {status}
      </p>
    </section>
  );
}
