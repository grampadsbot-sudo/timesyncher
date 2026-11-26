#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cannedWelcomeLiveTurn } from '../src/vacation/onboarding-welcome.mjs';
import { LocalVkAdminStore } from '../src/vacation/vk-admin-review-storage.mjs';
import { firstFiveTurnCapture, createAdminArtifactWriter, storeDialogPdf } from './harness/admin-review-artifacts.mjs';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';
import { loadVkAdminPlaywright } from './qa/vk-admin-playwright.mjs';

const { chromium } = loadVkAdminPlaywright();
const fixturePath = new URL('./fixtures/vk-admin-review/vacation-fixtures.json', import.meta.url);
const [orlando] = JSON.parse(await fs.readFile(fixturePath, 'utf8')).vacations;
const tripId = 'aaaaaaaa-0000-0000-0000-000000000116';
const other = 'bbbbbbbb-0000-0000-0000-000000000116';
const olderTrip = 'cccccccc-0000-0000-0000-000000000116';
const customerId = 'fixture-lopez-current';
const earlierCustomerId = 'fixture-lopez-earlier';
const fixtureTrip = 'vk-fixture-trip-001';
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
  { trip_id: tripId, title: 'Test harness review', destination: 'Fixture destination', customer_id: customerId, display_name: 'Sofia Lopez',
    customer_email: 'harness+fixture-current+vk-001-lopez@harness.invalid',
    share_slug: orlando.shareSlug, harness_tag: 'harness:fixture:review', created_at: current,
    start_date: '2027-03-01', end_date: '2027-03-05', qa: { score: 4 }, survey: { rating: 'happy' } },
  { trip_id: other, title: 'Second fixture', destination: 'Fixture destination', customer_id: 'fixture-2', display_name: 'Second fixture', created_at: before },
  { trip_id: olderTrip, title: 'Earlier fixture vacation', destination: 'Earlier destination', customer_id: earlierCustomerId,
    customer_email: 'harness+fixture-earlier+vk-001-lopez@harness.invalid', display_name: 'Sofia Lopez', created_at: before },
];
const names = ['vendor/first', 'vendor/second', 'vendor/third'];
const ledger = (requestId, model, costSource, costUsd, extra = {}) => ({ tripId, requestId, model, costUsd, costSource, ...extra });
const replies = [
  [ledger('req-1', names[0], 'openrouter_usage_cost', 0.01234567, { purpose: 'reply_draft' }),
    ledger('req-1', 'vendor/judge', 'openrouter_usage_cost', 0.002, { purpose: 'jev_quality' }),
    ledger('req-1', names[0], 'openrouter_usage_cost', 99, { tripId: other, purpose: 'reply_draft' })],
  [ledger(null, names[1], 'openrouter_listed_price', 0.05, { tripId: null, purpose: 'reply_rewrite' }),
    ledger('req-2', names[0], 'openrouter_usage_cost', 0.003, { purpose: 'reply_draft' })],
  [ledger('req-3', names[2], 'unpriced', null, { purpose: 'reply_draft' })],
];
const turns = replies.flatMap((rows, index) => {
  const common = { request_id: `req-${index + 1}`, at: current };
  return [
    { ...common, speaker: 'customer', direction: 'inbound', body: `Customer line ${index + 1}`,
      payload: index === 0 ? { liveTranscript: { openrouterCalls: rows.slice(0, 1) } } : {} },
    { ...common, speaker: 'app', direction: 'outbound', body: `App reply ${index + 1}`,
      payload: { liveTranscript: index === 1
        ? { modelId: names[0], quality: { shippedModel: names[index] }, shippedRewrite: true, openrouterCalls: rows }
        : { shippedModel: names[index], openrouterCalls: rows } } },
  ];
});
const openingGreeting = "Welcome, Sofia! You're all set to start planning your vacation.";
turns.unshift({ at: current, speaker: 'app', direction: 'outbound', body: openingGreeting,
  payload: { welcomeAudience: 'owner', liveTranscript: cannedWelcomeLiveTurn({ text: openingGreeting, at: current }) } });
turns.push({ request_id: 'req-4', at: current, speaker: 'app', direction: 'outbound', body: 'App reply 4',
  payload: { liveTranscript: { model: { responseModel: 'vendor/legacy',
    cost: { status: 'measured', currency: 'USD', dollars: 0.004, source: 'openrouter_usage_cost' } } } } });
const storedOnboarding = [{ id: 'fixture-session', status: 'completed', current_step: 'vacation_app', created_at: before, completed_at: current }];
let queries = [];
const db = async (parts, id) => {
  const query = parts.join('?');
  queries.push(query);
  if (query.includes('from transcript_turns')) return id === tripId ? turns : [];
  if (query.includes('from onboarding_clicks')) return [{ session_id: 'fixture-session', event_type: 'accept', target: 'Terms', clicked_at: current }];
  if (query.includes('from onboarding_sessions')) return storedOnboarding;
  if (query.includes('lower(c.email) like')) {
    const aliasPrefix = id.split('%')[1];
    return vacations.filter((row) => row.customer_email?.includes(aliasPrefix));
  }
  if (query.includes('from trips where customer_id')) return vacations.filter((row) => row.customer_id === id);
  if (query.includes('from trips')) return id ? vacations.filter((row) => row.trip_id === id) : vacations;
  throw new Error('Unknown fixture query');
};
const server = await startVkAdminLocalServer({
  adminDatabase: () => db,
  adminStore: () => new LocalVkAdminStore(workspace),
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
  const picker = await (await fetch(`${base}/api/admin/customers`, { headers: { cookie } })).json();
  assert.equal(picker.testCustomerCount, 100, 'roster runs do not add customers to the roster count');
  assert.ok(!JSON.stringify(picker).includes('@harness.invalid'));
  const store = new LocalVkAdminStore(workspace);
  const earlierNoteId = 'dddddddd-0000-0000-0000-000000000116';
  await store.putJson(`notes/customer-${earlierCustomerId}/${earlierNoteId}.json`, {
    id: earlierNoteId, vacationId: olderTrip, at: before, text: 'Existing admin note',
    attachments: [{ name: 'existing.txt', data: Buffer.from('existing admin attachment').toString('base64') }],
  });
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
  const notesUrl = (id) => `${base}/api/admin/notes?vacationId=${id}&customerId=1`;
  const readNotes = async (id) => {
    const response = await fetch(notesUrl(id), { headers: { cookie } });
    assert.equal(response.status, 200);
    return (await response.json()).notes;
  };
  assert.equal((await fetch(notesUrl(other), { headers: { cookie } })).status, 404);
  const invalidNote = await fetch(`${base}/api/admin/notes`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Missing vacation ID' }),
  });
  assert.equal(invalidNote.status, 404);

  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 }, acceptDownloads: true });
    try {
      const page = await context.newPage();
      const shot = async (name) => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name);
        await page.screenshot({ path: path.join(log, `${name}-${width}.png`), mask: [page.locator('.admin-coupon')] });
      };
      const menuButton = page.locator('#tripButton');
      const viewOptions = page.locator('#vacationDropdown [data-view]');
      const shotMenu = async (name) => {
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#vacationDropdown .trip-list')).opacity === '1');
        await shot(name);
      };
      const chooseView = async (name) => {
        await menuButton.click();
        await page.getByRole('option', { name, exact: true }).click();
      };
      const basicViews = ['Dialog', 'Vacation site', 'Keepsake', 'Onboarding', 'Chat screenshots'];
      const requests = [];
      page.on('request', (request) => requests.push([request.method(), new URL(request.url()).pathname]));
      await page.goto(`${base}/vacation-app/admin`);
      await page.fill('#adminLoginInput', LOGIN);
      await page.locator('#adminLogin button').click();
      await page.locator('[data-trip-group]').first().waitFor();
      const timestamps = await page.locator('[data-sort-at]').evaluateAll((rows) => rows.map((row) => row.dataset.sortAt));
      assert.deepEqual(timestamps, [...timestamps].sort().reverse());
      assert.equal(await page.locator('[data-trip-group]').first().getAttribute('data-trip-group'), tripId);
      const sofia = page.getByRole('button', { name: 'Open Sofia Lopez', exact: true });
      assert.equal(await sofia.count(), 1, 'one Sofia Lopez picker entry across harness runs');
      assert.equal(await page.getByRole('button', { name: 'Open Lopez family', exact: true }).count(), 0, 'roster vacation is in Sofia’s account');
      await shot('customers');

      await sofia.click();
      await page.locator(`#sitePane[data-kind="chat"][data-run="${tripId}"]`).waitFor();
      await page.locator('[data-dialog-pdf]').waitFor();
      const welcome = page.locator('[data-admin-welcome]');
      await welcome.waitFor();
      assert.equal(await welcome.count(), 1);
      assert.match(await welcome.textContent(), /Welcome to Sofia Lopez's vacation\. Test harness review in Fixture destination · 2027-03-01 to 2027-03-05/);
      assert.equal(await welcome.getAttribute('data-vacation-id'), tripId);
      const existingNote = page.locator('#messages [data-admin-note]').filter({ hasText: 'Existing admin note' });
      assert.equal(await existingNote.getAttribute('data-vacation-id'), olderTrip);
      const existingDownload = page.waitForEvent('download');
      await existingNote.getByRole('link', { name: 'existing.txt' }).click();
      assert.equal(await fs.readFile(await (await existingDownload).path(), 'utf8'), 'existing admin attachment');
      assert.equal(await page.locator('#adminView, .admin-view-controls, select').count(), 0);
      assert.equal(await page.locator('#appHeader .vacation-dropdown').count(), 1);
      await menuButton.click();
      assert.deepEqual(await viewOptions.allTextContents(), [...basicViews, 'All vacations']);
      await shotMenu('header-multiple-vacations');
      await page.keyboard.press('Escape');
      assert.equal(await menuButton.getAttribute('aria-expanded'), 'false');
      const dialogTurns = page.locator('#customerChatReplay article');
      const greetingDetail = dialogTurns.filter({ hasText: openingGreeting }).locator('xpath=following-sibling::*[1]');
      assert.equal(await greetingDetail.textContent(), 'Opening greeting (no model, no cost)');
      const text = await dialogTurns.allTextContents();
      assert.deepEqual(text.slice(1).map((line) => line.match(/(?:Customer line|App reply) \d/)[0]), turns.slice(1).map((turn) => turn.body));
      assert.deepEqual(await page.locator('.admin-reply-detail').allTextContents(), [
        'Opening greeting (no model, no cost)',
        'vendor/first · Actual $0.01234567 Estimated $0.00',
        'vendor/second · Actual $0.00 Estimated $0.05',
        'vendor/third · unpriced',
        'vendor/legacy · Actual $0.004 Estimated $0.00',
      ]);
      assert.match(await page.locator('[data-vacation-total]').textContent(), /Actual \$0.02134567 Estimated \$0.05 1 unpriced/);
      assert.match(await page.locator('[data-review-result="qa"]').textContent(), /"score": 4/);
      assert.match(await page.locator('[data-review-result="survey"]').textContent(), /happy/);
      const dialogDownload = page.waitForEvent('download');
      await page.locator('[data-dialog-pdf]').click();
      const dialog = await dialogDownload;
      assert.equal(new URL(dialog.url()).pathname, `${artifactPath}/dialog-pdf`);
      assert.deepEqual(await fs.readFile(await dialog.path()), pdf);
      await shot('dialog');

      await chooseView('Vacation site');
      const shared = page.frameLocator('[data-trip-frame]');
      await shared.locator('[data-ts-timeline-title]').first().waitFor({ timeout: 40000 });
      assert.equal(await shared.locator('[data-ts-detail-edit="1"], [contenteditable="true"]').count(), 0);
      await shot('vacation-site');

      await chooseView('Keepsake');
      const preview = page.frameLocator('[data-keepsake-frame]');
      await preview.locator('[data-ae-print="1"]').first().waitFor({ timeout: 40000, state: 'attached' });
      const generate = page.locator('[data-keepsake-generate]');
      const existingRoute = `/api/pdf/shared/${orlando.shareSlug}/report/keepsake-style-2.pdf`;
      assert.equal(await generate.getAttribute('href'), existingRoute);
      const routeRequest = context.waitForEvent('request', (request) => new URL(request.url()).pathname === existingRoute);
      await generate.click();
      assert.equal((await routeRequest).method(), 'GET');
      await shot('keepsake');

      await chooseView('Onboarding');
      const replay = page.locator('[data-onboarding-replay]');
      assert.match(await replay.textContent(), /vacation app.*completed.*accept · Terms/s);
      assert.equal(await replay.locator('button, input, select, a, [contenteditable="true"]').count(), 0);
      await shot('onboarding');

      await chooseView('Chat screenshots');
      const captures = page.locator('[data-capture-turn]');
      assert.deepEqual(await captures.evaluateAll((images) => images.map((image) => Number(image.dataset.captureTurn))), [1, 2, 3, 4, 5]);
      for (const image of await captures.all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((element) => element.decode());
      }
      await captures.first().scrollIntoViewIfNeeded();
      await shot('captures');

      const selectedNote = `Private selected note ${width}`;
      const olderNote = `Private earlier vacation note ${width}`;
      const originalWelcome = (await readNotes(tripId))[0];
      assert.equal(originalWelcome.kind, 'welcome');
      await page.setInputFiles('#fileInput', { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('admin attachment') });
      await page.fill('#messageText', selectedNote);
      await page.locator('#sendButton').click();
      const note = page.locator('[data-admin-note]').filter({ hasText: selectedNote });
      await note.waitFor();
      const uploadDownload = page.waitForEvent('download');
      await note.getByRole('link', { name: 'note.txt' }).click();
      assert.equal(await fs.readFile(await (await uploadDownload).path(), 'utf8'), 'admin attachment');
      await page.evaluate(() => { window.initialThread = document.getElementById('messages'); });
      await chooseView('Dialog');
      await page.locator('[data-dialog-pdf]').waitFor();
      await chooseView('All vacations');
      const vacationList = page.locator('#sitePane [data-admin-vacations]');
      assert.deepEqual(await vacationList.locator('[data-open-vacation]').evaluateAll((buttons) =>
        buttons.map((button) => button.dataset.openVacation)), [tripId, olderTrip, fixtureTrip]);
      assert.match(await vacationList.textContent(), /Earlier fixture vacation.*Earlier destination/s);
      await shot('all-vacations');
      await vacationList.locator(`[data-open-vacation="${olderTrip}"]`).click();
      await page.locator(`#sitePane[data-kind="chat"][data-run="${olderTrip}"]`).waitFor();
      assert.equal(await page.evaluate(() => window.initialThread === document.getElementById('messages')), true);
      assert.equal(await note.count(), 1);
      assert.equal(await welcome.count(), 1);
      await page.fill('#messageText', olderNote);
      await page.locator('#sendButton').click();
      const earlierNote = page.locator('[data-admin-note]').filter({ hasText: olderNote });
      await earlierNote.waitFor();
      assert.equal(await earlierNote.getAttribute('data-vacation-id'), olderTrip);
      const stored = await readNotes(olderTrip);
      assert.deepEqual(stored[0], originalWelcome);
      for (const [text, vacationId] of [[selectedNote, tripId], [olderNote, olderTrip]]) {
        const saved = stored.find((entry) => entry.text === text);
        assert.equal(saved.vacationId, vacationId);
        const record = await new LocalVkAdminStore(workspace).getJson(`notes/customer-1/${saved.id}.json`);
        assert.equal(record.vacationId, vacationId);
      }
      const welcomeRecord = await new LocalVkAdminStore(workspace).getJson('notes/customer-1/welcome.json');
      assert.equal(welcomeRecord.vacationId, tripId);
      await page.reload();
      await earlierNote.waitFor();
      assert.equal(await note.getAttribute('data-vacation-id'), tripId);
      assert.equal(await earlierNote.getAttribute('data-vacation-id'), olderTrip);
      assert.deepEqual(await readNotes(olderTrip), stored);
      const owner = await (await fetch(`${base}/api/vacation-itinerary?app=1`)).text();
      const trip = await (await fetch(`${base}/api/shared/${orlando.shareSlug}/`)).text();
      assert.ok(![owner, trip].some((payload) => payload.includes(selectedNote) || payload.includes(olderNote)));
      assert.ok(requests.every(([method, pathname]) => method === 'GET' || pathname.startsWith('/api/admin/')));
      assert.deepEqual(server.writes, []);

      await chooseView('All Customers');
      await page.getByRole('button', { name: 'Open Second fixture', exact: true }).click();
      await page.getByText('No Dialog PDF yet').waitFor();
      await welcome.waitFor();
      assert.match(await welcome.textContent(), /Welcome to Second fixture's vacation/);
      assert.equal(await page.locator('[data-review-result]').count(), 0);
      assert.equal(await note.count(), 0);
      assert.equal(await existingNote.count(), 0);
      await menuButton.click();
      assert.deepEqual(await viewOptions.allTextContents(), basicViews);
      await shotMenu('header-single-vacation');
      await page.keyboard.press('Escape');
      await chooseView('Onboarding');
      await page.getByText('vacation app', { exact: true }).waitFor();
      await chooseView('Chat screenshots');
      await page.getByText('No captures', { exact: true }).waitFor();
      await chooseView('All Customers');
      await sofia.click();
      await note.waitFor();
      assert.equal(await welcome.count(), 1);
      assert.equal(await earlierNote.count(), 1);
      assert.deepEqual(await readNotes(tripId), stored);
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
