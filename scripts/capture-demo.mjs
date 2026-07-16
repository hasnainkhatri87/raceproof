/* global process, console */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseUrl = process.env.RACEPROOF_DEMO_URL ?? 'http://127.0.0.1:5174';
const outputDirectory = resolve('docs/assets/video-frames');

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  reducedMotion: 'reduce',
});
const page = await context.newPage();

async function capture(name, target = page.locator('main')) {
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(outputDirectory, `${name}.png`) });
}

async function captureCard(name, eyebrow, title, body, footer) {
  const card = await context.newPage();
  await card.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; overflow: hidden; background: #07141d; color: #f4fbff; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      main { width: 100%; height: 100vh; padding: 8rem 10rem; display: flex; flex-direction: column; justify-content: center; background: radial-gradient(circle at 14% 10%, #0d3034 0, transparent 35%), linear-gradient(120deg, #07141d, #0b1f2b); }
      .eyebrow { margin: 0 0 1.5rem; color: #42d7c8; font-size: 1.1rem; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
      h1 { max-width: 920px; margin: 0; font-size: 5.25rem; line-height: .98; letter-spacing: -.075em; }
      p { max-width: 860px; margin: 2rem 0 0; color: #b7c8d4; font-size: 1.7rem; line-height: 1.42; }
      footer { margin-top: 4rem; color: #ffba63; font-size: 1.05rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    </style>
    <main><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${body}</p><footer>${footer}</footer></main>
  `);
  await card.screenshot({ path: resolve(outputDirectory, `${name}.png`) });
  await card.close();
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  await capture('01-ready');

  await page.getByTestId('run-exploration').click();
  const violation = page.getByTestId('result-violation');
  await violation.waitFor({ state: 'visible', timeout: 10_000 });
  await capture('02-violation', violation);

  await page.getByTestId('timeline-next').click();
  await page.keyboard.press('ArrowRight');
  const timeline = page.getByRole('heading', { name: 'Step through the schedule' });
  await capture('03-replay', timeline);

  const generated = page.getByRole('heading', { name: 'Turn this schedule into a Vitest regression' });
  await generated.waitFor({ state: 'visible' });
  await capture('04-vitest-export', generated);

  await page.getByRole('button', { name: 'Fixed', exact: true }).click();
  await page.getByTestId('run-exploration').click();
  const success = page.getByTestId('result-success');
  await success.waitFor({ state: 'visible', timeout: 10_000 });
  await capture('05-fixed', success);

  await page.getByRole('button', { name: /Inventory Overselling/ }).click();
  await page.getByRole('button', { name: 'Buggy', exact: true }).click();
  await page.getByTestId('run-exploration').click();
  await violation.waitFor({ state: 'visible', timeout: 10_000 });
  await capture('06-inventory', violation);

  await page.getByRole('button', { name: /Out-of-Order Chat/ }).click();
  await page.getByTestId('run-exploration').click();
  await violation.waitFor({ state: 'visible', timeout: 10_000 });
  await capture('07-chat', violation);

  await captureCard(
    '00-title',
    'OpenAI Build Week · Developer Tools',
    'RaceProof',
    'Deterministic concurrency testing for TypeScript. Explore the timelines your tests never run.',
    'Local · replayable · bounded',
  );
  await captureCard(
    '08-build-week',
    'How it was built',
    'GPT-5.6 + Codex',
    'Used for architecture, implementation, testing, performance work, and security review. RaceProof has no AI at runtime.',
    'No API keys · no model dependency · no remote service',
  );

  console.log(`Captured demo frames in ${outputDirectory}`);
} finally {
  await context.close();
  await browser.close();
}