'use client';

import { useJson } from '../../hooks/use-json';
import { useWhatIf } from '../../hooks/use-visualize';
import type { Reset } from '../../praman-snapshot';
import { type PramanTrace, readPramanTrace } from '../../praman-trace';
import type { TraceAnalysis } from '../../trace-tools';
import { cyclesOf } from '../../visualize';
import { openModal } from '../tool-dialog';
import { VisualizeBody } from './visualize-body';
import { VisualizeHead } from './visualize-head';

type VisualizeWindowProps = {
  /** Where the trace is read: a session's property, a coverage item, or a kept run's. */
  url: string;
  title: string;
  /** The design's top module and reset: the rows shown first, and the cycles the reset holds. */
  top: string;
  reset: Reset | null;
  /** A trace of the open session: what-if and drivers can be asked of it. */
  analysis?: TraceAnalysis;
  onClose: () => void;
};

/** Visualize, as in Praman: a property's trace on a cycle ruler, with why it fails. */
export function VisualizeWindow({ url, title, onClose, ...rest }: VisualizeWindowProps) {
  const { data, error } = useJson(url, readPramanTrace);
  return (
    <dialog
      ref={openModal}
      aria-label={`Waveform of ${title}`}
      onClose={onClose}
      className="m-auto h-[calc(100dvh-2rem)] max-h-none w-[calc(100vw-2rem)] max-w-none flex-col border border-border bg-background p-0 text-[13px] text-foreground shadow-xl backdrop:bg-foreground/30 open:flex"
    >
      {data === null ? (
        <>
          <VisualizeHead
            title={title}
            shown={null}
            edited={null}
            onClose={onClose}
            onOriginal={onClose}
          />
          <p className={error === null ? 'p-6 text-muted-foreground' : 'p-6 text-danger'}>
            {error ?? 'Reading the trace…'}
          </p>
        </>
      ) : (
        <Visualize original={data} title={title} onClose={onClose} {...rest} />
      )}
    </dialog>
  );
}

type VisualizeProps = Omit<VisualizeWindowProps, 'url'> & { original: PramanTrace };

function Visualize({ original, title, onClose, analysis, ...rest }: VisualizeProps) {
  const whatIf = useWhatIf(original, analysis);
  const trace = whatIf.shown;
  const cycles = cyclesOf(trace.trace);
  return (
    <>
      <VisualizeHead
        title={title}
        shown={{ trace, cycles }}
        edited={whatIf.edited?.label ?? null}
        onClose={onClose}
        onOriginal={whatIf.original}
      />
      <VisualizeBody
        key={whatIf.edited?.job ?? 'original'}
        trace={trace}
        cycles={cycles}
        whatIf={whatIf}
        {...(analysis === undefined ? {} : { analysis })}
        {...rest}
      />
    </>
  );
}
