import { API_ROUTES, type ToolRunSummary, type ToolSessionSummary } from '@siliconbox/shared';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './helpers';
import {
  PROPERTY,
  WRITE,
  closeOpened,
  fixture,
  openAndWait,
  provedSession,
  runLine,
} from './praman';

// Praman's deeper checks over the API (ADR 0031): what-if and quiet traces, drivers, the HTML
// report, coverage and equivalence traces, and comparing and restoring runs. Each test proves
// the solver's invented counter fixture (its count passes 9) in a session of its own learner.

test.describe.configure({ mode: 'serial' });

const CHECK_TIMEOUT = 300_000;

test.afterEach(async ({ page }) => closeOpened(page.request));

type WhatIfResult = { verdict: string; message: string; trace: unknown };

/** A what-if's result: a slow one answers 202 with an id, read again until it is proven. */
async function whatIf(request: APIRequestContext, sessionId: string, body: object) {
  let response = await request.post(API_ROUTES.toolSessionWhatIf(sessionId), {
    ...WRITE,
    data: body,
  });
  for (let attempt = 0; response.status() === 202 && attempt < 120; attempt += 1) {
    const { requestId } = (await response.json()) as { requestId: string };
    await new Promise((resolve) => setTimeout(resolve, 1000));
    response = await request.get(API_ROUTES.toolSessionWhatIfResult(sessionId, requestId));
  }
  expect(response.status()).toBe(200);
  return (await response.json()) as WhatIfResult;
}

test('the deeper routes need a signed-in learner and valid input', async ({ page }) => {
  const sessionId = crypto.randomUUID();
  for (const url of [
    API_ROUTES.toolSessionDrivers(sessionId),
    API_ROUTES.toolSessionCoverageTrace(sessionId),
    API_ROUTES.toolSessionEquivalenceTrace(sessionId),
    API_ROUTES.toolSessionReport(sessionId),
  ]) {
    expect((await page.request.get(url)).status(), url).toBe(401);
  }
  const { request, sessionId: own } = await provedSession(page);
  const tooFar = await request.get(API_ROUTES.toolSessionDrivers(own), {
    params: { property: PROPERTY, signal: 'counter.count', cycle: 5000 },
  });
  expect(tooFar.status()).toBe(400);
  const unknownField = await request.post(API_ROUTES.toolSessionWhatIf(own), {
    ...WRITE,
    data: { property: PROPERTY, quiet: true, depth: 500 },
  });
  expect(unknownField.status()).toBe(400);
});

test('a learner asks what if, what drove a signal, and for the report', async ({ page }) => {
  test.setTimeout(CHECK_TIMEOUT);
  const { request, sessionId } = await provedSession(page);

  const quiet = await whatIf(request, sessionId, { property: PROPERTY, quiet: true });
  expect(quiet.verdict).toBe('FAIL');
  expect(JSON.stringify(quiet.trace)).toContain('count');
  const pinned = await whatIf(request, sessionId, {
    property: PROPERTY,
    pins: [{ signal: 'en', cycle: 2, value: '0' }],
  });
  expect(['FAIL', 'PASS', 'VACUOUS']).toContain(pinned.verdict);

  const drivers = await request.get(API_ROUTES.toolSessionDrivers(sessionId), {
    params: { property: PROPERTY, signal: 'counter.count', cycle: 3 },
  });
  expect(drivers.status()).toBe(200);
  expect(JSON.stringify(await drivers.json())).toContain('count');

  const report = await request.get(API_ROUTES.toolSessionReport(sessionId));
  expect(report.status()).toBe(200);
  expect(report.headers()['content-disposition']).toMatch(/\.html"$/);
  expect(report.headers()['content-security-policy']).toContain('sandbox');
  expect(await report.text()).toContain(PROPERTY);
});

type Snapshot = {
  coverage: { items: { label: string; instance: string; status: string }[] } | null;
  equivalence: { status: string; has_trace?: boolean } | null;
};

test('coverage and equivalence checks open the traces behind them', async ({ page }) => {
  test.setTimeout(CHECK_TIMEOUT);
  const { request, sessionId } = await provedSession(page);

  const covered = ((await runLine(request, sessionId, 'check_cov')) as Snapshot).coverage;
  const item = covered?.items.find((each) => each.status === 'covered');
  expect(item).toBeDefined();
  const coverTrace = await request.get(API_ROUTES.toolSessionCoverageTrace(sessionId), {
    params: { label: item?.label ?? '', instance: item?.instance ?? '' },
  });
  expect(coverTrace.status()).toBe(200);

  // The fixed counter wraps at 9; the analyzed one does not: they differ.
  const put = await request.put(API_ROUTES.toolSessionFiles(sessionId), {
    ...WRITE,
    data: { name: 'counter_fixed.sv', text: fixture('counter.sv') },
  });
  expect(put.status()).toBe(200);
  const line = 'check_equivalence -revised {counter_fixed.sv}';
  const equivalence = ((await runLine(request, sessionId, line)) as Snapshot).equivalence;
  expect(equivalence?.status).toBe('different');
  const difference = await request.get(API_ROUTES.toolSessionEquivalenceTrace(sessionId));
  expect(difference.status()).toBe(200);
  expect(JSON.stringify(await difference.json())).toContain('count');
});

test('a run is compared with the one before and restored into a new session', async ({ page }) => {
  test.setTimeout(CHECK_TIMEOUT);
  const { request, sessionId } = await provedSession(page);
  await runLine(request, sessionId, 'prove -all');
  const runs = (await (await request.get(API_ROUTES.toolRuns)).json()) as ToolRunSummary[];
  const [second, first] = runs;
  expect(second?.number).toBe(2);

  const diff = await request.get(API_ROUTES.toolRunDiff(second?.id ?? ''));
  expect(diff.status()).toBe(200);
  expect(await diff.json()).toEqual({ against: first?.id, changed: [], added: [], removed: [] });

  const restored = await request.post(API_ROUTES.toolRunRestore(first?.id ?? ''), WRITE);
  expect(restored.status()).toBe(201);
  const session = (await restored.json()) as ToolSessionSummary;
  expect(session.name).toBe('Restored run 1');
  const script = await request.get(API_ROUTES.toolSessionFiles(session.id), {
    params: { name: 'restored_run.tcl' },
  });
  expect(script.status()).toBe(200);
  expect(JSON.stringify(await script.json())).toContain('prove -all');
});

test('signal lists are kept with the session, and closing it keeps its work', async ({ page }) => {
  test.setTimeout(CHECK_TIMEOUT);
  const { request, sessionId } = await provedSession(page);
  const lists = API_ROUTES.toolSessionSignalLists(sessionId);
  const list = {
    name: 'counting',
    top: 'counter',
    rows: [
      { kind: 'signal', path: 'counter.count' },
      { kind: 'expr', text: 'count == 3' },
    ],
  };
  expect((await request.put(lists, { ...WRITE, data: list })).status()).toBe(204);
  expect(await (await request.get(lists)).json()).toEqual([list]);
  // A query operator in place of a path is refused.
  const operator = { ...list, rows: [{ kind: 'signal', path: { $ne: '' } }] };
  expect((await request.put(lists, { ...WRITE, data: operator })).status()).toBe(400);
  const named = `${lists}?${new URLSearchParams({ name: 'counting', top: 'counter' })}`;
  expect((await request.delete(named, WRITE)).status()).toBe(204);
  expect(await (await request.get(lists)).json()).toEqual([]);

  // The page going away closes the session on the tool; its files stay and it opens again.
  const open = API_ROUTES.toolSessionOpen(sessionId);
  expect((await request.delete(open, WRITE)).status()).toBe(204);
  const file = await request.get(API_ROUTES.toolSessionFiles(sessionId), {
    params: { name: 'bind.sv' },
  });
  expect(((await file.json()) as { text: string }).text).toContain('bind counter');
  await openAndWait(request, sessionId);
  expect(await runLine(request, sessionId, 'report')).toBeTruthy();
});
