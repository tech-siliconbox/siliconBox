import { cn } from '@/lib/cn';

// The shapes of a waveform row, in pixels, for every waveform the site draws (the Drill trace and
// Praman's Visualize): a bit as a line high or low, a bus as hexagons with its value inside.

/** A run of one value, from x0 to x1 in pixels. */
export type ShapeRun = { x0: number; x1: number; value: string };

const SLANT = 4;

type BitWaveProps = { runs: ShapeRun[]; height: number; className?: string };

/** A one-bit signal: high for 1, low for 0, a shaded band where it is x or z. */
export function BitWave({ runs, height, className }: BitWaveProps) {
  const [high, low, mid] = [4, height - 5, height / 2];
  const yOf = (value: string) => {
    const bit = value.slice(-1).toLowerCase();
    return bit === '1' ? high : bit === '0' ? low : mid;
  };
  const path = runs
    .map(({ x0, x1, value }, i) => `${i === 0 ? 'M' : 'L'}${x0},${yOf(value)} L${x1},${yOf(value)}`)
    .join(' ');
  return (
    <>
      {runs
        .filter((run) => yOf(run.value) === mid)
        .map((run) => (
          <rect
            key={run.x0}
            x={run.x0}
            y={high}
            width={Math.max(1, run.x1 - run.x0)}
            height={low - high}
            className="fill-danger/15"
          />
        ))}
      <path
        d={path}
        className={cn('fill-none [stroke-width:1.4]', className ?? 'stroke-foreground')}
      />
    </>
  );
}

type BusWaveProps = {
  runs: ShapeRun[];
  height: number;
  /** The value as the reader should see it (a radix, hex). */
  label: (value: string) => string;
};

/** A bus: one hexagon a value, its value written inside when there is room. */
export function BusWave({ runs, height, label }: BusWaveProps) {
  const [top, bottom, mid] = [4, height - 5, height / 2];
  return runs.map(({ x0, x1, value }) => {
    const width = x1 - x0;
    const slant = Math.min(SLANT, width / 3);
    const text = label(value);
    const unknown = /[xz]/i.test(value);
    const points = `${x0},${mid} ${x0 + slant},${top} ${x1 - slant},${top} ${x1},${mid} ${x1 - slant},${bottom} ${x0 + slant},${bottom}`;
    return (
      <g key={x0}>
        <polygon
          points={points}
          className={cn(
            '[stroke-width:1.2]',
            unknown ? 'fill-danger/15 stroke-danger' : 'fill-info-light stroke-info',
          )}
        />
        {width > text.length * 6.6 + 8 && (
          <text
            x={x0 + width / 2}
            y={mid + 4}
            textAnchor="middle"
            className="fill-foreground font-mono text-[10px]"
          >
            {text}
          </text>
        )}
      </g>
    );
  });
}
