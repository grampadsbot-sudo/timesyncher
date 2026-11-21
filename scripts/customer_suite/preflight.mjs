import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromeHits } from '../harness/chrome.mjs';
import { resolvePlaywright } from '../harness/live-outputs.mjs';
import { RESULTS, STAGING, servedBuild, writeJson } from './staging.mjs';

const VIEWPORTS = [
  { width: 390, height: 844, hasTouch: true, isMobile: true },
  { width: 1280, height: 800, hasTouch: false, isMobile: false },
];
const PUBLIC_API = new Set(['/api/checkout-products']);
const PAGES = [
  {
    id: 'signup-entry',
    path: '/login.html',
    expected: ['Sign In', 'Vacation onboarding'],
    blocker: 'The sign-in form has no submission handler. The customer app uses the onboarding link from checkout, and there is no public account deletion flow.',
  },
  {
    id: 'website-entry',
    path: '/',
    expected: ['Planning a Vacation', 'Vacation date', 'Go to step two'],
    blocker: 'The website gates onboarding behind checkout. A staging throwaway lifecycle covering checkout, account deletion, and vacation deletion is still required.',
  },
];

function safeRead(request) {
  const url = new URL(request.url());
  if (url.origin !== STAGING || !['GET', 'HEAD'].includes(request.method())) return false;
  if (request.isNavigationRequest()) return PAGES.some((page) => page.path === url.pathname) && !url.search;
  if (url.pathname.startsWith('/api/')) return PUBLIC_API.has(url.pathname);
  return !url.pathname.startsWith('/shared/') && !url.pathname.startsWith('/accept/');
}

async function inspect(page, run, scenario, width) {
  const assertions = [];
  const add = (expected, pass) => assertions.push({ expected, pass });
  const response = await page.goto(`${STAGING}${scenario.path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  add('public staging page returns HTTP 200', response?.status() === 200);
  const text = await page.locator('body').innerText({ timeout: 10_000 });
  for (const word of scenario.expected) add(`visible text includes "${word}"`, text.includes(word));
  add('visible copy uses vacation terminology', /\bvacations?\b/i.test(text) && !/\btrips?\b/i.test(text));
  add('visible AI copy uses uppercase AI', !/\bAi\b|\bai\b/.test(text));
  add('visible copy has no stub or engineering chrome', chromeHits(text).length === 0 && !/\b(?:undefined|NaN|TODO|Uncaught TypeError)\b|\[object Object\]/.test(text));
  const screenshot = path.join(run.dir, 'screenshots', `${scenario.id}-${width}.png`);
  await page.screenshot({ path: screenshot, animations: 'disabled', timeout: 10_000 });
  return { width, assertions, screenshot };
}

export async function runPreflight({ trigger = 'manual', expectedSha } = {}) {
  const sha = await servedBuild();
  if (expectedSha && expectedSha !== sha) throw new Error('staging build changed before the browser run');
  const timestamp = new Date().toISOString();
  const id = `${timestamp.replace(/[:.]/g, '')}-${randomUUID().slice(0, 8)}`;
  const dir = path.join(RESULTS, id);
  fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true, mode: 0o700 });
  const result = {
    run: id, dir, trigger, sha, target: STAGING, startedAt: timestamp,
    status: 'blocked', checks: PAGES.map(({ id, blocker }) => ({ id, blocker, evidence: [] })),
    cleanup: { accountsCreated: 0, accountsDeleted: 0, vacationsCreated: 0, vacationsDeleted: 0 },
  };
  const playwright = resolvePlaywright();
  if (playwright.missing) throw new Error('Playwright is unavailable through the host harness');
  const browser = await playwright.module.chromium.launch({ headless: true });
  try {
    for (const { width, height, hasTouch, isMobile } of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch, isMobile, serviceWorkers: 'block' });
      try {
        await context.route('**/*', async (route) => {
          if (!safeRead(route.request())) return route.abort('blockedbyclient');
          const response = await route.fetch({ maxRedirects: 0, timeout: 15_000 }).catch(() => null);
          if (!response || (response.status() >= 300 && response.status() < 400 && response.headers().location)) return route.abort();
          return route.fulfill({ response });
        });
        const page = await context.newPage();
        for (const [index, scenario] of PAGES.entries()) {
          const check = result.checks[index];
          try {
            check.evidence.push(await inspect(page, { dir }, scenario, width));
          } catch {
            check.evidence.push({ width, assertions: [{ expected: 'staging screen rendered within the timeout', pass: false }] });
          }
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  result.finishedAt = new Date().toISOString();
  result.verifiedSha = await servedBuild();
  if (result.verifiedSha !== result.sha) result.status = 'staging-changed';
  writeJson(path.join(dir, 'results.json'), result);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const trigger = process.argv[2] || 'manual';
  const result = await runPreflight({ trigger });
  console.log(JSON.stringify({ run: result.run, status: result.status, sha: result.sha, dir: result.dir }));
  process.exitCode = result.status === 'staging-changed' ? 1 : 0;
}
