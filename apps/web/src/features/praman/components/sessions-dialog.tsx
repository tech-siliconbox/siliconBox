'use client';

import { TOOL_SESSIONS_KEPT, type ToolSessionSummary } from '@siliconbox/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { ToolDialog } from './tool-dialog';

type SessionsDialogProps = {
  sessions: ToolSessionSummary[];
  current: string | null;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** The learner's saved sessions: open one, rename it, or delete it with its runs. */
export function SessionsDialog({ sessions, current, onClose, ...actions }: SessionsDialogProps) {
  return (
    <ToolDialog title="Sessions" onClose={onClose}>
      <p className="mb-3 text-muted-foreground">
        You keep up to {TOOL_SESSIONS_KEPT} sessions. Each opens again from where you left it.
      </p>
      {sessions.length === 0 ? (
        <p>No sessions yet: File &gt; New Session starts one.</p>
      ) : (
        <ul className="flex max-h-80 flex-col divide-y divide-border overflow-auto border border-border">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              current={session.id === current}
              {...actions}
            />
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end">
        <Button size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </ToolDialog>
  );
}

type SessionRowProps = Omit<SessionsDialogProps, 'sessions' | 'current' | 'onClose'> & {
  session: ToolSessionSummary;
  current: boolean;
};

function SessionRow({ session, current, onOpen, onRename, onDelete }: SessionRowProps) {
  const [confirming, setConfirming] = useState(false);
  const rename = () => {
    const name = window.prompt('Name this session', session.name)?.trim();
    if (name) onRename(session.id, name);
  };
  return (
    <li className={cn('flex items-center gap-2 px-3 py-2', current && 'bg-info-light')}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{session.name}</p>
        <p className="text-[12px] text-muted-foreground">
          {session.top === '' ? 'No design elaborated' : `Top ${session.top}`} · last used{' '}
          {when(session.lastUsedAt)}
        </p>
      </div>
      <Button size="sm" disabled={current} onClick={() => onOpen(session.id)}>
        {current ? 'Open now' : 'Open'}
      </Button>
      <Button size="sm" variant="secondary" onClick={rename}>
        Rename
      </Button>
      <Button
        size="sm"
        variant={confirming ? 'danger' : 'secondary'}
        onClick={() => (confirming ? onDelete(session.id) : setConfirming(true))}
      >
        {confirming ? 'Delete it and its runs' : 'Delete'}
      </Button>
    </li>
  );
}
