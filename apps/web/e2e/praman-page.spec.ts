import { ROUTES } from '@siliconbox/shared';
import type { Locator, Page } from '@playwright/test';
import { grantAccess, signInAsAdmin } from './cms/publish';
import { expect, failOnCspViolation, newLearner, signUp, test } from './helpers';

// Praman's page (ADR 0031): a learner loads the example, proves it, and sees the failing assertion
// with its waveform. Needs the solver API and its session supervisor, as praman-api.spec.ts does.

test.describe.configure({ mode: 'serial' });

const PROOF_TIMEOUT = 120_000;

test('without a plan and a tool window Praman is locked', async ({ page }) => {
  await signUp(page, newLearner());
  await page.goto(ROUTES.tool);
  await expect(page.getByText('Locked')).toBeVisible();
  await expect(page.getByRole('link', { name: 'See pricing' })).toBeVisible();
});

/** From the header link to a proof of the example: a new session, its files, the setup, Prove. */
async function startAndProveTheExample(page: Page) {
  await page.getByRole('link', { name: 'Praman' }).first().click();
  await expect(page.getByRole('heading', { name: 'Praman', exact: true })).toBeVisible();
  // A first visit shows how Praman works, with a way to start.
  await expect(page.getByRole('heading', { name: 'How Praman works' })).toBeVisible();
  await page.getByRole('button', { name: 'New Session' }).click();
  await expect(page.getByText('Session open')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Load Example Files' }).click();
  await page.getByRole('tab', { name: 'Files' }).click();
  await expect(page.getByRole('button', { name: 'fifo.sv', exact: true })).toBeVisible();
  const tools = page.getByRole('toolbar', { name: 'Praman tools' });
  await tools.getByRole('button', { name: 'Analyze' }).click();
  await tools.getByRole('button', { name: 'Elaborate' }).click();
  await page.getByLabel('Top module').fill('fifo');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await tools.getByRole('button', { name: 'Clock / Reset' }).click();
  // Praman found the design's clock and reset: the dialog offers them.
  const setup = page.getByRole('dialog', { name: 'Clock and Reset' });
  await expect(setup.getByLabel('Clock')).toHaveValue('clk');
  await expect(setup.getByLabel('Reset', { exact: true })).toHaveValue('rst_n');
  await setup.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Elaborated fifo')).toBeVisible();
  await tools.getByRole('button', { name: 'Prove' }).click();
}

/** Keys move Visualize's cursor; Shift+click sets a second one, and the cycles between show. */
async function moveTheCursor(page: Page, visualize: Locator) {
  const cursorTools = visualize.getByRole('toolbar', { name: 'Visualize tools' });
  await page.keyboard.press('Home');
  await expect(cursorTools).toContainText('cycle 0');
  await page.keyboard.press('ArrowRight');
  await expect(cursorTools).toContainText('cycle 1');
  await visualize
    .getByRole('button', { name: /^Move the cursor here/ })
    .first()
    .click({ modifiers: ['Shift'], position: { x: 4, y: 8 } });
  await expect(cursorTools).toContainText('Δ 1 from 0');
}

/** The log grows from the bar above it; View > Reset Layout puts it back. */
async function resizeTheLog(page: Page) {
  const log = page.getByRole('region', { name: 'Log' });
  const height = async () => (await log.boundingBox())?.height ?? 0;
  const before = await height();
  await page.getByRole('button', { name: /^Resize the log/ }).press('ArrowUp');
  await page.getByRole('button', { name: /^Resize the log/ }).press('ArrowUp');
  await expect.poll(height).toBeGreaterThan(before + 20);
  await page.getByRole('menuitem', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reset Layout' }).click();
  await expect.poll(height).toBeLessThanOrEqual(before + 1);
}

/** A file dragged onto the tool is added; File > Run Script From File adds a script, runs it. */
async function addFilesFromTheComputer(page: Page) {
  const dropped = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['module extra; endmodule\n'], 'extra.sv'));
    return data;
  });
  await page.getByRole('menubar').dispatchEvent('dragover', { dataTransfer: dropped });
  await page
    .getByText('Drop the files to add them to the session')
    .dispatchEvent('drop', { dataTransfer: dropped });
  await expect(page.getByRole('tab', { name: 'Files (4)' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Run Script From File…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'summary.tcl',
    mimeType: 'text/plain',
    buffer: Buffer.from('report\n'),
  });
  await expect(
    page.getByRole('log').getByText('% source summary.tcl', { exact: true }),
  ).toBeVisible();
}

test('a learner proves the example and opens the waveform of the failing assertion', async ({
  page,
}) => {
  test.setTimeout(240_000);
  failOnCspViolation(page);
  const learner = newLearner();
  await signUp(page, learner);
  const support = await signInAsAdmin('support');
  await grantAccess(support, learner.email);
  await grantAccess(support, learner.email, 'tool');

  await startAndProveTheExample(page);

  // The assertion's own row (its related covers have rows too) shows its counterexample.
  const failing = page
    .getByRole('row')
    .filter({ hasText: 'a_no_overflow' })
    .filter({ hasText: 'CEX' });
  await expect(failing.first()).toBeVisible({ timeout: PROOF_TIMEOUT });
  // The proof's clock against its limit (Basic: 5 minutes), and the table's filters.
  await expect(page.getByTitle('Time of the proof / its time limit')).toHaveText(
    /^\d\d:\d\d:\d\d \/ 00:05:00$/,
  );
  await expect(page.getByRole('tab', { name: 'Files (3)' })).toBeVisible();
  await page.getByRole('button', { name: /^Failing/ }).click();
  await expect(page.getByRole('row').filter({ hasText: 'a_flags' })).toHaveCount(0);
  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page.getByRole('row').filter({ hasText: 'a_flags' })).toHaveCount(1);
  await failing.first().getByRole('button', { name: 'Waveform' }).click();
  // Visualize: the trace on a cycle ruler, at the failing cycle, with why it fails.
  const visualize = page.getByRole('dialog', { name: /Waveform of/ });
  await expect(visualize.getByText(/fails at cycle \d+ · \d+ cycles/)).toBeVisible();
  await expect(visualize.getByRole('button', { name: 'Go to failure' })).toBeVisible();
  await expect(visualize).toContainText('count');
  await expect(visualize.getByRole('region', { name: 'Details' })).toContainText('fails at cycle');
  await moveTheCursor(page, visualize);
  await visualize.getByRole('button', { name: 'Close' }).click();

  await resizeTheLog(page);
  await addFilesFromTheComputer(page);

  // Help reopens how Praman works.
  await page.getByRole('menuitem', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: 'How Praman Works' }).click();
  await expect(page.getByRole('heading', { name: 'How Praman works' })).toBeVisible();
  await page.getByRole('tab', { name: 'Properties Table' }).click();

  // A menu item runs its Tcl command, which the log echoes.
  await page.getByRole('menuitem', { name: 'Reports', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Summary/ }).click();
  await expect(page.getByRole('log').getByText('% report', { exact: true })).toBeVisible();

  // File > Sessions lists the session, open now.
  await page.getByRole('menuitem', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sessions…' }).click();
  const sessions = page.getByRole('dialog', { name: 'Sessions' });
  await expect(sessions.getByRole('button', { name: 'Open now' })).toBeDisabled();

  // Deleting takes a second click; the session goes with its runs (and closes on the tool).
  await sessions.getByRole('button', { name: 'Delete' }).click();
  await sessions.getByRole('button', { name: 'Delete it and its runs' }).click();
  await expect(sessions.getByText('No sessions yet')).toBeVisible();
});

test('on a phone the page asks for a larger screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const learner = newLearner();
  await signUp(page, learner);
  const support = await signInAsAdmin('support');
  await grantAccess(support, learner.email);
  await grantAccess(support, learner.email, 'tool');
  await page.goto(ROUTES.tool);
  await expect(page.getByText('Open this page on a computer or a tablet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Session' })).toBeHidden();
});
