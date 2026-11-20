import type { ReactNode } from 'react';

// Praman's toolbar icons on a 16 px grid, drawn with the site's colour tokens.

const LINE = 'fill-none stroke-muted-foreground';
const ACCENT = 'fill-none stroke-info';
const ROUND = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" {...ROUND}>
      {children}
    </svg>
  );
}

const page = <path d="M3 2.5h6l4 4v7H3z" className={LINE} strokeWidth="1.3" />;

export const TOOL_ICONS = {
  add: (
    <Glyph>
      {page}
      <path d="M8 7.5v4M6 9.5h4" className="fill-none stroke-ok" strokeWidth="1.6" />
    </Glyph>
  ),
  script: (
    <Glyph>
      <path d="M3 2.5h10v11H3z" className={LINE} strokeWidth="1.3" />
      <path d="M5.2 6.2l2 1.8-2 1.8M8.6 10h2.4" className={ACCENT} strokeWidth="1.4" />
    </Glyph>
  ),
  analyze: (
    <Glyph>
      {page}
      <path d="M5.5 9l1.6 1.6L10.5 7" className={ACCENT} strokeWidth="1.6" />
    </Glyph>
  ),
  elaborate: (
    <Glyph>
      <rect x="5.5" y="1.8" width="5" height="3.6" className={LINE} strokeWidth="1.3" />
      <rect x="1.8" y="10.6" width="4.6" height="3.6" className={LINE} strokeWidth="1.3" />
      <rect x="9.6" y="10.6" width="4.6" height="3.6" className={LINE} strokeWidth="1.3" />
      <path d="M8 5.4v2.8M4.1 10.6V8.2h7.8v2.4" className={ACCENT} strokeWidth="1.3" />
    </Glyph>
  ),
  clock: (
    <Glyph>
      <path d="M1.5 11.5h3v-7h3.5v7h3.5v-7h3" className={ACCENT} strokeWidth="1.5" />
    </Glyph>
  ),
  prove: (
    <Glyph>
      <path d="M4 2.5l9 5.5-9 5.5z" className="fill-current" />
    </Glyph>
  ),
  stop: (
    <Glyph>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" className="fill-current" />
    </Glyph>
  ),
  history: (
    <Glyph>
      <circle cx="8" cy="8" r="5.6" className={LINE} strokeWidth="1.3" />
      <path d="M8 4.8V8l2.3 1.5" className={ACCENT} strokeWidth="1.5" />
    </Glyph>
  ),
} as const;

export type ToolIcon = keyof typeof TOOL_ICONS;
