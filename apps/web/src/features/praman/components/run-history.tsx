'use client';

import {
  API_ROUTES,
  type ToolRunDetail,
  ToolRunDetailSchema,
  ToolRunDiffSchema,
  type ToolRunSummary,
  ToolRunSummarySchema,
  ToolSessionSummarySchema,
} from '@siliconbox/shared';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-error';
import { useJson } from '../hooks/use-json';
import { PramanPropertySchema } from '../praman-snapshot';
import { PROPERTY_LOOK } from '../property-status';
import type { ToolAction } from '../tool-actions';
import { TracePanel } from './trace-panel';

const readRuns = (body: unknown) => z.array(ToolRunSummarySchema).safeParse(body).data ?? null;
const readRun = (body: unknown) => ToolRunDetailSchema.safeParse(body).data ?? null;

/** The learner's proof runs (the newest 50), each with its results and kept traces. */
type RunHistoryProps = { onClose: () => void; onAction: (action: ToolAction) => void };

export function RunHistory({ onClose, onAction }: RunHistoryProps) {
  const runs = useJson(API_ROUTES.toolRuns, readRuns);
  const [open, setOpen] = useState<string | null>(null);

  const remove = async (runId: string) => {
    await fetch(API_ROUTES.toolRun(runId), { method: 'DELETE' }).catch(() => null);
    setOpen(null);
    runs.reload();
  };

  return (
    <section aria-label="Run history" className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Run history</h2>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
      {runs.error !== null && <p className="text-[13px] text-destructive">{runs.error}</p>}
      {runs.data?.length === 0 && <p className="text-[13px] text-muted-foreground">No runs yet.</p>}
      <ul className="mt-3 divide-y divide-border">
        {runs.data?.map((run) => (
          <li key={run.id} className="py-2">
            <RunLine run={run} onOpen={() => setOpen(open === run.id ? null : run.id)} />
            {open === run.id && (
              <RunResults runId={run.id} onDelete={() => void remove(run.id)} onAction={onAction} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RunLine({ run, onOpen }: { run: ToolRunSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 text-left text-[13px]"
    >
      <span className="font-mono font-semibold">Run {run.number}</span>
      <span className="font-mono text-muted-foreground">{run.top}</span>
      <span className="text-muted-foreground">{run.status}</span>
      <span className="flex-1" />
      <time className="text-[12px] text-muted-foreground" dateTime={run.startedAt}>
        {new Date(run.startedAt).toLocaleString()}
      </time>
    </button>
  );
}

type RunResultsProps = {
  runId: string;
  onDelete: () => void;
  onAction: (action: ToolAction) => void;
};

function RunResults({ runId, onDelete, onAction }: RunResultsProps) {
  const { data } = useJson(API_ROUTES.toolRun(runId), readRun);
  const [trace, setTrace] = useState<string | null>(null);
  if (data === null) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      <RunProperties run={data} onTrace={setTrace} />
      {trace !== null && (
        <TracePanel
          url={`${API_ROUTES.toolRunTrace(runId)}?property=${encodeURIComponent(trace)}`}
          title={trace}
          onClose={() => setTrace(null)}
        />
      )}
      <RunActions runId={runId} onDelete={onDelete} onAction={onAction} />
    </div>
  );
}

/** Compare the run with the one before, restore it into a new session, or delete it. */
function RunActions({ runId, onDelete, onAction }: RunResultsProps) {
  const [comparing, setComparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const restore = async () => {
    const response = await fetch(API_ROUTES.toolRunRestore(runId), { method: 'POST' }).catch(
      () => null,
    );
    if (response?.ok !== true) {
      setProblem(await errorMessage(response));
      return;
    }
    const session = ToolSessionSummarySchema.parse(await response.json());
    onAction({ kind: 'openSession', sessionId: session.id });
  };
  return (
    <>
      {comparing && <RunDiff runId={runId} />}
      {problem !== null && <p className="text-[13px] text-destructive">{problem}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={comparing}
          onClick={() => setComparing(true)}
        >
          Compare With the Run Before
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void restore()}>
          Restore Into a New Session
        </Button>
        <Button size="sm" variant="secondary" onClick={onDelete}>
          Delete this run
        </Button>
      </div>
    </>
  );
}

const readDiff = (body: unknown) => ToolRunDiffSchema.safeParse(body).data ?? null;

/** The properties whose result changed since the session's run before, or none. */
function RunDiff({ runId }: { runId: string }) {
  const { data, error } = useJson(API_ROUTES.toolRunDiff(runId), readDiff);
  if (error !== null) return <p className="text-[13px] text-destructive">{error}</p>;
  if (data === null) return null;
  const lines = [
    ...data.changed.map((p) => `${p.name}: ${p.before} → ${p.after}`),
    ...data.added.map((p) => `${p.name}: new, ${p.after}`),
    ...data.removed.map((p) => `${p.name}: gone (was ${p.before})`),
  ];
  return (
    <section
      aria-label="Changes since the run before"
      className="rounded-[3px] border border-border p-2 text-[12px]"
    >
      {lines.length === 0 ? (
        <p>No property changed since the run before.</p>
      ) : (
        <ul className="font-mono">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RunProperties({ run, onTrace }: { run: ToolRunDetail; onTrace: (id: string) => void }) {
  const properties = run.properties.flatMap(
    (raw) => PramanPropertySchema.safeParse(raw).data ?? [],
  );
  return (
    <ul className="flex flex-col gap-1 text-[12px]">
      {properties.map((property) => (
        <li key={property.id} className="flex items-center gap-2">
          <span className="font-mono">{property.name}</span>
          <span className="text-muted-foreground">{PROPERTY_LOOK[property.status].label}</span>
          {property.has_trace && !run.tracesDropped.includes(property.id) && (
            <button
              type="button"
              onClick={() => onTrace(property.id)}
              className="font-semibold underline underline-offset-2"
            >
              Waveform
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
