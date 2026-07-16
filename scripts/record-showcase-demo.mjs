/* global process, console, document, window */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseUrl = process.env.RACEPROOF_DEMO_URL ?? 'http://127.0.0.1:4173';
const outputDirectory = resolve('docs/assets/raw-video-showcase');

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

async function focus(target) {
  await target.evaluate((element) => element.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await hold(900);
}

async function top() {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await hold(900);
}

async function label(step, title, detail) {
  await page.evaluate(({ nextStep, nextTitle, nextDetail }) => {
    const overlay = document.getElementById('raceproof-demo-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    window.setTimeout(() => {
      overlay.querySelector('[data-demo-step]').textContent = nextStep;
      overlay.querySelector('[data-demo-title]').textContent = nextTitle;
      overlay.querySelector('[data-demo-detail]').textContent = nextDetail;
      overlay.classList.add('visible');
    }, 120);
  }, { nextStep: step, nextTitle: title, nextDetail: detail });
  await hold(450);
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.addStyleTag({ content: `
    #raceproof-demo-overlay { position: fixed; z-index: 10000; right: 18px; bottom: 18px; width: min(420px, calc(100vw - 36px)); padding: 16px 18px; border: 1px solid rgba(66,215,200,.78); border-radius: 12px; background: rgba(7,20,29,.94); box-shadow: 0 16px 40px rgba(0,0,0,.35); color: #f4fbff; opacity: 0; transform: translateY(10px); transition: opacity .2s ease, transform .2s ease; pointer-events: none; }
    #raceproof-demo-overlay.visible { opacity: 1; transform: translateY(0); }
    #raceproof-demo-overlay small { display: block; margin-bottom: 5px; color: #42d7c8; font: 800 11px/1.2 ui-sans-serif, system-ui; letter-spacing: .12em; text-transform: uppercase; }
    #raceproof-demo-overlay strong { display: block; font: 800 22px/1.15 ui-sans-serif, system-ui; letter-spacing: -.02em; }
    #raceproof-demo-overlay span { display: block; margin-top: 6px; color: #d4e2ea; font: 15px/1.35 ui-sans-serif, system-ui; }
  ` });
  await page.evaluate(() => {
    const overlay = document.createElement('aside');
    overlay.id = 'raceproof-demo-overlay';
    overlay.innerHTML = '<small data-demo-step></small><strong data-demo-title></strong><span data-demo-detail></span>';
    document.body.append(overlay);
  });

  await label('RaceProof', 'Explore schedules your tests never run', 'Deterministic concurrency testing for TypeScript.');
  await hold(1_100);

  await page.getByTestId('run-exploration').click();
  const violation = page.getByTestId('result-violation');
  await violation.waitFor({ state: 'visible', timeout: 10_000 });
  await label('01 / 06', 'Violation found', 'The retry and original completion charged one order twice.');
  await focus(violation);
  await hold(1_600);

  const timeline = page.getByRole('heading', { name: 'Step through the schedule' });
  await label('02 / 06', 'Replay the exact event order', 'Step through actors, transitions, and immutable state changes.');
  await focus(timeline);
  await page.getByTestId('timeline-next').click();
  await hold(1_500);

  const code = page.locator('.generated-panel .code-block');
  await label('03 / 06', 'Export the regression', 'RaceProof turns the schedule into a portable Vitest test.');
  await focus(code);
  await hold(2_100);

  await top();
  await page.getByRole('button', { name: 'Fixed', exact: true }).click();
  await page.getByTestId('run-exploration').click();
  const success = page.getByTestId('result-success');
  await success.waitFor({ state: 'visible', timeout: 10_000 });
  await label('04 / 06', 'Verify within bounds', 'The idempotent model has no violation within selected bounds.');
  await focus(success);
  await hold(1_900);

  await top();
  await page.getByRole('button', { name: /Inventory Overselling/ }).click();
  await page.getByRole('button', { name: 'Buggy', exact: true }).click();
  await page.getByTestId('run-exploration').click();
  await violation.waitFor({ state: 'visible', timeout: 10_000 });
  await label('05 / 06', 'Catch inventory overselling', 'Two customers can race for the last item.');
  await focus(violation);
  await hold(1_900);

  await top();
  await page.getByRole('button', { name: /Out-of-Order Chat/ }).click();
  await page.getByTestId('run-exploration').click();
  await violation.waitFor({ state: 'visible', timeout: 10_000 });
  await label('06 / 06', 'Catch out-of-order delivery', 'An edit can arrive before its message.');
  await focus(violation);
  await hold(3_000);
} finally {
  await context.close();
  await browser.close();
}

console.log(await video.path());
