'use client';

import {
  API_ROUTES,
  RUN_POLL_DELAYS_MS,
  type RunView,
  RunViewSchema,
  isRunSettling,
} from '@siliconbox/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/api-error';

export type RunPhase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'waiting'; view: RunView }
  | { kind: 'done'; view: RunView }
  | { kind: 'failed'; message: string };

/** About ten minutes of polling: longer than any level's solver timeout plus a queue. */
const MAX_POLLS = 120;
const TOO_LONG = 'The run is taking longer than expected. Run again in a moment to see its result.';

const pollDelay = (attempt: number): number =>
  RUN_POLL_DELAYS_MS[Math.min(attempt, RUN_POLL_DELAYS_MS.length - 1)] ?? RUN_POLL_DELAYS_MS[0];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A run view, or the message to show when the request failed. */
async function readView(request: Promise<Response>): Promise<RunView | string> {
  const response = await request.catch(() => null);
  if (response?.ok !== true) return errorMessage(response);
  return RunViewSchema.parse(await response.json());
}

/** The phase to show for this answer from the server, and whether to keep polling. */
function phaseFor(result: RunView | string, attempt: number): { phase: RunPhase; poll: boolean } {
  if (typeof result === 'string')
    return { phase: { kind: 'failed', message: result }, poll: false };
  if (!isRunSettling(result)) return { phase: { kind: 'done', view: result }, poll: false };
  if (attempt >= MAX_POLLS) return { phase: { kind: 'failed', message: TOO_LONG }, poll: false };
  return { phase: { kind: 'waiting', view: result }, poll: true };
}

/**
 * Starts a run of the learner's properties and polls it (1 s, 2 s, then every 5 s) until the
 * solver answers. Only the code leaves the browser; the server attaches the Drill's settings.
 * A newer run, or leaving the page, stops the older one's polling.
 */
export function useDrillRun(drillId: string) {
  const [phase, setPhase] = useState<RunPhase>({ kind: 'idle' });
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const run = useCallback(
    async (properties: string) => {
      generation.current += 1;
      const mine = generation.current;
      setPhase({ kind: 'starting' });
      let result = await readView(
        fetch(API_ROUTES.drillRuns(drillId), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ properties, requestId: crypto.randomUUID() }),
        }),
      );
      for (let attempt = 0; generation.current === mine; attempt += 1) {
        const next = phaseFor(result, attempt);
        setPhase(next.phase);
        if (!next.poll || typeof result === 'string') return;
        await sleep(pollDelay(attempt));
        if (generation.current === mine) result = await readView(fetch(API_ROUTES.run(result.id)));
      }
    },
    [drillId],
  );

  return { phase, run };
}
