'use client';

import {
  API_ROUTES,
  type ToolRunSummary,
  ToolRunSummarySchema,
  ToolSessionSummarySchema,
} from '@siliconbox/shared';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-error';
import { useJson } from '../hooks/use-json';
import type { ToolAction } from '../tool-actions';
import { RunDetail } from './run-detail';

const readRuns = (body: unknown) => z.array(ToolRunSummarySchema).safeParse(body).data ?? null;

/** The learner's proof runs (the newest 50): open one to see it as it was. */
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
              <>
                <RunDetail runId={run.id} />
                <RunActions
                  runId={run.id}
                  onDelete={() => void remove(run.id)}
                  onAction={onAction}
                />
              </>
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

type RunActionsProps = {
  runId: string;
  onDelete: () => void;
  onAction: (action: ToolAction) => void;
};

/** Restore the run into a new session, or delete it. */
function RunActions({ runId, onDelete, onAction }: RunActionsProps) {
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
      {problem !== null && <p className="text-[13px] text-destructive">{problem}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
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
