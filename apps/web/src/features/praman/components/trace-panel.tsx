'use client';

import { WaveformView } from '@/components/shared/waveform-view';
import { useJson } from '../hooks/use-json';
import { readPramanTrace } from '../praman-trace';

type TracePanelProps = {
  /** Where the trace is read: a session's property, or a kept run's. */
  url: string;
  title: string;
  onClose: () => void;
};

/** A property's counterexample or cover trace as a waveform, with Praman's account of it. */
export function TracePanel({ url, title, onClose }: TracePanelProps) {
  const { data, error, loading } = useJson(url, readPramanTrace);
  return (
    <section aria-label={`Waveform of ${title}`} className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-mono text-[14px] font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-[12px] font-semibold underline underline-offset-2"
        >
          Close
        </button>
      </div>
      {loading && <p className="text-[13px] text-muted-foreground">Reading the trace…</p>}
      {error !== null && <p className="text-[13px] text-destructive">{error}</p>}
      {data !== null && (
        <>
          {data.explanation !== '' && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-[12px]">
              {data.explanation}
            </pre>
          )}
          <WaveformView trace={data.trace} title={title} />
        </>
      )}
    </section>
  );
}
