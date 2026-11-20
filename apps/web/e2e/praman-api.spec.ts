import {
  API_ROUTES,
  type ToolRunDetail,
  type ToolRunLog,
  type ToolRunSummary,
  type ToolSessionSummary,
} from '@siliconbox/shared';
import type { APIRequestContext, Browser } from '@playwright/test';
import { grantAccess, signInAsAdmin } from './cms/publish';
import { BASE_URL } from './base-url';
import { expect, newLearner, signUp, test } from './helpers';
import { WRITE, openAndWait, proveCounter } from './praman';

// Praman's API (ADR 0031): a learner with a tool window and a plan proves a design in a session
// of their own. Needs the solver API and its session supervisor (`pnpm --filter
// @siliconbox/solver dev`) with the same SOLVER_SIGNING_KEY.
test.describe.configure({ mode: 'serial' });

/** Another learner, with access of their own, sees neither the session nor the run. */
async function expectHiddenFromAnotherLearner(
  browser: Browser,
  support: APIRequestContext,
  sessionId: string,
  runId: string,
) {
  const other = await browser.newContext({ baseURL: BASE_URL });
  const otherPage = await other.newPage();
  const otherLearner = newLearner();
  await signUp(otherPage, otherLearner);
  await grantAccess(support, otherLearner.email);
  await grantAccess(support, otherLearner.email, 'tool');
  expect((await otherPage.request.get(API_ROUTES.toolSessionPoll(sessionId))).status()).toBe(404);
  expect((await otherPage.request.get(API_ROUTES.toolRun(runId))).status()).toBe(404);
  await other.close();
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

/** The one run is in the learner's history, with the failing assertion's trace kept. */
async function expectTheRunKept(request: APIRequestContext): Promise<ToolRunDetail> {
  const runs = (await (await request.get(API_ROUTES.toolRuns)).json()) as ToolRunSummary[];
  expect(runs).toHaveLength(1);
  expect(runs[0]?.status).toBe('complete');
  const run = (await (
    await request.get(API_ROUTES.toolRun(runs[0]?.id ?? ''))
  ).json()) as ToolRunDetail;
  const names = run.files.map((file) => file.name).sort();
  expect(names).toEqual(['bind.sv', 'counter_bug.sv', 'counter_props.sv', 'pm.tcl']);
  const trace = await request.get(API_ROUTES.toolRunTrace(run.id), {
    params: { property: 'ap_stays_in_range' },
  });
  expect(trace.status()).toBe(200);
  expect(JSON.stringify(await trace.json())).toContain('count');
  // Its log, and its files as they were.
  const log = (await (await request.get(API_ROUTES.toolRunLog(run.id))).json()) as ToolRunLog;
  expect(log.events.map((event) => event.text).join('\n')).toContain('Completed proof');
  const bind = await request.get(API_ROUTES.toolRunFiles(run.id), { params: { name: 'bind.sv' } });
  expect(((await bind.json()) as { text: string }).text).toContain('bind counter');
  return run;
}

test('a learner proves a design in a session of their own', async ({ page, browser }) => {
  const learner = newLearner();
  await signUp(page, learner);
  const support = await signInAsAdmin('support');
  await grantAccess(support, learner.email);
  await grantAccess(support, learner.email, 'tool');
  const request = page.request;

  const created = await request.post(API_ROUTES.toolSessions, {
    ...WRITE,
    data: { name: 'Counter' },
  });
  expect(created.status()).toBe(201);
  const session = (await created.json()) as ToolSessionSummary;
  await openAndWait(request, session.id);
  expect((await proveCounter(request, session.id)).ap_stays_in_range).toBe('cex');
  const run = await expectTheRunKept(request);

  const script = await request.get(API_ROUTES.toolSessionScript(session.id));
  expect(script.headers()['content-disposition']).toContain('.tcl');
  expect(await script.text()).toContain('prove -all');
  await expectHiddenFromAnotherLearner(browser, support, session.id, run.id);

  // The data download holds the session's files and the run; deleting removes them.
  const exported = JSON.stringify(await (await request.get(API_ROUTES.dataExport)).json());
  expect(exported).toContain('counter_bug.sv');
  expect(exported).toContain('ap_stays_in_range');
  expect((await request.delete(API_ROUTES.toolSession(session.id), WRITE)).status()).toBe(204);
  expect(await (await request.get(API_ROUTES.toolRuns)).json()).toEqual([]);
});
