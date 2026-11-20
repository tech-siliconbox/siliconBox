'use client';

import { WaveformView } from '@/components/shared/waveform-view';
import { useJson } from '../hooks/use-json';
import { type TraceAnalysis, type TraceTools, useTraceTools } from '../hooks/use-trace-tools';
import { type PramanTrace, readPramanTrace } from '../praman-trace';
import { DriversList } from './drivers-list';
import { TraceToolbar } from './trace-toolbar';

type TracePanelProps = {
  /** Where the trace is read: a session's property, a coverage item, or a kept run's. */
  url: string;
  title: string;
  onClose: () => void;
  /** A trace of the open session: its tools can ask what if, and what drove a signal. */
  analysis?: TraceAnalysis;
};

/** A counterexample or cover trace as a waveform, with Praman's account of it and its tools. */
export function TracePanel({ url, title, onClose, analysis }: TracePanelProps) {
  const { data, error, loading } = useJson(url, readPramanTrace);
  const tools = useTraceTools(analysis);
  const shown = tools.found?.trace ?? data;
  return (
    <section
      aria-label={`Waveform of ${title}`}
      className="flex flex-col gap-3 border-t border-border p-4"
    >
      <TraceHead title={title} note={tools.found?.note ?? null} onClose={onClose} />
      <Tools analysis={analysis} shown={shown} tools={tools} />
      <TraceStatus tools={tools} loading={loading} error={error} />
      {shown !== null && <TraceBody shown={shown} title={title} />}
      {tools.drivers !== null && <DriversList drivers={tools.drivers} />}
    </section>
  );
}

type ToolsProps = {
  analysis: TraceAnalysis | undefined;
  shown: PramanTrace | null;
  tools: TraceTools;
};

/** The toolbar of a trace of the open session (a kept run's trace has none). */
function Tools({ analysis, shown, tools }: ToolsProps) {
  if (analysis === undefined || shown === null) return null;
  return (
    <TraceToolbar
      key={tools.found?.job ?? 'original'}
      signals={shown.trace.signals.map((signal) => signal.fullName)}
      tools={tools}
      whatIf={analysis.whatIf}
    />
  );
}

function TraceHead({
  title,
  note,
  onClose,
}: {
  title: string;
  note: string | null;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-mono text-[14px] font-semibold">
        {title}
        {note !== null && (
          <span className="ml-2 font-sans text-[12px] font-normal text-info">what-if: {note}</span>
        )}
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="text-[12px] font-semibold underline underline-offset-2"
      >
        Close
      </button>
    </div>
  );
}

function TraceStatus({
  tools,
  loading,
  error,
}: {
  tools: TraceTools;
  loading: boolean;
  error: string | null;
}) {
  return (
    <>
      {tools.status !== null && (
        <p role="status" className="text-[13px] text-info">
          {tools.status}
        </p>
      )}
      {loading && <p className="text-[13px] text-muted-foreground">Reading the trace…</p>}
      {error !== null && <p className="text-[13px] text-destructive">{error}</p>}
    </>
  );
}

function TraceBody({ shown, title }: { shown: PramanTrace; title: string }) {
  return (
    <>
      {shown.explanation !== '' && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-[12px]">
          {shown.explanation}
        </pre>
      )}
      <WaveformView trace={shown.trace} title={title} />
    </>
  );
}
