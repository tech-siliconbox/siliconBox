'use client';

import { useEffect, useState } from 'react';
import type { Drivers } from '../praman-reports';
import { type TraceAnalysis, askDrivers } from '../trace-tools';

type Loaded = { key: string; drivers: Drivers | null; error: string | null };

/** What set `signal` at `cycle` of the trace shown (a what-if's when `job` is one). */
export function useDrivers(
  analysis: TraceAnalysis | undefined,
  query: { signal: string; cycle: number } | null,
  job: string,
) {
  const key = query === null ? '' : `${query.signal}@${query.cycle}:${job}`;
  const [loaded, setLoaded] = useState<Loaded>({ key: '', drivers: null, error: null });
  useEffect(() => {
    if (analysis === undefined || query === null) return;
    let live = true;
    const load = async () => {
      const answer = await askDrivers(analysis.sessionId, {
        property: analysis.property,
        ...query,
        job,
      });
      if (live)
        setLoaded({
          key,
          drivers: answer.ok ? answer.value : null,
          error: answer.ok ? null : answer.message,
        });
    };
    void load();
    return () => {
      live = false;
    };
  }, [analysis, query, job, key]);
  const current = loaded.key === key && key !== '';
  return {
    drivers: current ? loaded.drivers : null,
    error: current ? loaded.error : null,
    loading: key !== '' && !current && analysis !== undefined,
  };
}
