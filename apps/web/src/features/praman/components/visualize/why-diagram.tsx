'use client';

import { useState } from 'react';
import { useDrivers } from '../../hooks/use-drivers';
import type { Drivers } from '../../praman-reports';
import type { TraceAnalysis } from '../../trace-tools';
import type { DriverQuery } from './visualize-common';

type WhyDiagramProps = {
  analysis: TraceAnalysis | undefined;
  query: DriverQuery | null;
  job: string;
  onQuery: (query: DriverQuery) => void;
};

const BOX = 'rounded-[3px] border border-border bg-background px-2 py-1 font-mono text-[12px]';

/**
 * The chain of drivers behind a value: the signal, the statement that set it, and the values that
 * statement read (at the cycle it read them). A value read leads one step further back.
 */
export function WhyDiagram({ analysis, query, job, onQuery }: WhyDiagramProps) {
  const [trail, setTrail] = useState<DriverQuery[]>([]);
  const { drivers, error, loading } = useDrivers(analysis, query, job);
  if (analysis === undefined || query === null) {
    return (
      <p className="text-muted-foreground">
        Choose a signal and press Why? to see the chain of drivers behind its value.
      </p>
    );
  }
  const back = (to: number) => {
    const step = trail[to];
    if (step === undefined) return;
    setTrail(trail.slice(0, to));
    onQuery(step);
  };
  const follow = (next: DriverQuery) => {
    setTrail([...trail, query]);
    onQuery(next);
  };
  return (
    <div className="flex flex-col gap-3">
      <Trail trail={trail} onBack={back} />
      {loading && <p className="text-muted-foreground">Tracing the drivers…</p>}
      {error !== null && <p className="text-danger">{error}</p>}
      {drivers !== null && <Chain drivers={drivers} cycle={query.cycle} onFollow={follow} />}
    </div>
  );
}

/** The values followed so far, each a way back to it. */
function Trail({ trail, onBack }: { trail: DriverQuery[]; onBack: (to: number) => void }) {
  if (trail.length === 0) return null;
  return (
    <nav aria-label="The chain so far" className="flex flex-wrap items-center gap-1 text-[12px]">
      {trail.map((step, i) => (
        <button
          key={`${step.signal}@${step.cycle}`}
          type="button"
          onClick={() => onBack(i)}
          className="underline underline-offset-2"
        >
          {step.signal} @{step.cycle} →
        </button>
      ))}
    </nav>
  );
}

type ChainProps = { drivers: Drivers; cycle: number; onFollow: (next: DriverQuery) => void };

/** The values read → the statement that set the signal → the signal and its value. */
function Chain({ drivers, cycle, onFollow }: ChainProps) {
  return (
    <div className="flex items-start gap-6">
      <div className="flex flex-col gap-2">
        {drivers.drivers.map((driver) => (
          <div key={`${driver.file}:${driver.line}`} className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              {Object.entries(driver.values).map(([read, value]) => (
                <button
                  key={read}
                  type="button"
                  title="Why this value?"
                  onClick={() => onFollow({ signal: read, cycle: driver.values_at ?? cycle })}
                  className={`${BOX} text-left hover:border-info`}
                >
                  {read} = {value}
                  {driver.values_at !== null && (
                    <span className="text-muted-foreground"> @{driver.values_at}</span>
                  )}
                </button>
              ))}
            </div>
            <span aria-hidden="true">→</span>
            <div className={`${BOX} max-w-md whitespace-pre-wrap bg-muted`}>{driver.text}</div>
          </div>
        ))}
      </div>
      <span aria-hidden="true" className="self-center">
        →
      </span>
      <div className={`${BOX} self-center border-info font-semibold`}>
        {drivers.signal} = {drivers.value} @{drivers.cycle}
      </div>
    </div>
  );
}
