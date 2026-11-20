import { readFileSync } from 'node:fs';
import { API_ROUTES, type ToolPollView, type ToolSessionSummary } from '@siliconbox/shared';
import type { APIRequestContext, Page } from '@playwright/test';
import { grantAccess, signInAsAdmin } from './cms/publish';
import { BASE_URL } from './base-url';
import { expect, newLearner, signUp } from './helpers';

// Praman's sessions over the API (ADR 0031), for the specs that need a proved design. They need
// the solver API and its session supervisor with the same SOLVER_SIGNING_KEY. The design and
// properties are the solver's own invented test fixtures.
const FIXTURES = new URL('../../solver/tests/fixtures/', import.meta.url);
export const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');
const FILES = {
  'counter_bug.sv': fixture('counter_bug.sv'),
  'counter_props.sv': fixture('counter_props.sv'),
  'bind.sv': 'bind counter counter_props u_props(.*);\n',
};
const SCRIPT = [
  'analyze -sv counter_bug.sv counter_props.sv bind.sv',
  'elaborate -top counter',
  'clock clk',
  'reset !rst_n',
  'prove -all',
].join('; ');
export const WRITE = { headers: { origin: BASE_URL } };

async function poll(request: APIRequestContext, sessionId: string, after = 0) {
  const response = await request.get(API_ROUTES.toolSessionPoll(sessionId), {
    params: { after, version: -1 },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as ToolPollView;
}

/** Opens the session and waits until the solver holds it. */
export async function openAndWait(request: APIRequestContext, sessionId: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const opened = await request.post(API_ROUTES.toolSessionOpen(sessionId), WRITE);
    if (opened.status() === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`session ${sessionId} did not open`);
}

/** Polls until the session's commands and proof are done; the last state Praman sent. */
async function settle(request: APIRequestContext, sessionId: string) {
  let snapshot: Record<string, unknown> | null = null;
  let after = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const view = await poll(request, sessionId, after);
    after = view.seq;
    snapshot = view.snapshot ?? snapshot;
    if (attempt > 1 && !view.busy && !view.proofRunning) return snapshot;
  }
  throw new Error(`session ${sessionId} stayed busy`);
}

/** Runs one console line and waits until it (and any proof it starts) is done. */
export async function runLine(request: APIRequestContext, sessionId: string, line: string) {
  const command = await request.post(API_ROUTES.toolSessionCommands(sessionId), {
    ...WRITE,
    data: { line },
  });
  expect(command.status()).toBe(202);
  return (await settle(request, sessionId)) ?? {};
}

/** Adds the counter files, runs the script and answers each property's status. */
export async function proveCounter(request: APIRequestContext, sessionId: string) {
  for (const [name, text] of Object.entries(FILES)) {
    const put = await request.put(API_ROUTES.toolSessionFiles(sessionId), {
      ...WRITE,
      data: { name, text },
    });
    expect(put.status()).toBe(200);
  }
  const snapshot = (await runLine(request, sessionId, SCRIPT)) as {
    properties: { id: string; status: string }[];
  };
  return Object.fromEntries(snapshot.properties.map((prop) => [prop.id, prop.status]));
}

/** The counter's failing assertion. */
export const PROPERTY = 'ap_stays_in_range';

/**
 * Deletes the signed-in learner's sessions (each test has its own learner): the solver holds a
 * few open at once, so a test closes the ones it opened, a restored one too.
 */
export async function closeOpened(request: APIRequestContext) {
  const listed = await request.get(API_ROUTES.toolSessions);
  if (!listed.ok()) return;
  for (const session of (await listed.json()) as ToolSessionSummary[]) {
    await request.delete(API_ROUTES.toolSession(session.id), WRITE);
  }
}

/** A learner with a plan and a tool window, and an open session with the counter proved. */
export async function provedSession(page: Page) {
  const learner = newLearner();
  await signUp(page, learner);
  const support = await signInAsAdmin('support');
  await grantAccess(support, learner.email);
  await grantAccess(support, learner.email, 'tool');
  const request = page.request;
  const created = await request.post(API_ROUTES.toolSessions, { ...WRITE, data: { name: 'C' } });
  const sessionId = ((await created.json()) as ToolSessionSummary).id;
  await openAndWait(request, sessionId);
  expect((await proveCounter(request, sessionId))[PROPERTY]).toBe('cex');
  return { request, sessionId };
}
