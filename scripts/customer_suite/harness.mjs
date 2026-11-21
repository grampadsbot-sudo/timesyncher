import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { chromeHits } from '../harness/chrome.mjs';
import { BANNED_AI_HOST, RESULTS_ROOT, VIEWPORTS, scrub } from './config.mjs';

const require = createRequire(import.meta.url);

const EXTRA_CHROME_RES = [
  /\[object Object\]/,
  /\bNaN\b/,
  /\bundefined\b/,
  /\bTODO\b/,
  /\bFIXME\b/,
];

function resolvePlaywright(home = os.homedir()) {
  const candidates = [
    path.join(home, 'tsv-dispatch/capture/node_modules/playwright'),
    'playwright',
    'playwright-core',
    path.join(home, 'ais-work-suite/node_modules/playwright'),
    '/tmp/pw/node_modules/playwright',
    path.join(home, '.npm/_npx/e41f203b7505f1fb/node_modules/playwright'),
  ];
  for (const candidate of candidates) {
    if (candidate.includes('node_modules') && !fs.existsSync(path.join(candidate, 'package.json'))) continue;
    try {
      const mod = require(candidate);
      if (mod?.chromium) return mod;
    } catch (error) {
      void error;
    }
  }
  throw new Error('Playwright chromium module not found');
}

function runId(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

export function createRun({ id = runId(), root = RESULTS_ROOT } = {}) {
  const dir = path.join(root, id);
  const shotsDir = path.join(dir, 'screenshots');
  fs.mkdirSync(shotsDir, { recursive: true });
  return { id, dir, shotsDir };
}

export async function launchBrowser() {
  const pw = resolvePlaywright();
  return pw.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

export async function newViewportPage(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.touch,
    isMobile: vp.touch,
    deviceScaleFactor: 1,
  });
  await context.route('**/*', (route) => {
    const reqUrl = route.request().url();
    try {
      const host = new URL(reqUrl).hostname.toLowerCase();
      if (host === BANNED_AI_HOST || host.endsWith(`.${BANNED_AI_HOST}`)) {
        return route.abort('blockedbyclient');
      }
      if (host === 'www.timesyncher.com' || host === 'travel.timesyncher.com' || host === 'timesyncher.com') {
        return route.abort('blockedbyclient');
      }
    } catch (error) {
      void error;
    }
    return route.continue();
  });
  const page = await context.newPage();
  return { context, page, vp };
}

export async function visibleText(page, selector = 'body') {
  return page.evaluate((sel) => {
    const el = sel ? document.querySelector(sel) : document.body;
    return String(el?.innerText || '');
  }, selector);
}

export function copyViolations(text, { requireVacation = false, requireAi = false, forbidTrip = true } = {}) {
  const value = String(text || '');
  const hits = [];
  const chrome = chromeHits(value);
  for (const phrase of chrome) hits.push(`stub-chrome:${phrase}`);
  for (const re of EXTRA_CHROME_RES) {
    const match = value.match(re);
    if (match) hits.push(`engineering-chrome:${match[0]}`);
  }
  if (forbidTrip) {
    const tripMatch = value.match(/\btrips?\b/i);
    if (tripMatch) hits.push(`banned-copy:${tripMatch[0]}`);
  }
  if (requireVacation && !/\bvacations?\b|\bvacay\b/i.test(value)) {
    hits.push('missing-copy:vacation');
  }
  if (requireAi && !/\bAI\b/.test(value)) {
    hits.push('missing-copy:AI');
  }
  return hits;
}

export class Scenario {
  constructor(run, id, title) {
    this.run = run;
    this.id = id;
    this.title = title;
    this.steps = [];
    this.assertions = [];
    this.notes = [];
    this.meta = {};
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
    this.error = null;
    this.skipped = false;
    this.blocked = null;
  }

  check(step, expect, ok, actual) {
    const row = {
      step,
      expect,
      ok: Boolean(ok),
      actual: actual === undefined ? undefined : scrub(String(actual)).slice(0, 400),
    };
    this.assertions.push(row);
    return row.ok;
  }

  async expectText(page, step, want, { not = false, viewport = '', selector = 'body' } = {}) {
    const text = await visibleText(page, selector);
    const hit = want instanceof RegExp ? want.test(text) : text.includes(want);
    const label = `${viewport ? `[${viewport}] ` : ''}${not ? 'no visible text' : 'visible text'} ${want instanceof RegExp ? want.toString() : JSON.stringify(want)}`;
    const ok = not ? !hit : hit;
    const excerpt = want instanceof RegExp ? (text.match(want)?.[0] ?? text.slice(-240)) : (ok && !not ? want : text.slice(-240));
    return this.check(step, label, ok, excerpt);
  }

  async expectCleanCopy(page, step, { viewport = '', selector = 'body', requireVacation = true, requireAi = false, forbidTrip = true } = {}) {
    const text = await visibleText(page, selector);
    const hits = copyViolations(text, { requireVacation, requireAi, forbidTrip });
    const label = `${viewport ? `[${viewport}] ` : ''}visible text clean copy (vacation not trip; no stub chrome${requireAi ? '; AI' : ''})`;
    return this.check(step, label, hits.length === 0, hits.length ? hits.join(', ') : 'clean');
  }

  async shoot(step, pages) {
    const shots = {};
    const n = String(this.steps.length + 1).padStart(2, '0');
    const slug = step.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    for (const vp of VIEWPORTS) {
      const page = pages[vp.name];
      if (!page) continue;
      const file = path.join(this.run.shotsDir, `${this.id}-${n}-${slug}-${vp.width}.png`);
      await page.screenshot({ path: file, fullPage: false });
      shots[vp.width] = file;
    }
    this.steps.push({ step, at: new Date().toISOString(), screenshots: shots });
    return shots;
  }

  get ok() {
    if (this.skipped) return true;
    return !this.blocked && !this.error && this.assertions.length > 0 && this.assertions.every((a) => a.ok);
  }

  failures() {
    return [
      ...this.assertions.filter((a) => !a.ok),
      ...(this.error ? [{ step: 'error', expect: 'scenario runs to the end', ok: false, actual: scrub(this.error) }] : []),
    ];
  }

  failureShots() {
    const first = this.failures()[0];
    const hit = first && [...this.steps].reverse().find((s) => s.step === first.step);
    return (hit || this.steps.at(-1))?.screenshots || {};
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      status: this.skipped ? 'skipped' : this.blocked ? 'blocked' : this.ok ? 'pass' : 'fail',
      blockedBy: this.blocked || undefined,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      steps: this.steps,
      assertions: this.assertions,
      notes: this.notes,
      meta: Object.keys(this.meta).length ? this.meta : undefined,
      error: this.error ? scrub(this.error) : null,
    };
  }
}

export async function runScenario(sc, fn) {
  try {
    await fn(sc);
  } catch (error) {
    sc.error = String(error?.stack || error).split('\n').slice(0, 4).join(' | ');
  }
  sc.finishedAt = new Date().toISOString();
  return sc;
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${scrub(JSON.stringify(data, null, 2))}\n`);
}
