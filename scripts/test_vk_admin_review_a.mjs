#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  for (const candidate of [
    'playwright',
    path.join(root, 'node_modules/playwright'),
    path.join(os.homedir(), 'tsv-dispatch/capture/node_modules/playwright'),
  ]) {
    try {
      return require(candidate);
    } catch {
      continue;
    }
  }
  throw new Error('Playwright required for vk admin review layout test');
}
const { chromium } = loadPlaywright();
import { renderVacationTurnsHtml } from '../src/vacation/vk-admin-fixtures.mjs';
import { readCookie, VK_ADMIN_COOKIE } from '../src/vacation/vk-admin-session.mjs';

process.env.VK_ADMIN_LOGIN = 'local-admin-login';
process.env.VK_ADMIN_SESSION_SECRET = 'local-admin-session-secret';
delete process.env.VERCEL_ENV;

const server = await startVkAdminLocalServer();
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`ok - ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.stack || error) });
    console.log(`not ok - ${name}\n  ${String(error?.stack || error).split('\n').slice(0, 10).join('\n  ')}`);
  }
}

function cookieHeader(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const raw = list[0] || res.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}

let cookie = '';

await test('admin APIs reject missing cookie and production', async () => {
  const bare = await fetch(`${server.base}/api/admin/customers`);
  assert.equal(bare.status, 401);
  process.env.VERCEL_ENV = 'production';
  try {
    for (const path of ['/api/admin/session', '/api/admin/customers', '/api/admin/clear-all']) {
      const res = await fetch(`${server.base}${path}`, { method: path.includes('session') || path.includes('clear') ? 'POST' : 'GET' });
      assert.equal(res.status, 404, path);
    }
    const page = await fetch(`${server.base}/vacation-app/admin`);
    assert.equal(page.status, 404);
  } finally {
    delete process.env.VERCEL_ENV;
  }
});

await test('login returns 503 when admin env is unset', async () => {
  const savedLogin = process.env.VK_ADMIN_LOGIN;
  const savedSecret = process.env.VK_ADMIN_SESSION_SECRET;
  delete process.env.VK_ADMIN_LOGIN;
  delete process.env.VK_ADMIN_SESSION_SECRET;
  try {
    const res = await fetch(`${server.base}/api/admin/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'anything' }),
    });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'admin_not_configured');
  } finally {
    process.env.VK_ADMIN_LOGIN = savedLogin;
    process.env.VK_ADMIN_SESSION_SECRET = savedSecret;
  }
});

await test('admin session sign-in and fixture list grouping/sort', async () => {
  const bad = await fetch(`${server.base}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: 'nope' }),
  });
  assert.equal(bad.status, 401);
  const res = await fetch(`${server.base}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: process.env.VK_ADMIN_LOGIN }),
  });
  assert.equal(res.status, 200);
  cookie = cookieHeader(res);
  assert.equal(VK_ADMIN_COOKIE, 'vk_admin');
  assert.match(cookie, /^vk_admin=/);
  assert.equal(readCookie(`other=1; ${cookie}; tail=1`, VK_ADMIN_COOKIE).startsWith('.'), false);
  assert.ok(readCookie(`${cookie}; x=1`, VK_ADMIN_COOKIE));
  const list = await fetch(`${server.base}/api/admin/customers`, { headers: { cookie } });
  const body = await list.json();
  assert.equal(body.testCustomerCount, 100);
  const groups = body.groups;
  assert.ok(groups.length >= 2);
  const times = groups.map((g) => Date.parse(g.sortAt));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.equal(groups[0].tripId, 'vk-fixture-decoy');
  const orlando = groups.find((g) => g.tripId === 'vk-fixture-trip-001');
  assert.ok(orlando);
  assert.ok(orlando.customerCount >= 2);
  const tripIds = new Set(groups.map((g) => g.tripId));
  assert.equal(tripIds.size, groups.length);
});

await test('chat renderer uses article.bubble', async () => {
  const detail = await fetch(`${server.base}/api/admin/customers/vk-fixture-trip-001`, { headers: { cookie } });
  const { vacation } = await detail.json();
  const html = renderVacationTurnsHtml(vacation.chat.turns);
  assert.match(html, /<article class="bubble user" data-turn="owner-1"/);
  assert.match(html, /Lopez family/);
});

await test('open vacation and composer does not hit vacation-itinerary', async () => {
  const open = await fetch(`${server.base}/api/admin/customers/vk-fixture-trip-001/open`, {
    method: 'POST',
    headers: { cookie },
  });
  assert.equal(open.status, 200);
  cookie = cookieHeader(open) || cookie;
  const itineraryPosts = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    if (init?.method === 'POST' && url.includes('/api/vacation-itinerary')) itineraryPosts.push(url);
    return origFetch(input, init);
  };
  try {
    const shared = await fetch(`${server.base}/api/shared/vk-admin-share-orlando-001/`);
    assert.equal(shared.status, 200);
    const trip = await shared.json();
    assert.ok(Array.isArray(trip.places) && trip.places.length >= 1);
    const edit = await fetch(`${server.base}/api/shared/vk-admin-share-orlando-001/edit-access`);
    const access = await edit.json();
    assert.equal(access.canEdit, false);
  } finally {
    globalThis.fetch = origFetch;
  }
  assert.deepEqual(itineraryPosts, []);
});

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    await test(`[${width}] admin UI switcher, chat, trip, composer`, async () => {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 } });
      const page = await context.newPage();
      const posts = [];
      page.on('request', (req) => {
        if (req.method() === 'POST' && req.url().includes('/api/vacation-itinerary')) posts.push(req.url());
      });
      await page.goto(`${server.base}/vacation-app/admin`);
      await page.waitForSelector('#adminLogin');
      await page.fill('#adminLoginInput', process.env.VK_ADMIN_LOGIN);
      await page.click('#adminLogin button[type="submit"]');
      await page.waitForSelector('[data-admin-customers]');
      assert.match(await page.locator('[data-trip-id="all"] b').textContent(), /All Customers/);
      await page.click('button[data-vk-open][data-customer-id="vk-fixture-trip-001"]');
      await page.waitForSelector('[data-run-group="vk-fixture-trip-001"]');
      await page.waitForSelector('#sitePane[data-kind="chat"]');
      assert.ok(await page.locator('#customerChatReplay article.bubble').count() >= 2);
      await page.click('#tripButton');
      await page.click('[data-trip-id="vk-fixture-trip-001:trip"]');
      await page.waitForSelector('#sitePane[data-kind="trip"] iframe[data-trip-frame="1"]');
      await page.waitForSelector('iframe[data-trip-frame="1"]', { state: 'attached' });
      const iframe = page.frameLocator('iframe[data-trip-frame="1"]');
      await iframe.locator('#root, [data-shared-trip-root], body').first().waitFor({ timeout: 45000 });
      const editControls = await iframe.locator('fieldset:not([data-shared-readonly]) textarea, [contenteditable="true"]').count().catch(() => 0);
      assert.equal(editControls, 0);
      assert.equal(await page.locator('#attachButton').count(), 1);
      assert.equal(await page.locator('#voiceButton').count(), 1);
      assert.equal(await page.locator('#sendButton').count(), 1);
      await page.fill('#messageText', 'Does not write transcript');
      await page.click('#sendButton');
      await page.waitForTimeout(200);
      assert.deepEqual(posts, []);
      await page.click('#tripButton');
      await page.click('[data-trip-id="all"]');
      await page.click('button[data-vk-open][data-customer-id="vk-fixture-trip-002"]');
      await page.waitForSelector('[data-run-group="vk-fixture-trip-002"]');
      const clearButtons = await page.locator('[data-clear-run]').count();
      assert.equal(clearButtons, 0);
      assert.equal(await page.locator('[data-clear-all]').count(), 1);
      await context.close();
    });
  }
} finally {
  await browser.close();
}

await server.close();
const failed = results.filter((row) => !row.ok);
if (failed.length) {
  console.error(`\n${failed.length} failed`);
  process.exit(1);
}
console.log(`\n${results.length} passed`);