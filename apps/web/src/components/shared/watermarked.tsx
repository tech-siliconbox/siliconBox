import { type ReactNode, useId } from 'react';

const TILE_WIDTH = 320;
const TILE_HEIGHT = 160;

/**
 * Tiles the learner's visible mark over the content. Faint and ignoring pointer events so it
 * never blocks text or lowers contrast below WCAG AA. `mark` comes from the server's
 * `visibleMark`, built per request from the session. Drawn as SVG so the strict CSP needs no
 * inline styles.
 */
export function Watermarked({ mark, children }: { mark: string; children: ReactNode }) {
  const patternId = useId();
  return (
    <div className="relative">
      {children}
      <svg
        aria-hidden="true"
        data-watermark=""
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
      >
        <defs>
          <pattern
            id={patternId}
            width={TILE_WIDTH}
            height={TILE_HEIGHT}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-18)"
          >
            <text
              x={12}
              y={TILE_HEIGHT / 2}
              className="fill-foreground/[.07] font-mono text-[11px]"
            >
              {mark}
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}
