/* global process, console */
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const baseUrl = process.env.RACEPROOF_DEMO_URL ?? 'http://127.0.0.1:4173';
const output = resolve('docs/assets/video-frames/04-vitest-export.png');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  reducedMotion: 'reduce',
});
const page = await context.newPage();

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.getByTestId('run-exploration').click();
  await page.getByTestId('result-violation').waitFor({ state: 'visible', timeout: 10_000 });
  const code = page.locator('.generated-panel .code-block');
  await code.waitFor({ state: 'visible' });
  await code.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: output });
} finally {
  await context.close();
  await browser.close();
}

console.log(output);
