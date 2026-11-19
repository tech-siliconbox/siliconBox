'use client';

import { useRef, useState } from 'react';

/** Edits closer together than this undo as one step, so undo is not one keystroke at a time. */
const UNDO_STEP_MS = 800;
const UNDO_DEPTH = 50;

/** Undo and redo over versions of a value; the caller shows whichever version comes back. */
export function useUndoHistory<T>() {
  const [history, setHistory] = useState<{ past: T[]; future: T[] }>({ past: [], future: [] });
  const lastStep = useRef(0);

  /** Remembers the version before an edit, unless the edit continues the last step. */
  function record(previous: T): void {
    const now = Date.now();
    if (now - lastStep.current > UNDO_STEP_MS) {
      setHistory((current) => ({
        past: [...current.past, previous].slice(-UNDO_DEPTH),
        future: [],
      }));
    }
    lastStep.current = now;
  }

  /** The version one step back (or forward), keeping `current` to return to; undefined if none. */
  function step(from: 'past' | 'future', current: T): T | undefined {
    const target = history[from].at(-1);
    if (target === undefined) return undefined;
    const rest = history[from].slice(0, -1);
    setHistory(
      from === 'past'
        ? { past: rest, future: [...history.future, current] }
        : { past: [...history.past, current], future: rest },
    );
    lastStep.current = 0;
    return target;
  }

  return {
    record,
    undo: (current: T) => step('past', current),
    redo: (current: T) => step('future', current),
    reset: () => setHistory({ past: [], future: [] }),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
