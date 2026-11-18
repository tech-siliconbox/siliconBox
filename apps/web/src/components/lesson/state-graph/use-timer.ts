'use client';
import { useCallback, useEffect, useRef } from 'react';

/** One pending timeout at a time, cleared on unmount, for step-by-step animations. */
export function useTimer() {
  const handle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    if (handle.current !== null) clearTimeout(handle.current);
    handle.current = null;
  }, []);
  const schedule = useCallback(
    (run: () => void, delayMs: number) => {
      stop();
      handle.current = setTimeout(run, delayMs);
    },
    [stop],
  );
  useEffect(() => stop, [stop]);
  return { schedule, stop };
}
