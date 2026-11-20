import { API_ROUTES, ROUTES } from '@siliconbox/shared';
import type { Page } from '@playwright/test';
import { expect, test } from './helpers';
import { PROPERTY, WRITE, closeOpened, fixture, provedSession } from './praman';

// Praman's deeper checks on the tool page (ADR 0031), a test per panel: the property row menu,
// the check dialogs, assertion strength, coverage and the proof core, equivalence, the waveform's
// what-if, quiet trace and drivers, the HTML report, and comparing and restoring runs. Each test
// proves the solver's invented counter fixture over the API, then works on the page.

test.describe.configure({ mode: 'serial' });

const CHECK_TIMEOUT = 120_000;

test.afterEach(async ({ page }) => closeOpened(page.request));

/** The tool page on the proved session. */
async function openTool(page: Page) {
  await page.goto(ROUTES.tool);
  await expect(page.getByText('Session open')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Elaborated counter')).toBeVisible();
}

/** Chooses an item of a menu of the bar (items show their Tcl command after the label). */
async function menu(page: Page, name: string, item: string) {
  await page.getByRole('menuitem', { name, exact: true }).click();
  await page
    .getByRole('menu', { name })
    .getByRole('menuitem', { name: new RegExp(`^${item}`) })
    .click();
}

/** The log shows the command a menu item or dialog ran. */
async function expectRan(page: Page, line: string | RegExp) {
  const text = typeof line === 'string' ? `% ${line}` : line;
  await expect(page.getByRole('log').getByText(text, { exact: true })).toBeVisible({
    timeout: CHECK_TIMEOUT,
  });
}

test('the row menu and the check dialogs run their Tcl commands', async ({ page }) => {
  test.setTimeout(300_000);
  await provedSession(page);
  await openTool(page);

  await page.getByRole('button', { name: new RegExp(`Actions for .*${PROPERTY}$`) }).click();
  await page.getByRole('menuitem', { name: /^Case Split/ }).click();
  const split = page.getByRole('dialog', { name: 'Case Split' });
  await split.getByLabel('Split by').selectOption('values');
  await split.getByLabel('Expression').fill('en');
  await split.getByRole('button', { name: 'Split' }).click();
  await expectRan(page, new RegExp(`^% case_split -property \\S*${PROPERTY} -values en$`));

  await menu(page, 'Prove', 'New Task');
  const task = page.getByRole('dialog', { name: 'New Task' });
  await task.getByLabel('Name').fill('no_enable');
  await task.getByRole('button', { name: 'Create' }).click();
  await expectRan(page, /^% task -create no_enable -copy \{.+\} -copy_assumes -set$/);

  await menu(page, 'Prove', 'Abstract a Register');
  const abstract = page.getByRole('dialog', { name: 'Abstract a Register' });
  await abstract.getByLabel('Register').fill('count');
  await abstract.getByRole('button', { name: 'Abstract' }).click();
  await expectRan(page, 'abstract -init_value count');

  await menu(page, 'Prove', 'Check Dead Ends');
  await expectRan(page, 'check_assumptions -dead_end');

  await menu(page, 'Prove', 'Load Connectivity');
  const connectivity = page.getByRole('dialog', { name: 'Connectivity' });
  await expect(connectivity.getByText(/No spreadsheet in the session/)).toBeVisible();
  await connectivity.getByRole('button', { name: 'Cancel' }).click();
});

test('strength, coverage and the proof core measure the proved design', async ({ page }) => {
  test.setTimeout(300_000);
  await provedSession(page);
  await openTool(page);

  await menu(page, 'Reports', 'Assertion Strength');
  await expect(page.getByRole('tab', { name: 'Assertion Strength' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText(/^\d+ of \d+ mutants detected$/)).toBeVisible({
    timeout: CHECK_TIMEOUT,
  });

  await menu(page, 'Reports', 'Formal Coverage');
  await expect(page.getByText(/^branches: \d+ of \d+/)).toBeVisible({ timeout: CHECK_TIMEOUT });
  await page
    .getByRole('button', { name: /^Trace/ })
    .first()
    .click();
  await expect(page.getByRole('region', { name: /Waveform of/ }).locator('svg')).toBeVisible();

  await menu(page, 'Reports', 'Proof Core');
  await expect(page.getByText(/^proof core: \d+ of \d+ lines relied on/)).toBeVisible({
    timeout: CHECK_TIMEOUT,
  });
});

test('the equivalence check shows where a revised design differs', async ({ page }) => {
  test.setTimeout(300_000);
  const { request, sessionId } = await provedSession(page);
  // The fixed counter wraps at 9; the analyzed one does not.
  await request.put(API_ROUTES.toolSessionFiles(sessionId), {
    ...WRITE,
    data: { name: 'counter_fixed.sv', text: fixture('counter.sv') },
  });
  await openTool(page);

  await menu(page, 'Reports', 'Equivalence Check');
  const dialog = page.getByRole('dialog', { name: 'Equivalence Check' });
  await dialog.getByLabel('counter_fixed.sv').check();
  await dialog.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Different', { exact: true })).toBeVisible({
    timeout: CHECK_TIMEOUT,
  });
  await page.getByRole('button', { name: 'View Difference' }).click();
  await expect(page.getByRole('region', { name: /Waveform of/ }).locator('svg')).toBeVisible();
});

test('the waveform asks what if, finds the quietest trace and shows drivers', async ({ page }) => {
  test.setTimeout(300_000);
  await provedSession(page);
  await openTool(page);

  const row = page.getByRole('row').filter({ hasText: PROPERTY }).filter({ hasText: 'CEX' });
  await row.first().getByRole('button', { name: 'Waveform' }).click();
  const waveform = page.getByRole('region', { name: /Waveform of/ });
  await expect(waveform.locator('svg')).toBeVisible();

  await waveform.getByLabel('Drivers of').selectOption('counter.count');
  await waveform.getByLabel('At cycle').fill('3');
  await waveform.getByRole('button', { name: 'Drivers' }).click();
  await expect(waveform.getByRole('region', { name: 'Drivers' })).toContainText('count');

  await waveform.getByRole('button', { name: 'Quiet Trace' }).click();
  await expect(waveform.getByText('what-if: quietest trace')).toBeVisible({
    timeout: CHECK_TIMEOUT,
  });

  await waveform.getByRole('button', { name: 'What If…' }).click();
  const whatIf = page.getByRole('dialog', { name: 'What If' });
  await whatIf.getByLabel('Signal').selectOption('counter.en');
  await whatIf.getByLabel('Cycle').fill('2');
  await whatIf.getByRole('button', { name: 'Prove' }).click();
  await expect(waveform.getByText('Proving the what-if…')).toBeHidden({ timeout: CHECK_TIMEOUT });
  // A new trace with the value held, or why there is none.
  await expect(
    waveform.getByText('what-if: counter.en = 0 @2').or(waveform.getByText(/With these values/)),
  ).toBeVisible();
});

test('a run is reported, compared and restored into a new session', async ({ page }) => {
  test.setTimeout(300_000);
  await provedSession(page);
  await openTool(page);

  const download = page.waitForEvent('download');
  await menu(page, 'Reports', 'Download Report');
  expect((await download).suggestedFilename()).toMatch(/\.html$/);

  const tools = page.getByRole('toolbar', { name: 'Praman tools' });
  await tools.getByRole('button', { name: 'Prove' }).click();
  // The first proof ran over the API; the log holds both.
  await expect(page.getByRole('log').getByText(/Completed proof/)).toHaveCount(2, {
    timeout: CHECK_TIMEOUT,
  });
  await menu(page, 'File', 'Run History');
  await page.getByRole('button', { name: /^Run 2/ }).click();
  await page.getByRole('button', { name: 'Compare With the Run Before' }).click();
  await expect(page.getByText('No property changed since the run before.')).toBeVisible();

  await page.getByRole('button', { name: 'Restore Into a New Session' }).click();
  await expect(page.getByText('Restored run 2')).toBeVisible();
  await expect(page.getByText('Session open')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('tab', { name: 'Files' }).click();
  await expect(page.getByRole('button', { name: 'restored_run.tcl', exact: true })).toBeVisible();
});
