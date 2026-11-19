import { readFileSync } from 'node:fs';
import {
  API_ROUTES,
  type ToolPollView,
  type ToolRunDetail,
  type ToolRunSummary,
  type ToolSessionSummary,
} from '@siliconbox/shared';
import type { APIRequestContext } from '@playwright/test';
import { grantAccess, signInAsAdmin } from './cms/publish';
import { BASE_URL } from './base-url';
import { expect, newLearner, signUp, test } from './helpers';

// Praman's API (ADR 0031): a learner with a tool window and a plan proves a design in a session
// of their own. Needs the solver API and its session supervisor (`pnpm --filter
// @siliconbox/solver dev`) with the same SOLVER_SIGNING_KEY. The design and properties are the
// solver's own invented test fixtures.
const FIXTURES = new URL('../../solver/tests/fixtures/', import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');
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
const WRITE = { headers: { origin: BASE_URL } };

test.describe.configure({ mode: 'serial' });

async function poll(request: APIRequestContext, sessionId: string, after = 0) {
  const response = await request.get(API_ROUTES.toolSessionPoll(sessionId), {
    params: { after, version: -1 },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as ToolPollView;
}

/** Opens the session and waits until the solver holds it. */
async function openAndWait(request: APIRequestContext, sessionId: string): Promise<void> {
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

test('Praman needs a plan and a tool window', async ({ page }) => {
  expect((await page.request.get(API_ROUTES.toolSessions)).status()).toBe(401);
  const learner = newLearner();
  await signUp(page, learner);
  expect((await page.request.get(API_ROUTES.toolSessions)).status()).toBe(403);

  const support = await signInAsAdmin('support');
  await grantAccess(support, learner.email, 'tool');
  // A tool window without a plan: no plan, no tool access.
  expect((await page.request.get(API_ROUTES.toolSessions)).status()).toBe(403);
  await grantAccess(support, learner.email);
  expect((await page.request.get(API_ROUTES.toolSessions)).status()).toBe(200);

  const unknownField = await page.request.post(API_ROUTES.toolSessions, {
    ...WRITE,
    data: { name: 'Session', depth: 500 },
  });
  expect(unknownField.status()).toBe(400);
});

test('a learner proves a design in a session of their own', async ({ page, browser }) => {
  const learner = newLearner();
  await signUp(page, learner);
  const support = await signInAsAdmin('support');
  await grantAccess(support, learner.email);
  await grantAccess(support, learner.email, 'tool');
  const request = page.request;

  const created = await request.post(API_ROUTES.toolSessions, { ...WRITE, data: { name: 'Counter' } });
  expect(created.status()).toBe(201);
  const session = (await created.json()) as ToolSessionSummary;

  await openAndWait(request, session.id);
  for (const [name, text] of Object.entries(FILES)) {
    const put = await request.put(API_ROUTES.toolSessionFiles(session.id), { ...WRITE, data: { name, text } });
    expect(put.status()).toBe(200);
  }
  const command = await request.post(API_ROUTES.toolSessionCommands(session.id), {
    ...WRITE,
    data: { line: SCRIPT },
  });
  expect(command.status()).toBe(202);

  const snapshot = (await settle(request, session.id)) as { properties: { id: string; status: string }[] };
  const status = Object.fromEntries(snapshot.properties.map((prop) => [prop.id, prop.status]));
  expect(status.ap_stays_in_range).toBe('cex');

  // The run is in the learner's history, with the failing assertion's trace kept.
  const runs = (await (await request.get(API_ROUTES.toolRuns)).json()) as ToolRunSummary[];
  expect(runs).toHaveLength(1);
  expect(runs[0]?.status).toBe('complete');
  const run = (await (await request.get(API_ROUTES.toolRun(runs[0]?.id ?? ''))).json()) as ToolRunDetail;
  expect(run.files.map((file) => file.name).sort()).toEqual(['bind.sv', 'counter_bug.sv', 'counter_props.sv', 'pm.tcl']);
  const trace = await request.get(API_ROUTES.toolRunTrace(run.id), {
    params: { property: 'ap_stays_in_range' },
  });
  expect(trace.status()).toBe(200);
  expect(JSON.stringify(await trace.json())).toContain('count');

  const script = await request.get(API_ROUTES.toolSessionScript(session.id));
  expect(script.headers()['content-disposition']).toContain('.tcl');
  expect(await script.text()).toContain('prove -all');

  // Another learner sees neither the session nor the run.
  const other = await browser.newContext({ baseURL: BASE_URL });
  const otherPage = await other.newPage();
  const otherLearner = newLearner();
  await signUp(otherPage, otherLearner);
  await grantAccess(support, otherLearner.email);
  await grantAccess(support, otherLearner.email, 'tool');
  expect((await otherPage.request.get(API_ROUTES.toolSessionPoll(session.id))).status()).toBe(404);
  expect((await otherPage.request.get(API_ROUTES.toolRun(run.id))).status()).toBe(404);
  await other.close();

  // The data download holds the session's files and the run; deleting removes them.
  const exported = JSON.stringify(await (await request.get(API_ROUTES.dataExport)).json());
  expect(exported).toContain('counter_bug.sv');
  expect(exported).toContain('ap_stays_in_range');
  expect((await request.delete(API_ROUTES.toolSession(session.id), WRITE)).status()).toBe(204);
  expect(await (await request.get(API_ROUTES.toolRuns)).json()).toEqual([]);
});
