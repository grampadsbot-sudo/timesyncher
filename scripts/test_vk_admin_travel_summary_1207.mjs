import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';
import { loadVkAdminPlaywright } from './qa/vk-admin-playwright.mjs';
import { LocalVkAdminStore } from '../src/vacation/vk-admin-review-storage.mjs';
import { travelSummaryDocument, travelSummaryForTurn } from '../src/vacation/vk-travel-summary.mjs';
import { persistVacationAppCustomerTurn } from '../src/vacation/vacation-app-queue-persist.mjs';
import { turnUnderstandingRequest } from '../src/vacation/turn-understanding.mjs';
import { tripIntakeExtractionChatRequest } from '../src/vacation/trip-intake-classify.mjs';

const tripId = randomUUID();
const customerId = randomUUID();
const firstId = randomUUID();
const lastId = randomUUID();
const token = () => randomUUID().slice(0, 8);
const tripRow = { trip_id: tripId, customer_id: customerId, title: token(), destination: token(),
  customer_email: 'summary-test@gmail.com', display_name: 'Summary test account', created_at: '2026-11-26T18:00:00Z' };
const turn = (id, direction, hour) => ({
  id, direction, speaker: direction === 'inbound' ? 'customer' : 'app',
  body: '', payload: {}, at: `2026-11-26T${hour}:00:00Z`,
});
const first = { turnId: firstId, where: token(), who: '', transport: '', tripName: '', description: '' };
const modelFields = { where: first.where, who: token(), transport: token(), description: token() };
const last = { turnId: lastId, ...travelSummaryForTurn(tripRow, { ...modelFields, tripName: token() }) };
assert.equal(last.tripName, tripRow.title);
assert.equal(last.description, modelFields.description);
const context = { where: first.where, previousSummary: first, customerTurns: [token()] };
const request = turnUnderstandingRequest(tripIntakeExtractionChatRequest({ message: '', model: 'fixture' }), 'Customer turn', context);
assert.deepEqual(JSON.parse(request.messages[1].content).savedVacation, context);
assert.deepEqual(request.response_format.json_schema.schema.properties.travelSummary.required, [
  'where', 'who', 'transport', 'description',
]);

const query = async (strings) => {
  const sql = strings.join('?');
  if (sql.includes('from trips t left join customers c')) return [tripRow];
  if (sql.includes('from transcript_turns')) return [turn(firstId, 'inbound', 19), turn(randomUUID(), 'outbound', 20), turn(lastId, 'inbound', 21)];
  return [];
};
const stateDir = await mkdtemp(path.join(os.tmpdir(), 'vk-travel-summary-'));
const store = new LocalVkAdminStore(stateDir);
const save = (snapshot) => store.putJson(`artifacts/${tripId}/travel-summary/${snapshot.turnId}.json`, snapshot);
await save({ ...travelSummaryDocument(first), turnId: firstId });
const { turnId: storedId, ...forPersist } = last;
await persistVacationAppCustomerTurn(async (strings, ...values) => {
  const sql = strings.join('?');
  if (sql.includes('insert into vacation_requests') || sql.includes('insert into worker_jobs')) return [{ id: randomUUID() }];
  if (sql.includes('insert into transcript_turns')) {
    assert.ok(sql.includes('insert into eula_store_objects'), 'the turn and snapshot are stored in the same statement');
    assert.ok(values.includes(`vk-admin-review/artifacts/${tripId}/travel-summary`));
    const document = values.find((value) => value?.description === modelFields.description);
    assert.deepEqual(document, { ...forPersist, version: 2 });
    await save({ turnId: storedId, ...document });
    return [{ id: storedId }];
  }
  return [];
}, { transcriptOwnerId: customerId, tripId, payload: {}, turnTag: {}, jobFields: {}, travelSummary: forPersist });

async function assertSummary(page, snapshot, turnNumber) {
  await page.locator('#tripButton').click();
  const option = page.getByRole('option', { name: 'Travel Summary', exact: true });
  assert.equal(await option.count(), 1, 'Travel Summary must be a dropdown option');
  assert.equal(await option.getAttribute('aria-selected'), 'true');
  const optionLayout = await option.locator('b').evaluate((label) => {
    const text = document.createRange();
    text.selectNodeContents(label);
    const rect = text.getBoundingClientRect();
    const menu = label.closest('.trip-list').getBoundingClientRect();
    return text.getClientRects().length === 1 && rect.left >= menu.left && rect.right <= menu.right;
  });
  assert.equal(optionLayout, true, 'option is on one visible line');
  await page.keyboard.press('Escape');

  const actual = await page.locator('.admin-travel').evaluate((view) => {
    const cover = view.querySelector('[data-travel-cover]');
    const pane = view.closest('.admin-view-panel');
    const geometry = (node) => {
      const bounds = node.getBoundingClientRect();
      return bounds.width > 0 && bounds.left >= 0 && bounds.right <= innerWidth && node.scrollWidth <= node.clientWidth + 1
        ? null : [node.tagName, bounds.left, bounds.right, node.scrollWidth, node.clientWidth];
    };
    const hasOneLine = (node) => {
      const text = document.createRange();
      text.selectNodeContents(node);
      return text.getClientRects().length === 1;
    };
    return {
      turnId: view.querySelector('[data-travel-snapshot]').dataset.travelSnapshot,
      value: view.querySelector('input').valueAsNumber,
      fields: [...cover.querySelectorAll('[data-travel-field]')].map((node) => [node.dataset.travelField, node.textContent]),
      structure: [...cover.querySelectorAll('*')].map((node) => node.tagName),
      viewStructure: [...view.children].map((node) => node.tagName),
      scrubberStructure: [...view.querySelector('.admin-travel-scrubber').children].map((node) => node.tagName),
      width: innerWidth,
      overflow: [pane, view, cover, ...view.querySelectorAll('header, h1, dt, dd, p, input')].map(geometry).filter(Boolean),
      wraps: [...view.querySelectorAll('label, output, dt')].filter((node) => !hasOneLine(node)).map((node) => node.tagName),
    };
  });
  const fields = Object.entries(snapshot).filter(([key, value]) => key !== 'turnId' && value);
  assert.deepEqual(Object.fromEntries(actual.fields), Object.fromEntries(fields), 'visible fields are bound to the selected stored snapshot');
  assert.equal(actual.fields.length, fields.length);
  const labels = ['where', 'who', 'transport'].filter((field) => snapshot[field]);
  assert.deepEqual(actual.structure, [
    ...(snapshot.tripName ? ['HEADER', 'IMG', 'H1'] : []),
    ...(labels.length ? ['DL', ...labels.flatMap(() => ['DIV', 'DT', 'DD'])] : []),
    ...(snapshot.description ? ['P'] : []),
  ], 'cover contains only bound fields and their labels');
  assert.deepEqual(actual.viewStructure, ['DIV', 'DIV']);
  assert.deepEqual(actual.scrubberStructure, ['LABEL', 'INPUT', 'OUTPUT']);
  assert.equal(actual.turnId, snapshot.turnId);
  assert.equal(actual.value, turnNumber);
  assert.equal(actual.width, 390);
  assert.deepEqual(actual.overflow, [], 'Travel Summary stored fields are not clipped');
  assert.deepEqual(actual.wraps, [], 'Travel Summary controls fit on one line');
}

process.env.VK_ADMIN_LOGIN = randomUUID();
process.env.VK_ADMIN_SESSION_SECRET = randomUUID();
const server = await startVkAdminLocalServer({ adminDatabase: () => query, adminStore: () => store });
const chromium = loadVkAdminPlaywright().chromium;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const endpoint = `${server.base}/api/admin/customers/${tripId}/artifacts/travel-summary`;
  assert.equal((await page.request.get(endpoint)).status(), 401);
  assert.ok((await page.request.post(`${server.base}/api/admin/session`, { data: { login: process.env.VK_ADMIN_LOGIN } })).ok());
  const response = await page.request.get(endpoint);
  assert.ok(response.ok());
  assert.deepEqual((await response.json()).snapshots, [
    { ...first, turnNumber: 1 }, { ...last, turnNumber: 2 },
  ]);
  assert.equal((await page.request.put(endpoint, { data: { snapshots: [] } })).status(), 405);
  await page.goto(`${server.base}/vacation-app/admin`);
  await page.getByRole('button', { name: 'Open Summary test account', exact: true }).click();
  await page.locator('#tripButton').click();
  await page.getByRole('option', { name: 'Travel Summary', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Turn' });
  await slider.waitFor();
  await assertSummary(page, last, 2);
  await slider.press('ArrowLeft');
  await assertSummary(page, first, 1);
  await slider.press('ArrowRight');
  await assertSummary(page, last, 2);

  await page.locator('[data-travel-field="who"]').evaluate((field) => { field.textContent = ''; });
  await assert.rejects(() => assertSummary(page, last, 2),
    (error) => error.message.startsWith('visible fields are bound to the selected stored snapshot'));
  await page.locator('[data-travel-field="who"]').evaluate((field, value) => { field.textContent = value; }, last.who);
  await page.locator('[data-travel-cover]').evaluate((cover) => {
    const extra = document.createElement('p');
    extra.textContent = 'Placeholder';
    cover.append(extra);
  });
  await assert.rejects(() => assertSummary(page, last, 2),
    (error) => error.message.startsWith('cover contains only bound fields and their labels'));
  await page.locator('[data-view="travel-summary"]').evaluate((item) => item.remove());
  await assert.rejects(() => assertSummary(page, last, 2),
    (error) => error.message.startsWith('Travel Summary must be a dropdown option'));
} finally {
  await browser.close();
  await server.close();
  await rm(stateDir, { recursive: true, force: true });
}

console.log('PASS VK admin Travel Summary storage, turn replay, and 390 px layout gates');
