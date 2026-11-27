#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalVkAdminStore } from '../src/vacation/vk-admin-review-storage.mjs';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';
import { loadVkAdminPlaywright } from './qa/vk-admin-playwright.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EVIDENCE_DIR = path.join(ROOT, 'evidence/vk-admin-1212-all-customers-intro');
const SHOT_NAME = 'all-customers-390.png';
const SHOT_PATH = path.join(EVIDENCE_DIR, SHOT_NAME);
const EXPECTED_INTRO = 'Choose a customer to drill down into their trips, chat and QA.';
const VIEWPORT_390 = { width: 390, height: 844 };

function assertAllCustomersIntro(snapshot) {
  assert.equal(snapshot.count, 1, 'All Customers view must render exactly one static intro element');
  assert.equal(snapshot.text, EXPECTED_INTRO, 'All Customers intro wording must match fixed chrome copy');
  assert.equal(snapshot.isFirstChild, true, 'All Customers intro must appear first at the top of the list');
  assert.equal(snapshot.insideCustomerRow, false, 'All Customers intro must not be rendered inside a customer row');
  assert.equal(snapshot.visible, true, 'All Customers intro must be visible');
  assert.ok(snapshot.introRect.width > 0 && snapshot.introRect.height > 0, 'All Customers intro must have non-zero size');
  assert.ok(
    snapshot.introRect.top >= snapshot.headerRect.bottom - 0.5,
    `intro wraps under header: intro.top=${snapshot.introRect.top} < header.bottom=${snapshot.headerRect.bottom}`,
  );
  assert.ok(
    snapshot.introRect.top >= snapshot.paneRect.top - 0.5 && snapshot.introRect.bottom <= snapshot.paneRect.bottom + 0.5,
    `intro clipped by sitePane: intro=${JSON.stringify(snapshot.introRect)} pane=${JSON.stringify(snapshot.paneRect)}`,
  );
  assert.ok(
    snapshot.introRect.left >= snapshot.paneRect.left - 0.5 && snapshot.introRect.right <= snapshot.paneRect.right + 0.5,
    `intro overflows sitePane horizontally: intro=${JSON.stringify(snapshot.introRect)} pane=${JSON.stringify(snapshot.paneRect)}`,
  );
  assert.ok(
    snapshot.introRect.right <= snapshot.viewportWidth + 0.5 && snapshot.docScrollWidth <= snapshot.viewportWidth,
    `intro overflows 390 viewport: right=${snapshot.introRect.right} scrollWidth=${snapshot.docScrollWidth}`,
  );
  assert.ok(
    snapshot.introScrollWidth <= snapshot.introClientWidth + 1 && snapshot.introScrollHeight <= snapshot.introClientHeight + 1,
    `intro text overflows or clips: scroll=${snapshot.introScrollWidth}x${snapshot.introScrollHeight} client=${snapshot.introClientWidth}x${snapshot.introClientHeight}`,
  );
  if (snapshot.firstRowRect) {
    assert.ok(
      snapshot.introRect.bottom <= snapshot.firstRowRect.top + 0.5,
      `intro must sit above first customer row: intro.bottom=${snapshot.introRect.bottom} > row.top=${snapshot.firstRowRect.top}`,
    );
  }
}

function validSampleSnapshot(overrides = {}) {
  return {
    count: 1,
    text: EXPECTED_INTRO,
    isFirstChild: true,
    insideCustomerRow: false,
    visible: true,
    viewportWidth: 390,
    docScrollWidth: 390,
    headerRect: { top: 0, bottom: 58, left: 0, right: 390, width: 390, height: 58 },
    paneRect: { top: 58, bottom: 450, left: 0, right: 390, width: 390, height: 392 },
    introRect: { top: 70, bottom: 110, left: 16, right: 374, width: 358, height: 40 },
    firstRowRect: { top: 120, bottom: 186, left: 16, right: 374, width: 358, height: 66 },
    introScrollWidth: 358,
    introClientWidth: 358,
    introScrollHeight: 40,
    introClientHeight: 40,
    ...overrides,
  };
}

assertAllCustomersIntro(validSampleSnapshot());
assert.throws(() => assertAllCustomersIntro(validSampleSnapshot({ count: 0 })), /exactly one static intro/);
assert.throws(() => assertAllCustomersIntro(validSampleSnapshot({ text: '' })), /fixed chrome copy/);
assert.throws(() => assertAllCustomersIntro(validSampleSnapshot({ text: 'Dynamic customer text' })), /fixed chrome copy/);
assert.throws(() => assertAllCustomersIntro(validSampleSnapshot({ isFirstChild: false })), /first at the top/);
assert.throws(() => assertAllCustomersIntro(validSampleSnapshot({ insideCustomerRow: true })), /inside a customer row/);
assert.throws(() => assertAllCustomersIntro(validSampleSnapshot({ introRect: { top: 40, bottom: 80, left: 16, right: 374, width: 358, height: 40 } })), /wraps under header/);
assert.throws(() => assertAllCustomersIntro(validSampleSnapshot({ introRect: { top: 70, bottom: 110, left: 16, right: 410, width: 394, height: 40 } })), /overflows/);
assert.throws(() => assertAllCustomersIntro(validSampleSnapshot({ introScrollHeight: 60, introClientHeight: 40 })), /overflows or clips/);

async function readIntroSnapshot(page) {
  return page.evaluate(() => {
    const list = document.querySelector('#sitePane[data-kind="customers"] [data-admin-customers="1"]');
    const nodes = list ? [...list.querySelectorAll('[data-admin-customers-intro="1"]')] : [];
    const intro = nodes[0] || null;
    const header = document.getElementById('appHeader');
    const pane = document.getElementById('sitePane');
    const firstRow = list?.querySelector('.admin-group') || null;
    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const style = intro ? getComputedStyle(intro) : null;
    return {
      count: nodes.length,
      text: intro ? intro.textContent.trim() : '',
      isFirstChild: Boolean(list && intro && list.firstElementChild === intro),
      insideCustomerRow: Boolean(intro?.closest('.admin-group')),
      visible: Boolean(style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0),
      viewportWidth: window.innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      headerRect: rectOf(header),
      paneRect: rectOf(pane),
      introRect: rectOf(intro),
      firstRowRect: rectOf(firstRow),
      introScrollWidth: intro ? intro.scrollWidth : 0,
      introClientWidth: intro ? intro.clientWidth : 0,
      introScrollHeight: intro ? intro.scrollHeight : 0,
      introClientHeight: intro ? intro.clientHeight : 0,
    };
  });
}

const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/vk-admin-review/vacation-fixtures.json'), 'utf8'));
const [orlando] = fixtures.vacations;
const tripOne = '12120000-0000-0000-0000-000000000001';
const tripTwo = '12120000-0000-0000-0000-000000000002';
const tripOther = '12120000-0000-0000-0000-000000000003';
const nowIso = '2026-11-26T18:00:00.000Z';
const earlierIso = '2026-11-25T18:00:00.000Z';
const vacations = [
  {
    trip_id: tripOne, title: 'Autumn Kyoto', destination: 'Kyoto, Japan',
    customer_id: 'fixture-cust-1', display_name: 'Elena Martinez',
    customer_email: 'fixture-one@gmail.com',
    share_slug: orlando.shareSlug, created_at: nowIso, start_date: '2027-04-01', end_date: '2027-04-06',
  },
  {
    trip_id: tripTwo, title: 'Spring Lisbon', destination: 'Lisbon, Portugal',
    customer_id: 'fixture-cust-1', display_name: 'Elena Martinez',
    customer_email: 'fixture-one@gmail.com',
    created_at: earlierIso, start_date: '2027-02-10', end_date: '2027-02-14',
  },
  {
    trip_id: tripOther, title: 'Summer Reykjavik', destination: 'Reykjavik, Iceland',
    customer_id: 'fixture-cust-2', display_name: 'Noah Patel', customer_email: 'fixture-two@gmail.com',
    created_at: earlierIso, start_date: '2027-06-05', end_date: '2027-06-10',
  },
];

const db = async (parts, id) => {
  const query = parts.join('?');
  if (query.includes('from transcript_turns')) {
    return id === tripOne ? [{ request_id: 'req-1', at: nowIso, speaker: 'customer', direction: 'inbound', body: 'Fixture question', payload: {} }] : [];
  }
  if (query.includes('from onboarding_clicks')) return [];
  if (query.includes('from onboarding_sessions')) return [];
  if (query.includes('lower(c.email) like')) {
    const aliasPrefix = id.split('%')[1];
    return vacations.filter((row) => row.customer_email?.includes(aliasPrefix));
  }
  if (query.includes('from trips where customer_id')) return vacations.filter((row) => row.customer_id === id);
  if (query.includes('from trips')) return id ? vacations.filter((row) => row.trip_id === id) : vacations;
  throw new Error(`Unknown fixture query: ${query}`);
};

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-admin-1212-store-'));
const LOGIN = 'fixture-admin-1212-login';
process.env.VK_ADMIN_LOGIN = LOGIN;
process.env.VK_ADMIN_SESSION_SECRET = 'fixture-admin-1212-secret';
delete process.env.VERCEL_ENV;

const { chromium } = loadVkAdminPlaywright();
const server = await startVkAdminLocalServer({
  adminDatabase: () => db,
  adminStore: () => new LocalVkAdminStore(storeDir),
});
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: VIEWPORT_390 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(`${server.base}/vacation-app/admin`);
  await page.fill('#adminLoginInput', LOGIN);
  await page.click('#adminLogin button[type="submit"]');
  await page.waitForSelector('#sitePane[data-kind="customers"] [data-admin-customers="1"] .admin-group');

  const initialSnapshot = await readIntroSnapshot(page);
  assertAllCustomersIntro(initialSnapshot);
  assert.ok(await page.locator('#sitePane .admin-group').count() >= 2, 'customer rows remain intact');

  if (process.env.VK_WRITE_EVIDENCE_1212 === '1') {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: SHOT_PATH });
  }

  await page.getByRole('button', { name: 'Open Elena Martinez', exact: true }).click();
  await page.waitForSelector(`#sitePane[data-kind="chat"][data-run="${tripOne}"]`);

  const checkNotAllView = async (kind) => {
    assert.equal(await page.locator('#sitePane').getAttribute('data-kind'), kind);
    assert.equal(await page.locator('[data-admin-customers-intro]').count(), 0, `${kind} must not show All Customers intro`);
    const text = await page.locator('#sitePane').textContent();
    assert.equal(text.includes(EXPECTED_INTRO), false, `${kind} text must not include All Customers intro`);
  };

  await checkNotAllView('chat');
  for (const [label, kind] of [
    ['Vacation site', 'trip'],
    ['Keepsake', 'keepsake'],
    ['Onboarding', 'onboarding'],
    ['Chat screenshots', 'captures'],
    ['All vacations', 'vacations'],
  ]) {
    await page.click('#tripButton');
    await page.getByRole('option', { name: label, exact: true }).click();
    await page.waitForSelector(`#sitePane[data-kind="${kind}"]`);
    await checkNotAllView(kind);
  }

  await page.click('#tripButton');
  await page.click('[data-trip-id="all"]');
  await page.waitForSelector('#sitePane[data-kind="customers"] [data-admin-customers="1"]');
  assertAllCustomersIntro(await readIntroSnapshot(page));

  await page.evaluate(() => {
    document.querySelector('[data-admin-customers-intro="1"]')?.remove();
  });
  assert.throws(() => assertAllCustomersIntro({ ...initialSnapshot, count: 0 }), /exactly one static intro/);
  const missingDomSnapshot = await readIntroSnapshot(page);
  assert.throws(() => assertAllCustomersIntro(missingDomSnapshot), /exactly one static intro/);

  await page.route('**/api/admin/customers', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, role: 'admin', opened: [], groups: [], testCustomerCount: 0 }),
  }));
  await page.reload();
  await page.waitForSelector('#sitePane[data-kind="customers"] [data-admin-customers="1"]');
  const emptyListSnapshot = await readIntroSnapshot(page);
  assertAllCustomersIntro(emptyListSnapshot);
  assert.equal(emptyListSnapshot.firstRowRect, null);

  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await browser.close();
  await server.close();
  fs.rmSync(storeDir, { recursive: true, force: true });
}

assert.ok(fs.existsSync(SHOT_PATH), `missing 390 proof screenshot ${SHOT_PATH}`);
assert.ok(fs.statSync(SHOT_PATH).size > 1000, '390 proof screenshot is too small');
const evidenceFiles = fs.readdirSync(EVIDENCE_DIR).sort();
assert.deepEqual(evidenceFiles, [SHOT_NAME], 'evidence directory must contain only the single 390 proof shot (no 1280)');

console.log('ok - VK admin All Customers static intro (#1212)');
