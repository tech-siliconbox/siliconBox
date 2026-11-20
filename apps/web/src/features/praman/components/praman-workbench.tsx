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
import { Button } from '@/components/ui/button';
import { errorMessage, sendToApi } from '@/lib/api-error';
import { SessionView } from './session-view';

type WorkbenchProps = { initialSessions: ToolSessionSummary[]; ceilings: PramanCeilings };

const readSessions = (body: unknown) => z.array(ToolSessionSummarySchema).parse(body);
const json = (data: unknown): RequestInit => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

/** The learner's Praman sessions: pick one to work in, start, rename or delete one. */
export function PramanWorkbench({ initialSessions, ceilings }: WorkbenchProps) {
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <SessionBar
        sessions={sessions}
        current={current}
        onSelect={setCurrent}
        onCreate={() => void create()}
        onChanged={(select) => void refresh(select)}
        onError={setError}
      />
      {error !== null && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
      {current === null ? (
        <p className="text-[13px] text-muted-foreground">
          Start a session, then add your design and property files, or load the example.
        </p>
      ) : (
        <div className="min-h-0 flex-1">
          <SessionView key={current} sessionId={current} ceilings={ceilings} />
        </div>
      )}
    </div>
  );
}

type SessionBarProps = {
  sessions: ToolSessionSummary[];
  current: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onChanged: (select?: string | null) => void;
  onError: (message: string | null) => void;
};

function SessionBar({
  sessions,
  current,
  onSelect,
  onCreate,
  onChanged,
  onError,
}: SessionBarProps) {
  const chosen = sessions.find((session) => session.id === current);

  const rename = async () => {
    const name = window.prompt('Name this session', chosen?.name)?.trim();
    if (current === null || !name) return;
    const body = { name: name.slice(0, TOOL_SESSION_NAME_MAX_CHARS) };
    const { error } = await sendToApi(API_ROUTES.toolSession(current), {
      method: 'PATCH',
      ...json(body),
    });
    onError(error?.message ?? null);
    onChanged();
  };
  const remove = async () => {
    if (current === null) return;
    const { error } = await sendToApi(API_ROUTES.toolSession(current), { method: 'DELETE' });
    onError(error?.message ?? null);
    onChanged(sessions.find((session) => session.id !== current)?.id ?? null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SessionPicker sessions={sessions} current={current} onSelect={onSelect} />
      <Button size="sm" onClick={onCreate}>
        New session
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={chosen === undefined}
        onClick={() => void rename()}
      >
        Rename
      </Button>
      <DeleteButton disabled={chosen === undefined} onDelete={() => void remove()} />
    </div>
  );
}

type PickerProps = Pick<SessionBarProps, 'sessions' | 'current' | 'onSelect'>;

function SessionPicker({ sessions, current, onSelect }: PickerProps) {
  return (
    <label className="flex items-center gap-2 text-[13px] font-semibold">
      Session
      <select
        value={current ?? ''}
        onChange={(event) => onSelect(event.target.value)}
        disabled={sessions.length === 0}
        className="h-8 rounded-[7px] border border-border bg-background px-2 text-[13px] font-normal"
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Deleting takes a second click: the session goes with its runs. */
function DeleteButton({ disabled, onDelete }: { disabled: boolean; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const click = () => {
    setConfirming(!confirming);
    if (confirming) onDelete();
  };
  return (
    <Button
      size="sm"
      variant={confirming ? 'danger' : 'secondary'}
      disabled={disabled}
      onClick={click}
    >
      {confirming ? 'Delete it and its runs' : 'Delete'}
    </Button>
  );
}
