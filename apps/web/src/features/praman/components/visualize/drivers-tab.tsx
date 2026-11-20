'use client';

import { useDrivers } from '../../hooks/use-drivers';
import type { TraceAnalysis } from '../../trace-tools';
import { DriversList } from '../drivers-list';
import type { DriverQuery } from './why-panel';

type DriversTabProps = {
  analysis: TraceAnalysis | undefined;
  query: DriverQuery | null;
  job: string;
};

/** What set the asked signal at the asked cycle: each driving statement with what it read. */
export function DriversTab({ analysis, query, job }: DriversTabProps) {
  const { drivers, error, loading } = useDrivers(analysis, query, job);
  if (analysis === undefined)
    return (
      <p className="text-muted-foreground">
        Drivers are traced in the open session; open it to ask.
      </p>
    );
  if (query === null)
    return (
      <p className="text-muted-foreground">
        Choose a signal and press Why? (or a signal name in Why it fails).
      </p>
    );
  if (loading) return <p className="text-muted-foreground">Tracing the drivers…</p>;
  if (error !== null) return <p className="text-danger">{error}</p>;
  return drivers === null ? null : <DriversList drivers={drivers} />;
}
