import type { Trace } from '@siliconbox/shared';
import { type Segment, busLabel, waveRows } from '../waveform';

/** Room for the longest signal name: about 7 px a character at 11 px monospace. */
const CHAR_WIDTH = 7;
const NAME_PADDING = 16;
const COLUMN = 36;
const ROW = 28;
const HIGH = 6;
const LOW = ROW - 6;
const SLANT = 4;

function bitPath(segments: Segment[]): string {
  return segments
    .map(({ from, to, value }) => {
      const y = value === '1' ? HIGH : value === '0' ? LOW : ROW / 2;
      return `L${from * COLUMN},${y} L${to * COLUMN},${y}`;
    })
    .join(' ')
    .replace(/^L/, 'M');
}

function BusSegment({ segment }: { segment: Segment }) {
  const [x0, x1] = [segment.from * COLUMN, segment.to * COLUMN];
  const points = `${x0},${ROW / 2} ${x0 + SLANT},${HIGH} ${x1 - SLANT},${HIGH} ${x1},${ROW / 2} ${x1 - SLANT},${LOW} ${x0 + SLANT},${LOW}`;
  return (
    <g>
      <polygon points={points} className="fill-info-light stroke-info [stroke-width:1.2]" />
      <text
        x={(x0 + x1) / 2}
        y={ROW / 2 + 4}
        textAnchor="middle"
        className="fill-foreground text-[10px]"
      >
        {busLabel(segment.value)}
      </text>
    </g>
  );
}

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
                <path
                  d={bitPath(row.segments)}
                  className="fill-none stroke-foreground [stroke-width:1.4]"
                />
              ) : (
                row.segments.map((segment) => <BusSegment key={segment.from} segment={segment} />)
              )}
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
