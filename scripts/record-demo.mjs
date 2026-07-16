/* global process, console, window */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseUrl = process.env.RACEPROOF_DEMO_URL ?? 'http://127.0.0.1:4173';
const outputDirectory = resolve('docs/assets/raw-video');

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  colorScheme: 'dark',
  reducedMotion: 'reduce',
  recordVideo: { dir: outputDirectory, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const video = page.video();

const hold = (milliseconds) => page.waitForTimeout(milliseconds);

async function show(target) {
  await target.scrollIntoViewIfNeeded();
  await hold(750);
}

async function backToTop() {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await hold(1_000);
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });

  // Scene 1: orient the viewer to the bundled systems.
  await hold(8_000);
  await page.getByRole('button', { name: /Inventory Overselling/ }).click();
  await hold(4_000);
  await page.getByRole('button', { name: /Out-of-Order Chat/ }).click();
  await hold(4_000);
  await page.getByRole('button', { name: /Duplicate Payment/ }).click();
  await hold(7_000);

  // Scene 2: let the buggy payment explorer discover the real invariant failure.
  await page.getByTestId('run-exploration').click();
  const violation = page.getByTestId('result-violation');
  await violation.waitFor({ state: 'visible', timeout: 10_000 });
  await hold(10_000);
  await show(violation);
  await hold(14_000);

  // Scene 3: replay the counterexample and expose state changes.
  const timeline = page.getByRole('heading', { name: 'Step through the schedule' });
  await show(timeline);
  await hold(4_000);
  await page.getByTestId('timeline-next').click();
  await hold(5_000);
  await page.keyboard.press('ArrowRight');
  await hold(4_000);
  await show(page.getByRole('heading', { name: 'Before and after' }));
  await hold(5_000);

  // Scene 4: show the exported regression test.
  await show(page.getByRole('heading', { name: 'Turn this schedule into a Vitest regression' }));
  await hold(17_000);

  // Scene 5: show the fixed bounded-safe run.
  await backToTop();
  await page.getByRole('button', { name: 'Fixed', exact: true }).click();
  await page.getByTestId('run-exploration').click();
  const success = page.getByTestId('result-success');
  await success.waitFor({ state: 'visible', timeout: 10_000 });
  await hold(10_000);
  await show(success);
  await hold(8_000);

  // Scene 6: prove the two other bundled examples are real systems, too.
  await backToTop();
  await page.getByRole('button', { name: /Inventory Overselling/ }).click();
  await page.getByRole('button', { name: 'Buggy', exact: true }).click();
  await page.getByTestId('run-exploration').click();
  await violation.waitFor({ state: 'visible', timeout: 10_000 });
  await hold(8_000);
  await backToTop();
  await page.getByRole('button', { name: /Out-of-Order Chat/ }).click();
  await page.getByTestId('run-exploration').click();
  await violation.waitFor({ state: 'visible', timeout: 10_000 });
  await hold(9_000);
} finally {
  await context.close();
  await browser.close();
}

console.log(await video.path());
