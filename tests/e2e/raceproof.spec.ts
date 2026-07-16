import { expect, test } from '@playwright/test';

test.describe('RaceProof judge journey', () => {
  test('finds, replays, exports, and verifies the duplicate-payment fix', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'RaceProof' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buggy', exact: true })).toHaveAttribute('aria-pressed', 'true');

    const run = page.getByTestId('run-exploration');
    await run.click();
    await expect(page.getByTestId('result-violation')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('result-violation')).toContainText('A single order can be charged no more than once');

    const next = page.getByTestId('timeline-next');
    await expect(next).toBeEnabled();
    await next.click();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { name: 'Turn this schedule into a Vitest regression' })).toBeVisible();
    await expect(page.locator('.code-block')).toContainText("replayTrace(system, trace)");

    await page.getByRole('button', { name: 'Fixed', exact: true }).click();
    await run.click();
    await expect(page.getByTestId('result-success')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('result-success')).toContainText('No violation found within selected bounds');
  });

  test('has keyboard-operable primary controls and no mobile page overflow', async ({ page }) => {
    await page.goto('/');
    const run = page.getByTestId('run-exploration');
    await run.focus();
    await expect(run).toBeFocused();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buggy', exact: true })).toHaveAttribute('aria-pressed', 'true');

    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  });
});
