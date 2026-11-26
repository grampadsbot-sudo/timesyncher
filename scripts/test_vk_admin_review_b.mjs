#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalJsonStore } from '../src/onboarding/eula-persistent-store.mjs';
import { firstFiveTurnCapture, createAdminArtifactWriter, storeDialogPdf } from './harness/admin-review-artifacts.mjs';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';
import { loadVkAdminPlaywright } from './qa/vk-admin-playwright.mjs';

const { chromium } = loadVkAdminPlaywright();
const fixturePath = new URL('./fixtures/vk-admin-review/vacation-fixtures.json', import.meta.url);
const [orlando] = JSON.parse(await fs.readFile(fixturePath, 'utf8')).vacations;
const tripId = 'aaaaaaaa-0000-0000-0000-000000000116';
const other = 'bbbbbbbb-0000-0000-0000-000000000116';
const current = '2026-11-26T12:00:00.000Z';
const before = '2026-11-25T12:00:00.000Z';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/FioAAAAASUVORK5CYII=', 'base64');
const pdf = Buffer.from('%PDF-1.7\n% test for transport only\n%%EOF');
const log = process.env.VK_ADMIN_REVIEW_SCREENSHOTS_DIR || path.join(os.tmpdir(), 'vk-admin-review-b');
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'vk-admin-review-b-storage-'));
const LOGIN = 'fixture-admin-sign-in';
process.env.VK_ADMIN_LOGIN = LOGIN;
process.env.VK_ADMIN_SESSION_SECRET = 'fixture-admin-signing-stand-in';
delete process.env.VERCEL_ENV;

const vacations = [
  { trip_id: tripId, title: 'Test harness review', destination: 'Fixture destination', customer_id: 'fixture-1', display_name: 'Test harness review',
    share_slug: orlando.shareSlug, harness_tag: 'harness:fixture:review', created_at: current, qa: { score: 4 }, survey: { rating: 'happy' } },
  { trip_id: other, title: 'Second fixture', destination: 'Fixture destination', customer_id: 'fixture-2', display_name: 'Second fixture', created_at: before },
];
const names = ['vendor/first', 'vendor/second', 'vendor/third'];
const ledger = (requestId, model, costSource, costUsd, extra = {}) => ({ tripId, requestId, model, costUsd, costSource, ...extra });
const replies = [
  [ledger('req-1', names[0], 'openrouter_usage_cost', 0.01234567, { purpose: 'reply_draft' }),
    ledger('req-1', 'vendor/judge', 'openrouter_usage_cost', 0.002, { purpose: 'jev_quality' }),
    ledger('req-1', names[0], 'openrouter_usage_cost', 99, { tripId: other, purpose: 'reply_draft' })],
  [ledger('req-2', names[1], 'openrouter_listed_price', 0.05, { purpose: 'reply_draft' })],
  [ledger('req-3', names[2], 'unpriced', null, { purpose: 'reply_draft' })],
];
const turns = replies.flatMap((rows, index) => {
  const common = { request_id: `req-${index + 1}`, at: current };
  return [
    { ...common, speaker: 'customer', direction: 'inbound', body: `Customer line ${index + 1}`, payload: {} },
    { ...common, speaker: 'app', direction: 'outbound', body: `App reply ${index + 1}`,
      payload: { liveTranscript: { shippedModel: names[index], openrouterCalls: rows } } },
  ];
});
const storedOnboarding = [{ id: 'fixture-session', status: 'completed', current_step: 'vacation_app', created_at: before, completed_at: current }];
let queries = [];
const db = async (parts, id) => {
  const query = parts.join('?');
  queries.push(query);
  if (query.includes('from transcript_turns')) return id === tripId ? turns : [];
  if (query.includes('from onboarding_clicks')) return [{ session_id: 'fixture-session', event_type: 'accept', target: 'Terms', clicked_at: current }];
  if (query.includes('from onboarding_sessions')) return storedOnboarding;
  if (query.includes('from trips')) return id ? vacations.filter((row) => row.trip_id === id) : vacations;
  throw new Error('Unknown fixture query');
};
const server = await startVkAdminLocalServer({
  adminDatabase: () => db,
  adminStore: () => new LocalJsonStore(workspace),
  ownerAppPayload: () => ({ ok: true, turns: turns.map(({ body }) => ({ body })) }),
});
const { base } = server;
const browser = await chromium.launch({ headless: true });

try {
  async function auth() {
    const response = await fetch(`${base}/api/admin/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: LOGIN }),
    });
    assert.equal(response.status, 200);
    return response.headers.getSetCookie()[0].split(';')[0];
  }
  const cookie = await auth();
  const artifactPath = `/api/admin/customers/${tripId}/artifacts`;
  const uploaded = [];
  const staging = 'https://vacation-staging.timesyncher.com';
  const writer = createAdminArtifactWriter({
    origin: staging, login: LOGIN,
    fetchImpl: (url, init) => {
      assert.equal(url.origin, staging);
      if (url.pathname.endsWith('/session')) assert.equal(init.method, 'POST');
      return fetch(`${base}${url.pathname}`, init);
    },
  });
  let opened = 0;
  let closed = 0;
  const capture = firstFiveTurnCapture({
    origin: staging, token: 'fixture-browser-session', outDir: workspace,
    put: async (id, name, bytes) => {
      uploaded.push([id, name]);
      await writer(id, name, bytes);
    },
    openPage: async () => {
      opened += 1;
      return { close: async () => { closed += 1; }, page: {
        async goto(url) { assert.equal(new URL(url).searchParams.get('tripId'), tripId); },
        async waitForFunction(callback, line) { assert.match(line, /^Customer line [1-5]$/); },
        locator(selector) {
          assert.equal(selector, '#messages');
          return { evaluate: async () => {} };
        },
        async screenshot({ path: file }) { await fs.writeFile(file, png); return png; },
      } };
    },
  });
  for (let turn = 1; turn <= 6; turn += 1) {
    assert.equal(await capture.capture({ tripId, turn, text: `Customer line ${turn}` }), turn <= 5);
  }
  assert.equal(await capture.capture({ tripId, turn: 5, text: 'Customer line 5' }), false);
  await capture.close();
  assert.deepEqual([opened, closed], [1, 1]);
  assert.deepEqual(uploaded, [1, 2, 3, 4, 5].map((n) => [tripId, `turn-${n}`]));
  assert.deepEqual((await fs.readdir(path.join(workspace, 'first-5-turns'))).sort(), [1, 2, 3, 4, 5].map((n) => `turn-${n}.png`));
  const pdfFile = path.join(workspace, 'dialog.pdf');
  await fs.writeFile(pdfFile, pdf);
  assert.equal(await storeDialogPdf(writer, tripId, { ok: true, out: pdfFile }), true);
  assert.equal((await fetch(`${base}${artifactPath}/turn-1`)).status, 401);
  assert.equal((await fetch(`${base}${artifactPath}/dialog-pdf`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/notes`)).status, 401);
  assert.equal((await fetch(`${base}${artifactPath}/turn-6`, { headers: { cookie } })).status, 404);

  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 }, acceptDownloads: true });
    try {
      const page = await context.newPage();
      const shot = async (name) => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name);
        await page.screenshot({ path: path.join(log, `${name}-${width}.png`) });
      };
      const requests = [];
      page.on('request', (request) => requests.push([request.method(), new URL(request.url()).pathname]));
      await page.goto(`${base}/vacation-app/admin`);
      await page.fill('#adminLoginInput', LOGIN);
      await page.locator('#adminLogin button').click();
      await page.locator('[data-trip-group]').first().waitFor();
      const timestamps = await page.locator('[data-sort-at]').evaluateAll((rows) => rows.map((row) => row.dataset.sortAt));
      assert.deepEqual(timestamps, [...timestamps].sort().reverse());
      assert.equal(await page.locator('[data-trip-group]').first().getAttribute('data-trip-group'), tripId);
      await shot('customers');

      await page.locator(`[data-customer-id="${tripId}"]`).click();
      await page.locator('[data-dialog-pdf]').waitFor();
      assert.deepEqual(await page.locator('#adminView option').allTextContents(), ['Dialog', 'Vacation site', 'Keepsake', 'Onboarding', 'First 5 turns']);
      const text = await page.locator('#customerChatReplay article').allTextContents();
      assert.deepEqual(text.map((line) => line.match(/(?:Customer line|App reply) \d/)[0]), turns.map((turn) => turn.body));
      assert.deepEqual(await page.locator('.admin-reply-detail').allTextContents(), [
        'vendor/first · Actual $0.01234567 Estimated $0.00',
        'vendor/second · Actual $0.00 Estimated $0.05',
        'vendor/third · unpriced',
      ]);
      assert.match(await page.locator('[data-vacation-total]').textContent(), /Actual \$0.01434567 Estimated \$0.05 1 unpriced/);
      assert.match(await page.locator('[data-review-result="qa"]').textContent(), /"score": 4/);
      assert.match(await page.locator('[data-review-result="survey"]').textContent(), /happy/);
      const dialogDownload = page.waitForEvent('download');
      await page.locator('[data-dialog-pdf]').click();
      const dialog = await dialogDownload;
      assert.equal(new URL(dialog.url()).pathname, `${artifactPath}/dialog-pdf`);
      assert.deepEqual(await fs.readFile(await dialog.path()), pdf);
      await shot('dialog');

      await page.selectOption('#adminView', 'trip');
      const shared = page.frameLocator('[data-trip-frame]');
      await shared.locator('[data-ts-timeline-title]').first().waitFor({ timeout: 40000 });
      assert.equal(await shared.locator('[data-ts-detail-edit="1"], [contenteditable="true"]').count(), 0);
      await shot('vacation-site');

      await page.selectOption('#adminView', 'keepsake');
      const preview = page.frameLocator('[data-keepsake-frame]');
      await preview.locator('[data-ae-print="1"]').first().waitFor({ timeout: 40000, state: 'attached' });
      const generate = page.locator('[data-keepsake-generate]');
      const existingRoute = `/api/pdf/shared/${orlando.shareSlug}/report/keepsake-style-2.pdf`;
      assert.equal(await generate.getAttribute('href'), existingRoute);
      const routeRequest = context.waitForEvent('request', (request) => new URL(request.url()).pathname === existingRoute);
      await generate.click();
      assert.equal((await routeRequest).method(), 'GET');
      await shot('keepsake');

      await page.selectOption('#adminView', 'onboarding');
      const replay = page.locator('[data-onboarding-replay]');
      assert.match(await replay.textContent(), /vacation app.*completed.*accept · Terms/s);
      assert.equal(await replay.locator('button, input, select, a, [contenteditable="true"]').count(), 0);
      await shot('onboarding');

      await page.selectOption('#adminView', 'captures');
      const captures = page.locator('[data-capture-turn]');
      assert.deepEqual(await captures.evaluateAll((images) => images.map((image) => Number(image.dataset.captureTurn))), [1, 2, 3, 4, 5]);
      for (const image of await captures.all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((element) => element.decode());
      }
      await captures.first().scrollIntoViewIfNeeded();
      await shot('captures');

      const selectedNote = `Private selected note ${width}`;
      const generalNote = `Private general note ${width}`;
      await page.setInputFiles('#fileInput', { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('admin attachment') });
      await page.fill('#messageText', selectedNote);
      await page.locator('#sendButton').click();
      const note = page.locator('[data-admin-note]').filter({ hasText: selectedNote });
      await note.waitFor();
      const uploadDownload = page.waitForEvent('download');
      await note.getByRole('link', { name: 'note.txt' }).click();
      assert.equal(await fs.readFile(await (await uploadDownload).path(), 'utf8'), 'admin attachment');
      await page.click('#tripButton');
      await page.click('[data-trip-id="all"]');
      await page.fill('#messageText', generalNote);
      await page.locator('#sendButton').click();
      await page.locator('[data-admin-note]').filter({ hasText: generalNote }).waitFor();
      assert.equal(await note.count(), 0);
      await page.reload();
      await page.locator('[data-admin-note]').filter({ hasText: generalNote }).waitFor();
      await page.locator(`[data-customer-id="${tripId}"]`).click();
      await note.waitFor();
      assert.equal(await page.locator('[data-admin-note]').filter({ hasText: generalNote }).count(), 0);
      const owner = await (await fetch(`${base}/api/vacation-itinerary?app=1`)).text();
      const trip = await (await fetch(`${base}/api/shared/${orlando.shareSlug}/`)).text();
      assert.ok(![owner, trip].some((payload) => payload.includes(selectedNote) || payload.includes(generalNote)));
      assert.ok(requests.every(([method, pathname]) => method === 'GET' || pathname.startsWith('/api/admin/')));
      assert.deepEqual(server.writes, []);

      await page.click('#tripButton');
      await page.click('[data-trip-id="all"]');
      await page.locator(`[data-customer-id="${other}"]`).click();
      await page.getByText('No Dialog PDF yet').waitFor();
      assert.equal(await page.locator('[data-review-result]').count(), 0);
      assert.equal(await note.count(), 0);
      await page.selectOption('#adminView', 'onboarding');
      await page.getByText('vacation app', { exact: true }).waitFor();
      await page.selectOption('#adminView', 'captures');
      await page.getByText('No captures', { exact: true }).waitFor();
      console.log(`ok - VK admin review B at ${width}`);
    } finally {
      await context.close();
    }
  }
  assert.ok(queries.length > 0 && queries.every((query) => /^\s*select\b/i.test(query)), 'admin review never writes to customer tables');
} finally {
  await browser.close();
  await server.close();
  await fs.rm(workspace, { recursive: true, force: true });
}
console.log(`VK admin review B passed (screenshots: ${log})`);
