'use client';

import { API_ROUTES, ERRORS, type ToolEvent, ToolPollViewSchema } from '@siliconbox/shared';
import { useEffect, useState } from 'react';
import { type PramanSnapshot, PramanSnapshotSchema } from '../praman-snapshot';

/** Log lines kept in the page; the session keeps its whole log. */
const MAX_EVENTS = 5_000;
const BUSY_POLL_MS = 1_000;
const IDLE_POLL_MS = 2_500;
const OPEN_RETRY_MS = 2_000;

export type Place = 'opening' | 'waiting' | 'open' | 'closed';

export type SessionState = {
  place: Place;
  /** In the waiting line: 1 for the next session to open. */
  position: number | null;
  events: ToolEvent[];
  snapshot: PramanSnapshot | null;
  busy: boolean;
  proofRunning: boolean;
  secondsLeft: number | null;
  error: string | null;
};

const INITIAL: SessionState = {
  place: 'opening',
  position: null,
  events: [],
  snapshot: null,
  busy: false,
  proofRunning: false,
  secondsLeft: null,
  error: null,
};

type Answer = { ok: boolean; status: number; code: string | null; body: unknown };

async function call(url: string, init?: RequestInit): Promise<Answer> {
  const response = await fetch(url, init).catch(() => null);
  if (response === null) return { ok: false, status: 0, code: null, body: null };
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  const error = (body as { error?: { code?: string } } | null)?.error;
  return { ok: response.ok, status: response.status, code: error?.code ?? null, body };
}

const send = (url: string, method: string, data?: unknown) =>
  call(url, {
    method,
    ...(data === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
  });

const messageOf = (answer: Answer) =>
  (answer.body as { error?: { message?: string } } | null)?.error?.message ??
  ERRORS.INTERNAL.message;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Update = (change: (now: SessionState) => SessionState) => void;
type Cursor = { after: number; version: number; alive: boolean };

/** Opens the session, waiting in line while the tool is full; false when it cannot open. */
async function openSession(sessionId: string, cursor: Cursor, update: Update): Promise<boolean> {
  while (cursor.alive) {
    const answer = await send(API_ROUTES.toolSessionOpen(sessionId), 'POST');
    if (answer.status === 200) {
      update((now) => ({ ...now, place: 'open', position: null, error: null }));
      return true;
    }
    if (answer.status !== 202 && answer.code !== 'TOOL_SESSION_ELSEWHERE') {
      update((now) => ({ ...now, place: 'closed', error: messageOf(answer) }));
      return false;
    }
    const position = (answer.body as { position?: number | null } | null)?.position ?? null;
    update((now) => ({ ...now, place: 'waiting', position }));
    await sleep(OPEN_RETRY_MS);
  }
  return false;
}

/** One poll: new log lines and state; true while the session is working. */
async function pollOnce(sessionId: string, cursor: Cursor, update: Update): Promise<boolean> {
  const url = `${API_ROUTES.toolSessionPoll(sessionId)}?after=${cursor.after}&version=${cursor.version}`;
  const answer = await call(url);
  const view = answer.ok ? ToolPollViewSchema.safeParse(answer.body) : null;
  if (view?.success !== true) {
    update((now) => ({ ...now, error: messageOf(answer) }));
    return false;
  }
  const next = view.data;
  cursor.after = next.seq;
  cursor.version = next.version;
  const snapshot = next.snapshot === null ? null : PramanSnapshotSchema.safeParse(next.snapshot);
  update((now) => ({
    ...now,
    place: next.state,
    position: next.position,
    events: [...now.events, ...next.events].slice(-MAX_EVENTS),
    snapshot: snapshot?.success === true ? snapshot.data : now.snapshot,
    busy: next.busy,
    proofRunning: next.proofRunning,
    secondsLeft: next.secondsLeft,
    error: null,
  }));
  return next.busy || next.proofRunning;
}

/** What the page asks of the session; one closed while idle opens again first. */
function sessionActions(sessionId: string, reopen: () => Promise<boolean>, update: Update) {
  const request = async (url: string, method: string, data?: unknown): Promise<string | null> => {
    let answer = await send(url, method, data);
    if (answer.code === 'TOOL_SESSION_CLOSED' && (await reopen())) {
      answer = await send(url, method, data);
    }
    if (answer.ok) return null;
    const message = messageOf(answer);
    update((now) => ({ ...now, error: message }));
    return message;
  };
  const files = API_ROUTES.toolSessionFiles(sessionId);
  return {
    command: (line: string) => request(API_ROUTES.toolSessionCommands(sessionId), 'POST', { line }),
    stop: () => request(API_ROUTES.toolSessionStop(sessionId), 'POST'),
    putFile: (name: string, text: string) => request(files, 'PUT', { name, text }),
    deleteFile: (name: string) => request(`${files}?name=${encodeURIComponent(name)}`, 'DELETE'),
  };
}
export type SessionActions = ReturnType<typeof sessionActions>;

/** One session's link to the server: opens it, then polls until stopped. */
class SessionClient {
  readonly actions: SessionActions;
  private cursor: Cursor = { after: 0, version: -1, alive: false };

  constructor(
    private readonly sessionId: string,
    private readonly update: Update,
  ) {
    const reopen = () => openSession(this.sessionId, this.cursor, this.update);
    this.actions = sessionActions(sessionId, reopen, update);
  }

  start(): void {
    const mine: Cursor = { after: 0, version: -1, alive: true };
    this.cursor = mine;
    void this.run(mine);
  }

  stop(): void {
    this.cursor.alive = false;
  }

  private async run(mine: Cursor): Promise<void> {
    if (!(await openSession(this.sessionId, mine, this.update))) return;
    while (mine.alive) {
      const working = await pollOnce(this.sessionId, mine, this.update);
      await sleep(working ? BUSY_POLL_MS : IDLE_POLL_MS);
    }
  }
}

/**
 * A Praman session in the page (ADR 0031): opens it on the formal tool (waiting in line when the
 * tool is full), polls its log and state while the page is open, and sends commands. A session the
 * tool closed while idle opens again from its last save on the next command. Render it keyed by
 * the session id: another session starts from a fresh state.
 */
export function usePramanSession(sessionId: string) {
  const [state, setState] = useState<SessionState>(INITIAL);
  const [client] = useState(() => new SessionClient(sessionId, setState));
  useEffect(() => {
    client.start();
    return () => client.stop();
  }, [client]);
  return { state, actions: client.actions };
}
