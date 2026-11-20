import { API_ROUTES, ROUTES } from '@siliconbox/shared';
import type { Locator, Page } from '@playwright/test';
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

/** The text the editor has selected: the line it was asked to show. */
const selectedText = (editor: Locator) =>
  editor.evaluate((area: HTMLTextAreaElement) =>
    area.value.slice(area.selectionStart, area.selectionEnd),
  );

test('a property opens at its line, the log finds it, and the check dialogs run', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await provedSession(page);
  await openTool(page);

  // Show Source opens the file at the property's line.
  await page.getByRole('button', { name: new RegExp(`Actions for .*${PROPERTY}$`) }).click();
  await page.getByRole('menuitem', { name: /^Show Source/ }).click();
  const editor = page.getByLabel('counter_props.sv', { exact: true });
  await expect.poll(() => selectedText(editor)).toContain(`${PROPERTY}  : assert property`);
  // A result in the log chooses its property in the table.
  await page
    .getByRole('log')
    .getByRole('button', { name: new RegExp(PROPERTY) })
    .first()
    .click();
  await expect(page.locator('tr[aria-selected="true"]')).toContainText(PROPERTY);

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

  // The chosen property: only its engine detail in the log, and Prove Selected Property.
  await page.getByRole('button', { name: /^Engine detail/ }).click();
  await page.getByRole('button', { name: 'Only this property' }).click();
  await expect(page.getByRole('button', { name: 'Only this property' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await menu(page, 'Prove', 'Prove Selected Property');
  await expectRan(page, new RegExp(`^% prove -property \\S*${PROPERTY}$`));

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
  const coverTrace = page.getByRole('dialog', { name: /Waveform of/ });
  await expect(coverTrace.locator('svg').first()).toBeVisible();
  // Visualize is modal: close it to go on with the tool.
  await coverTrace.getByRole('button', { name: 'Close' }).click();

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
  await expect(
    page
      .getByRole('dialog', { name: /Waveform of/ })
      .locator('svg')
      .first(),
  ).toBeVisible();
});

/** The rows shown in Visualize saved as a signal list, kept with the session, and shown again. */
async function saveAndShowAList(visualize: Locator) {
  await visualize.getByLabel('Signal lists').selectOption('save');
  await visualize.getByLabel('Name of the signal list').fill('counting');
  await visualize.getByRole('button', { name: 'Save list' }).click();
  await expect(visualize.getByText('Saved the list counting.')).toBeVisible();
  await visualize.getByLabel('Signal lists').selectOption('show:counting');
  await expect(visualize.getByText('List: counting')).toBeVisible();
  await expect(visualize.getByRole('button', { name: 'count == 3', exact: true })).toBeVisible();
}

test('Visualize shows why, what drove a signal, expressions, and what if', async ({ page }) => {
  test.setTimeout(300_000);
  await provedSession(page);
  await openTool(page);

  // A right click on the row opens its menu: View Trace.
  const row = page.getByRole('row').filter({ hasText: PROPERTY }).filter({ hasText: 'CEX' });
  await row.first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^View Trace/ }).click();
  const visualize = page.getByRole('dialog', { name: /Waveform of/ });
  await expect(visualize.getByText(/fails at cycle \d+ · \d+ cycles/)).toBeVisible();

  // Choose the count row, then ask why it has its value at the cursor.
  await visualize.getByRole('button', { name: 'count', exact: true }).first().click();
  await visualize.getByRole('button', { name: 'Why?' }).click();
  await expect(visualize.getByRole('region', { name: 'Drivers' })).toContainText('count');
  await visualize.getByRole('tab', { name: 'Why diagram' }).click();
  await expect(visualize.getByRole('tabpanel').last()).toContainText('count');

  // An expression row, and Find.
  await visualize.getByLabel('Add an expression row').fill('count == 3');
  await visualize.getByLabel('Add an expression row').press('Enter');
  await expect(visualize.getByRole('button', { name: 'count == 3', exact: true })).toBeVisible();
  // Find looks forward from the cursor: from the first cycle, count reaches 3.
  await visualize.getByRole('button', { name: '|◀' }).click();
  await visualize.getByLabel('Find a cycle where an expression holds').fill('count == 3');
  await visualize.getByLabel('Find a cycle where an expression holds').press('Enter');
  await expect(visualize.getByText(/cannot|does not hold/)).toHaveCount(0);

  await saveAndShowAList(visualize);

  await visualize.getByRole('button', { name: 'Quiet trace' }).click();
  await expect(visualize.getByRole('button', { name: 'Original trace' })).toBeVisible({
    timeout: CHECK_TIMEOUT,
  });
  await visualize.getByRole('button', { name: 'Original trace' }).click();
  await visualize.getByRole('button', { name: 'Another counterexample' }).click();
  await expect(visualize.getByText('Proving the what-if…')).toBeHidden({ timeout: CHECK_TIMEOUT });
  await expect(
    visualize.getByRole('button', { name: 'Original trace' }).or(visualize.getByRole('status')),
  ).toBeVisible();
  if (await visualize.getByRole('button', { name: 'Original trace' }).isVisible()) {
    await visualize.getByRole('button', { name: 'Original trace' }).click();
  }

  // Hold en at its value in cycle 2 and prove again: a new trace, or why there is none.
  await visualize.getByRole('button', { name: 'en', exact: true }).first().click();
  await visualize.getByRole('button', { name: '▶|' }).click();
  await visualize.getByRole('button', { name: 'Pin value' }).click();
  await visualize.getByRole('button', { name: 'Pin', exact: true }).click();
  // Clear pins takes them all away; pin again and prove.
  await visualize.getByRole('button', { name: 'Clear pins' }).click();
  await expect(visualize.getByRole('button', { name: /^Prove with/ })).toHaveCount(0);
  await visualize.getByRole('button', { name: 'Pin value' }).click();
  await visualize.getByRole('button', { name: 'Pin', exact: true }).click();
  await visualize.getByRole('button', { name: /^Prove with/ }).click();
  await expect(visualize.getByText('Proving the what-if…')).toBeHidden({ timeout: CHECK_TIMEOUT });
  await expect(
    visualize.getByText('What-if trace', { exact: true }).or(visualize.getByRole('status')),
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
  // The run as it was: what changed since run 1, its log, and its files.
  const run = page.getByRole('region', { name: 'Run 2' });
  await run.getByRole('tab', { name: 'Changes' }).click();
  await expect(run.getByText('No property changed since the run before.')).toBeVisible();
  await run.getByRole('tab', { name: 'Log' }).click();
  await expect(run.getByRole('log')).toContainText('Completed proof');
  await run.getByRole('tab', { name: /^Files/ }).click();
  await run.getByRole('button', { name: 'counter_props.sv' }).click();
  await expect(run.getByLabel('counter_props.sv', { exact: true })).toHaveValue(
    /ap_stays_in_range/,
  );

  await page.getByRole('button', { name: 'Restore Into a New Session' }).click();
  await expect(page.getByText('Restored run 2')).toBeVisible();
  await expect(page.getByText('Session open')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('tab', { name: 'Files' }).click();
  await expect(page.getByRole('button', { name: 'restored_run.tcl', exact: true })).toBeVisible();
});
