'use client';

import { useEffect, useState } from 'react';

/** The time now in milliseconds, ticking every second while `active` (a proof's clock). */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
