import { readFileSync } from 'node:fs';
import { API_ROUTES, RUN_POLL_DELAYS_MS, type RunView } from '@siliconbox/shared';
import type { APIRequestContext, Page } from '@playwright/test';
import { createDoc, grantAccess, paragraph, signInAsAdmin } from './cms/publish';
import { expect, newLearner, signUp, test } from './helpers';

// Phase 3: a learner runs their properties on a Drill through the solver. Needs the solver API
// and a worker (`pnpm --filter @siliconbox/solver dev`) with the same SOLVER_SIGNING_KEY.
// The design and properties are the solver's own invented test fixtures.
const FIXTURES = new URL('../../solver/tests/fixtures/', import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');
const run = crypto.randomUUID().slice(0, 8);
// A unique comment keeps the first run of each test session out of the run cache.
const BUGGY_DESIGN = `${fixture('counter_bug.sv')}\n// e2e ${run}\n`;
const PROPERTIES = fixture('counter_props.sv');
const BASE_URL = 'http://localhost:3000';

test.describe.configure({ mode: 'serial' });

let drillId = '';

test('an editor publishes a Drill whose design has a seeded bug', async () => {
  const editor = await signInAsAdmin('editor');
  const course = await createDoc(editor, 'courses', {
    title: `Invented run course ${run}`,
    slug: `e2e-run-course-${run}`,
    level: 'basic',
    order: 1,
    _status: 'published',
  });
  const module = await createDoc(editor, 'modules', {
    title: 'Invented run module',
    slug: `e2e-run-module-${run}`,
    course: course.id,
    order: 1,
  });
  const drill = await createDoc(editor, 'drills', {
    title: 'Invented counter Drill',
    slug: `e2e-run-drill-${run}`,
    module: module.id,
    order: 1,
    mode: 'bmc',
    solver: 'boolector',
    target: 'FAIL',
    depth: 20,
    timeoutSeconds: 60,
    topModule: 'counter',
    brief: [paragraph('Find the bug in this invented counter.')],
    designCode: BUGGY_DESIGN,
    starterCode: PROPERTIES,
    _status: 'published',
  });
  expect(drill.status).toBe(201);
  drillId = drill.publicId;
});

function startRun(page: Page, body: Record<string, unknown>) {
  return page.request.post(API_ROUTES.drillRuns(drillId), {
    data: body,
    headers: { origin: BASE_URL },
  });
}

async function waitForResult(request: APIRequestContext, runId: string): Promise<RunView> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const delay = RUN_POLL_DELAYS_MS[Math.min(attempt, RUN_POLL_DELAYS_MS.length - 1)];
    await new Promise((resolve) => setTimeout(resolve, delay));
    const view = (await (await request.get(API_ROUTES.run(runId))).json()) as RunView;
    if (view.state === 'done') return view;
  }
  throw new Error(`run ${runId} did not finish`);
}

test('a run needs both content and tool access for the Drill level', async ({ page, browser }) => {
  const learner = newLearner();
  await signUp(page, learner);
  const body = () => ({ properties: PROPERTIES, requestId: crypto.randomUUID() });

  expect((await startRun(page, body())).status()).toBe(403);
  const support = await signInAsAdmin('support');
  await grantAccess(support, learner.email);
  expect((await startRun(page, body())).status()).toBe(403); // content only, no tool window

  await grantAccess(support, learner.email, 'tool');
  const requestId = crypto.randomUUID();
  const started = await startRun(page, { properties: PROPERTIES, requestId });
  expect(started.status()).toBe(202);
  const queued = (await started.json()) as RunView;

  const done = await waitForResult(page.request, queued.id);
  expect(done.result?.status).toBe('FAIL');
  expect(done.result?.failedCheck).toBe('ap_stays_in_range');
  expect(done.solved).toBe(true); // a FAIL Drill is solved by catching the bug
  const failing = done.result?.checks.find((check) => check.status === 'FAIL');
  expect(failing?.trace?.signals.some((signal) => signal.name === 'count')).toBe(true);
  expect(JSON.stringify(done)).not.toMatch(/\/tmp|\/work|\/var\//);

  // A retried submit returns the same run instead of starting another.
  const retried = (await (
    await startRun(page, { properties: PROPERTIES, requestId })
  ).json()) as RunView;
  expect(retried.id).toBe(queued.id);

  // The same code again is answered from the cache, at once.
  const again = await startRun(page, body());
  expect(again.status()).toBe(200);
  const cached = (await again.json()) as RunView;
  expect(cached.state).toBe('done');
  expect(cached.result?.status).toBe('FAIL');

  // Another learner cannot read the run.
  const other = await browser.newContext({ baseURL: BASE_URL });
  const otherPage = await other.newPage();
  await signUp(otherPage, newLearner());
  expect((await otherPage.request.get(API_ROUTES.run(queued.id))).status()).toBe(404);
  await other.close();
});

test('a learner cannot choose solver settings', async ({ page }) => {
  await signUp(page, newLearner());
  for (const extra of [{ depth: 999 }, { solver: 'z3' }, { topModule: 'evil' }]) {
    const response = await startRun(page, {
      properties: PROPERTIES,
      requestId: crypto.randomUUID(),
      ...extra,
    });
    expect(response.status()).toBe(400);
  }
});
