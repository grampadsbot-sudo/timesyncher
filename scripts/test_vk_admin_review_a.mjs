#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs, { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const PW_PREFIX = '/tmp/pw';
const PW_BROWSERS_PATH = '/tmp/pw-browsers-chromium';
const PW_PLAYWRIGHT_VERSION = '1.65.0';

function tryRequirePlaywright(candidate) {
  if (candidate.includes('node_modules') && !existsSync(path.join(candidate, 'package.json'))) {
    return null;
  }
  try {
    return require(candidate);
  } catch {
    return null;
  }
}

function bootstrapPlaywrightForCi() {
  const bundled = path.join(PW_PREFIX, 'node_modules/playwright');
  const pkgInstall = spawnSync('npm', ['install', '--prefix', PW_PREFIX, `playwright@${PW_PLAYWRIGHT_VERSION}`], {
    stdio: 'inherit',
  });
  if (pkgInstall.status !== 0) {
    throw new Error(`playwright npm install failed (status ${pkgInstall.status ?? 'null'})`);
  }
  if (!existsSync(bundled)) {
    throw new Error(`playwright missing after install at ${bundled}`);
  }
  const browserInstall = spawnSync(
    process.execPath,
    [path.join(bundled, 'cli.js'), 'install', 'chromium'],
    { stdio: 'inherit' },
  );
  if (browserInstall.status !== 0) {
    throw new Error(`playwright chromium install failed (status ${browserInstall.status ?? 'null'})`);
  }
  return require(bundled);
}

function chromiumBinaryReady(mod) {
  try {
    const chromePath = mod.chromium.executablePath();
    if (!existsSync(chromePath)) return false;
    const chromeFolder = path.basename(path.dirname(path.dirname(chromePath)));
    const browsersRoot = path.dirname(path.dirname(path.dirname(chromePath)));
    const shellDir = chromeFolder.replace(/^chromium-/, 'chromium_headless_shell-');
    const shellExe = path.join(browsersRoot, shellDir, 'chrome-headless-shell-linux64/chrome-headless-shell');
    return existsSync(shellExe);
  } catch {
    return false;
  }
}

function loadPlaywright() {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= PW_BROWSERS_PATH;
  for (const candidate of [
    path.join(PW_PREFIX, 'node_modules/playwright'),
    'playwright',
    'playwright-core',
    path.join(ROOT, 'node_modules/playwright'),
    path.join(os.homedir(), 'tsv-dispatch/capture/node_modules/playwright'),
    path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright'),
  ]) {
    const mod = tryRequirePlaywright(candidate);
    if (!mod?.chromium) continue;
    if (chromiumBinaryReady(mod)) return mod;
  }
  return bootstrapPlaywrightForCi();
}
const { chromium } = loadPlaywright();

const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/vk-admin-review/vacation-fixtures.json'), 'utf8'));
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/vk-admin-review/roster-catalog.json'), 'utf8'));
const ORLANDO = fixtures.vacations.find((v) => v.tripId === 'vk-fixture-trip-001');
const SHOTS = path.join(os.tmpdir(), 'vk-admin-review-a');
fs.mkdirSync(SHOTS, { recursive: true });

const LOGIN = 'stand-in-admin-login';
process.env.VK_ADMIN_LOGIN = LOGIN;
process.env.VK_ADMIN_SESSION_SECRET = 'stand-in-admin-session-secret';
delete process.env.VERCEL_ENV;

const server = await startVkAdminLocalServer({
  ownerAppPayload: () => ({
    ok: true,
    session: { token: 'owner-fixture', status: 'active', customerName: 'Lopez family', currentTripId: 'owner-trip', seat: null },
    eula: { accepted: true, text: 'Terms' },
    vacations: [{ id: 'owner-trip', title: 'Orlando theme parks', destination: 'Orlando, FL', startDate: '2026-08-10', endDate: '2026-08-14', publicUrl: '' }],
    turns: ORLANDO.turns,
    itinerary: [],
  }),
});
const base = server.base;
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`ok - ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`not ok - ${name}\n  ${String(error?.stack || error).split('\n').slice(0, 12).join('\n  ')}`);
  }
}

const ADMIN_CALLS = [
  ['GET', '/api/admin/session'],
  ['GET', '/api/admin/customers'],
  ['GET', '/api/admin/customers/vk-fixture-trip-001'],
  ['POST', '/api/admin/customers/vk-fixture-trip-001/open'],
  ['POST', '/api/admin/clear-all'],
  ['GET', '/api/admin/anything-else'],
];

async function call(method, url, { cookie = '', body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body) headers['content-type'] = 'application/json';
  return fetch(`${base}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

function cookieOf(res) {
  return (res.headers.getSetCookie?.() || [])[0] || '';
}

async function signIn() {
  const res = await call('POST', '/api/admin/session', { body: { login: LOGIN } });
  assert.equal(res.status, 200);
  return cookieOf(res).split(';')[0];
}

await test('production: admin page and every /api/admin/* return 404', async () => {
  const cookie = await signIn();
  process.env.VERCEL_ENV = 'production';
  try {
    assert.equal((await call('GET', '/vacation-app/admin')).status, 404);
    assert.equal((await call('POST', '/api/admin/session', { body: { login: LOGIN } })).status, 404);
    for (const [method, url] of ADMIN_CALLS) assert.equal((await call(method, url, { cookie })).status, 404, `${method} ${url}`);
    assert.equal((await call('GET', '/api/shared/vk-admin-share-orlando-001/')).status, 404, 'fixture trip is not served in production');
  } finally {
    delete process.env.VERCEL_ENV;
  }
});

await test('not production, env unset: session/login return 503 admin_not_configured', async () => {
  const saved = [process.env.VK_ADMIN_LOGIN, process.env.VK_ADMIN_SESSION_SECRET];
  delete process.env.VK_ADMIN_LOGIN;
  delete process.env.VK_ADMIN_SESSION_SECRET;
  try {
    for (const [method, body] of [['POST', { login: 'x' }], ['GET', undefined]]) {
      const res = await call(method, '/api/admin/session', { body });
      assert.equal(res.status, 503, method);
      assert.equal((await res.json()).code, 'admin_not_configured');
    }
  } finally {
    [process.env.VK_ADMIN_LOGIN, process.env.VK_ADMIN_SESSION_SECRET] = saved;
  }
});

await test('configured, no valid admin cookie: admin APIs return 401', async () => {
  for (const [method, url] of ADMIN_CALLS) assert.equal((await call(method, url)).status, 401, `${method} ${url}`);
  const cookie = await signIn();
  const [name, value] = cookie.split('=');
  const forged = `${name}=${Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 1e6, opened: [] })).toString('base64url')}.${value.split('.')[1]}`;
  assert.equal((await call('GET', '/api/admin/customers', { cookie: forged })).status, 401, 'forged payload');
  assert.equal((await call('POST', '/api/admin/session', { body: { login: 'wrong' } })).status, 401, 'wrong login');
});

await test('sign-in sets a signed httpOnly cookie with role=admin', async () => {
  const res = await call('POST', '/api/admin/session', { body: { login: LOGIN } });
  const raw = cookieOf(res);
  assert.match(raw, /^vk_admin=[^;]+\.[^;]+;/);
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /SameSite=Lax/);
  assert.doesNotMatch(raw, new RegExp(LOGIN));
  const payload = JSON.parse(Buffer.from(raw.split('=')[1].split('.')[0], 'base64url').toString('utf8'));
  assert.equal(payload.role, 'admin');
  const session = await call('GET', '/api/admin/session', { cookie: raw.split(';')[0] });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).role, 'admin');
});

await test('list: 100 test customers, grouped by tripId, newest first, test customers not forced to top', async () => {
  const cookie = await signIn();
  const { groups, testCustomerCount } = await (await call('GET', '/api/admin/customers', { cookie })).json();
  assert.equal(testCustomerCount, 100);
  const coupons = groups.flatMap((g) => g.customers.map((c) => c.test_coupon)).sort();
  assert.deepEqual(coupons, Array.from({ length: 100 }, (_, i) => `VK-TEST-${String(i + 1).padStart(3, '0')}`));
  assert.equal(roster.customers.length, 100);
  assert.equal(new Set(groups.map((g) => g.tripId)).size, groups.length, 'one group per tripId');
  const orlando = groups.find((g) => g.tripId === 'vk-fixture-trip-001');
  const anaheim = groups.find((g) => g.tripId === 'vk-fixture-trip-002');
  const sharedTrip = roster.customers.filter((c) => c.tripId === 'vk-fixture-trip-001').map((c) => c.customer_label);
  assert.ok(sharedTrip.length >= 2);
  assert.deepEqual(orlando.customers.map((c) => c.customer_label), sharedTrip, 'records sharing a tripId form one group');
  assert.ok(anaheim && anaheim !== orlando, 'different tripIds are different groups');
  const times = groups.map((g) => Date.parse(g.sortAt));
  assert.deepEqual(times, [...times].sort((a, b) => b - a), 'newest first');
  assert.equal(groups[0].tripId, 'vk-fixture-decoy');
  assert.equal(groups[0].isTest, false, 'newer non-test decoy is above the test vacations');
  assert.ok(groups.indexOf(orlando) < groups.indexOf(anaheim), 'later test vacation above earlier one');
  assert.ok(orlando.isTest && anaheim.isTest);
});

await test('several open at once; Clear all empties the set', async () => {
  let cookie = await signIn();
  for (const id of ['vk-fixture-trip-001', 'vk-fixture-trip-002']) {
    const res = await call('POST', `/api/admin/customers/${id}/open`, { cookie });
    assert.equal(res.status, 200);
    cookie = cookieOf(res).split(';')[0] || cookie;
  }
  assert.deepEqual((await (await call('GET', '/api/admin/session', { cookie })).json()).opened, ['vk-fixture-trip-001', 'vk-fixture-trip-002']);
  const cleared = await call('POST', '/api/admin/clear-all', { cookie });
  assert.deepEqual((await cleared.json()).opened, []);
});

await test('fixture trip is served view-only and refuses writes', async () => {
  const trip = await (await call('GET', '/api/shared/vk-admin-share-orlando-001/')).json();
  assert.ok(trip.trip && Array.isArray(trip.days) && trip.places.length === ORLANDO.things.length);
  assert.equal((await (await call('GET', '/api/shared/vk-admin-share-orlando-001/edit-access')).json()).canEdit, false);
  for (const method of ['PUT', 'POST', 'PATCH', 'DELETE']) {
    assert.equal((await call(method, '/api/shared/vk-admin-share-orlando-001/overrides', { body: {} })).status, 403, method);
  }
});

async function realCustomerBubbles(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${base}/vacation-app.html?session=owner-fixture`);
  await page.waitForSelector('#messages article.bubble');
  const html = await page.$$eval('#messages article.bubble', (els) => els.map((el) => el.outerHTML));
  await context.close();
  return html;
}

const browser = await chromium.launch({ headless: true });
try {
  const customerBubbles = await realCustomerBubbles(browser);
  assert.equal(customerBubbles.length, ORLANDO.turns.length);
  for (const width of [390, 1280]) {
    await test(`[${width}] sign in, list, Chat (real renderer, read-only), Trip (view-only), composer, switcher`, async () => {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 } });
      const page = await context.newPage();
      const posts = [];
      page.on('request', (req) => {
        if (req.method() !== 'GET' && req.method() !== 'HEAD') posts.push(`${req.method()} ${new URL(req.url()).pathname}`);
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      const noOverflow = async (tag) => {
        const box = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          trigger: document.getElementById('tripButton')?.getBoundingClientRect().right || 0,
        }));
        assert.ok(box.scroll <= width && box.trigger <= width, `${tag} fits ${width}: ${JSON.stringify(box)}`);
      };

      await page.goto(`${base}/vacation-app/admin`);
      await page.fill('#adminLoginInput', LOGIN);
      await page.click('#adminLogin button[type="submit"]');
      await page.waitForSelector('[data-admin-customers]');
      const order = await page.$$eval('[data-trip-group]', (els) => els.map((el) => el.dataset.tripGroup));
      assert.equal(order[0], 'vk-fixture-decoy');
      assert.ok(order.indexOf('vk-fixture-trip-001') < order.indexOf('vk-fixture-trip-002'));
      assert.equal(await page.locator('[data-trip-group="vk-fixture-trip-001"] .admin-coupon').count(), 4);
      assert.equal(await page.locator('#splitter').count(), 1);
      assert.match(await page.locator('#vacationDropdown [data-trip-id="all"] b').textContent(), /^All Customers$/);
      await noOverflow('list');
      await page.screenshot({ path: path.join(SHOTS, `list-${width}.png`) });

      await page.click('[data-vk-open][data-customer-id="vk-fixture-trip-001"]');
      await page.waitForSelector('#sitePane[data-kind="chat"] #customerChatReplay article.bubble');
      const adminBubbles = await page.$$eval('#customerChatReplay article.bubble', (els) => els.map((el) => el.outerHTML));
      assert.deepEqual(adminBubbles, customerBubbles, 'admin Chat markup equals the real customer chat renderer');
      assert.equal(await page.locator('#customerChatReplay :is(textarea, input, select, [contenteditable="true"], button:not([disabled]))').count(), 0, 'chat replay is read-only');
      await noOverflow('chat');
      await page.screenshot({ path: path.join(SHOTS, `chat-${width}.png`) });

      for (const id of ['#composer', '#messageText', '#attachButton', '#fileInput', '#voiceButton', '#sendButton']) {
        assert.equal(await page.locator(id).count(), 1, `shared composer ${id}`);
      }
      await page.setInputFiles('#fileInput', { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('admin upload') });
      await page.waitForSelector('#attachmentRow .chip');
      await page.fill('#messageText', 'Admin check, not for the customer');
      await page.click('#sendButton');
      await page.waitForSelector('#messages [data-admin-local="1"]');
      await page.waitForTimeout(300);
      assert.deepEqual(posts.filter((p) => !p.startsWith('POST /api/admin/')), [], 'composer sends nothing outside admin');
      assert.deepEqual(server.writes, []);
      assert.equal(await page.locator('#customerChatReplay article.bubble').count(), ORLANDO.turns.length, 'customer transcript unchanged');
      const detail = await page.evaluate(() => fetch('/api/admin/customers/vk-fixture-trip-001').then((r) => r.json()));
      assert.equal(detail.vacation.turns.length, ORLANDO.turns.length);

      await page.click('#tripButton');
      await page.click('[data-trip-id="vk-fixture-trip-001:trip"]');
      await page.waitForSelector('#sitePane[data-kind="trip"] iframe[data-trip-frame="1"]');
      const frame = page.frameLocator('iframe[data-trip-frame="1"]');
      const firstThing = ORLANDO.things[0].title;
      await frame.locator('[data-ts-timeline-title]', { hasText: firstThing }).first().waitFor({ timeout: 45000 });
      await frame.locator('[data-ts-timeline-title]', { hasText: firstThing }).first().click();
      await frame.locator('[data-ts-detail-title-wrap="1"]').waitFor({ timeout: 30000 });
      const handle = await page.$('iframe[data-trip-frame="1"]');
      const tripFrame = await handle.contentFrame();
      await tripFrame.waitForFunction(() => !/Checking edit access/.test(document.body.textContent || ''), null, { timeout: 30000 });
      assert.equal(await frame.locator('[data-ts-detail-edit="1"], [contenteditable="true"]').count(), 0, 'trip has no edit controls');
      await noOverflow('trip');
      await page.screenshot({ path: path.join(SHOTS, `trip-${width}.png`) });
      assert.deepEqual(server.writes, [], 'trip view writes nothing');

      await page.click('#tripButton');
      await page.click('[data-trip-id="all"]');
      await page.click('[data-vk-open][data-customer-id="vk-fixture-trip-002"]');
      await page.waitForSelector('#sitePane[data-kind="chat"][data-run="vk-fixture-trip-002"]');
      assert.equal(await page.locator('#vacationDropdown [data-run-group]').count(), 2, 'two customers open at once');
      const clears = await page.$$eval('button', (els) => els.filter((el) => /clear/i.test(el.textContent || '') || el.matches('[data-clear-run], [data-clear-all]')).map((el) => el.textContent.trim()));
      assert.deepEqual(clears, ['Clear all'], 'Clear all is the only clear control');
      await page.click('#tripButton');
      await page.click('[data-clear-all]');
      await page.waitForSelector('[data-admin-customers]');
      assert.equal(await page.locator('#vacationDropdown [data-run-group]').count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
    });
  }
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed (screenshots: ${SHOTS})`);
if (failed.length) process.exit(1);
