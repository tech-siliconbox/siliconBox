import type { Trace } from '@siliconbox/shared';
import { type Segment, busLabel, waveRows } from '@/lib/waveform';
import { BitWave, BusWave } from './wave-shapes';

/** Room for the longest signal name: about 7 px a character at 11 px monospace. */
const CHAR_WIDTH = 7;
const NAME_PADDING = 16;
const COLUMN = 36;
const ROW = 28;

/** A row's runs on the time-point columns, in pixels. */
const runsOf = (segments: Segment[]) =>
  segments.map(({ from, to, value }) => ({ x0: from * COLUMN, x1: to * COLUMN, value }));

/** A counterexample or cover trace as a waveform: one row per signal, time left to right. */
export function WaveformView({ trace, title }: { trace: Trace; title: string }) {
  const rows = waveRows(trace);
  const nameWidth = Math.max(...rows.map((row) => row.name.length), 4) * CHAR_WIDTH + NAME_PADDING;
  const width = nameWidth + trace.timepoints.length * COLUMN + 8;
  return (
    <div className="overflow-x-auto rounded border border-border bg-background p-2">
      <svg
        viewBox={`0 0 ${width} ${rows.length * ROW}`}
        width={width}
        role="img"
        aria-label={title}
      >
        {rows.map((row, index) => (
          <g key={row.name} transform={`translate(0 ${index * ROW})`}>
            <text
              x={nameWidth - 8}
              y={ROW / 2 + 4}
              textAnchor="end"
              className="fill-muted-foreground font-mono text-[11px]"
            >
              {row.name}
            </text>
            <g transform={`translate(${nameWidth} 0)`}>
              {row.width === 1 ? (
                <BitWave runs={runsOf(row.segments)} height={ROW} />
              ) : (
                <BusWave runs={runsOf(row.segments)} height={ROW} label={busLabel} />
              )}
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
