'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { z } from 'zod';
import type { Panel } from '../tool-actions';

// The tool's layout, kept in this browser: which panels show, and their sizes in pixels (the left
// panel's width, the log's and the console's heights). A per-viewer convenience: without storage
// (a private window) the layout lasts the visit.

const PANELS = ['left', 'log', 'console'] as const satisfies readonly Panel[];

const LayoutSchema = z.object({
  shown: z.object({ left: z.boolean(), log: z.boolean(), console: z.boolean() }),
  left: z.number(),
  log: z.number(),
  console: z.number(),
});
type Layout = z.infer<typeof LayoutSchema>;

const DEFAULT_LAYOUT: Layout = {
  shown: { left: true, log: true, console: true },
  left: 288,
  log: 176,
  console: 72,
};

const LIMITS: Readonly<Record<Panel, readonly [number, number]>> = {
  left: [160, 640],
  log: [70, 700],
  console: [46, 300],
};

const KEY = 'praman.layout';
let current: Layout | null = null;
const listeners = new Set<() => void>();

function stored(): Layout {
  try {
    const read = LayoutSchema.safeParse(JSON.parse(window.localStorage.getItem(KEY) ?? 'null'));
    return read.success ? read.data : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT; // storage is blocked: the default layout
  }
}

const layoutNow = () => (current ??= stored());

function save(next: Layout) {
  current = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage is blocked: the layout lasts this visit.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Grows a panel by `by` pixels (negative shrinks it), within its limits. */
export function resizePanel(panel: Panel, by: number) {
  const now = layoutNow();
  const [least, most] = LIMITS[panel];
  save({ ...now, [panel]: Math.round(Math.max(least, Math.min(most, now[panel] + by))) });
}

export function togglePanel(panel: Panel) {
  const now = layoutNow();
  save({ ...now, shown: { ...now.shown, [panel]: !now.shown[panel] } });
}

export const resetLayout = () => save(DEFAULT_LAYOUT);

/**
 * The layout, and the screen's element carrying its sizes as CSS variables (`--pm-left`,
 * `--pm-log`, `--pm-console`), set by script: the CSP allows no inline styles. The server and the
 * first render use the default layout.
 */
export function useLayout() {
  const layout = useSyncExternalStore(subscribe, layoutNow, () => DEFAULT_LAYOUT);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const style = root.current?.style;
    if (style === undefined) return;
    for (const panel of PANELS) style.setProperty(`--pm-${panel}`, `${layout[panel]}px`);
  }, [layout]);
  return { shown: layout.shown, root };
}
