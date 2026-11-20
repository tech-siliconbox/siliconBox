'use client';

import type { KeyboardEvent, PointerEvent } from 'react';
import { cn } from '@/lib/cn';

const STEP = 16;

type SplitterProps = {
  /** What it resizes, for its name. */
  label: string;
  /** Between panels side by side (drag left and right), or stacked (drag up and down). */
  orientation: 'vertical' | 'horizontal';
  /** The pointer or the arrow keys moved it by this many pixels (right or down is positive). */
  onMove: (by: number) => void;
};

/** The bar between two panels: drag it, or focus it and use the arrow keys. */
export function Splitter({ label, orientation, onMove }: SplitterProps) {
  const across = orientation === 'vertical';
  const keys: Readonly<Record<string, number>> = across
    ? { ArrowLeft: -STEP, ArrowRight: STEP }
    : { ArrowUp: -STEP, ArrowDown: STEP };
  const drag = (event: PointerEvent<HTMLButtonElement>) => {
    const bar = event.currentTarget;
    bar.setPointerCapture(event.pointerId);
    let last = across ? event.clientX : event.clientY;
    const move = (moved: globalThis.PointerEvent) => {
      const now = across ? moved.clientX : moved.clientY;
      onMove(now - last);
      last = now;
    };
    const end = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', end);
      bar.removeEventListener('pointercancel', end);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  };
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    const by = keys[event.key];
    if (by === undefined) return;
    event.preventDefault();
    onMove(by);
  };
  return (
    <button
      type="button"
      aria-label={`${label}: drag, or use the arrow keys`}
      title={label}
      onPointerDown={drag}
      onKeyDown={key}
      className={cn(
        'shrink-0 touch-none rounded-full outline-none hover:bg-info/40 focus-visible:bg-info/60',
        across ? 'w-1 cursor-col-resize self-stretch' : 'mx-1 h-1 cursor-row-resize',
      )}
    />
  );
}
