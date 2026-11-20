'use client';

import {
  API_ROUTES,
  type PramanCeilings,
  TOOL_SESSION_NAME_MAX_CHARS,
  type ToolSessionSummary,
  ToolSessionSummarySchema,
} from '@siliconbox/shared';
import { useState } from 'react';
import { z } from 'zod';
import { errorMessage, sendToApi } from '@/lib/api-error';
import { PramanScreen } from './praman-screen';
import { SessionView } from './session-view';
import { SessionsDialog } from './sessions-dialog';

type WorkbenchProps = { initialSessions: ToolSessionSummary[]; ceilings: PramanCeilings };

const readSessions = (body: unknown) => z.array(ToolSessionSummarySchema).parse(body);
const json = (data: unknown): RequestInit => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

/** The learner's Praman sessions: the chosen one on the screen, and starting or managing them. */
function useSessions(initialSessions: ToolSessionSummary[]) {
  const [sessions, setSessions] = useState(initialSessions);
  const [current, setCurrent] = useState(initialSessions[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (select?: string | null) => {
    const response = await fetch(API_ROUTES.toolSessions).catch(() => null);
    if (response?.ok === true) setSessions(readSessions(await response.json()));
    if (select !== undefined) setCurrent(select);
  };
  const create = async () => {
    const name = `Session ${sessions.length + 1}`;
    const response = await fetch(API_ROUTES.toolSessions, {
      method: 'POST',
      ...json({ name }),
    }).catch(() => null);
    if (response?.ok !== true) {
      setError(await errorMessage(response));
      return;
    }
    setError(null);
    await refresh(ToolSessionSummarySchema.parse(await response.json()).id);
  };
  const rename = async (id: string, name: string) => {
    const body = { name: name.slice(0, TOOL_SESSION_NAME_MAX_CHARS) };
    const { error } = await sendToApi(API_ROUTES.toolSession(id), {
      method: 'PATCH',
      ...json(body),
    });
    setError(error?.message ?? null);
    await refresh();
  };
  const remove = async (id: string) => {
    const { error } = await sendToApi(API_ROUTES.toolSession(id), { method: 'DELETE' });
    setError(error?.message ?? null);
    const next = current === id ? (sessions.find((s) => s.id !== id)?.id ?? null) : current;
    await refresh(next);
  };
  return { sessions, current, setCurrent, error, create, rename, remove, refresh };
}

/** Praman's page: the screen for the chosen session (or none yet), and the Sessions dialog. */
export function PramanWorkbench({ initialSessions, ceilings }: WorkbenchProps) {
  const work = useSessions(initialSessions);
  const [listing, setListing] = useState(false);
  const screen = {
    ceilings,
    notice: work.error,
    onNewSession: () => void work.create(),
    onSessions: () => setListing(true),
    // A restored run is a new session: list it, and open it.
    onOpenSession: (id: string) => void work.refresh(id),
  };
  const chosen = work.sessions.find((session) => session.id === work.current);
  return (
    <>
      {work.current === null ? (
        <PramanScreen session={null} {...screen} />
      ) : (
        <SessionView
          key={work.current}
          sessionId={work.current}
          name={chosen?.name ?? ''}
          {...screen}
        />
      )}
      {listing && (
        <SessionsDialog
          sessions={work.sessions}
          current={work.current}
          onOpen={(id) => {
            work.setCurrent(id);
            setListing(false);
          }}
          onRename={(id, name) => void work.rename(id, name)}
          onDelete={(id) => void work.remove(id)}
          onClose={() => setListing(false)}
        />
      )}
    </>
  );
}
