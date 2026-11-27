import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalVkAdminStore, listTravelSummarySnapshots, revisionForAdminTurn } from '../src/vacation/vk-admin-review-storage.mjs';
import { adminViewsStatus } from '../src/vacation/vk-admin-views.mjs';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';
import { loadVkAdminPlaywright } from './qa/vk-admin-playwright.mjs';

const vacationId = '159bf80f-5c6c-44f3-8b67-df2afeead39c';
const customerCount = 50;

function conversationState(turnNumber) {
  return {
    version: '1.0',
    trip_id: vacationId,
    updated_turn: turnNumber,
    revision: turnNumber,
    phase: 'shipped',
    saved: {
      items: turnNumber === customerCount ? { 'day-50': { title: 'Harbor walk', type: 'activity' } } : {},
      unassigned: turnNumber === customerCount ? ['day-50'] : [],
    },
    research: turnNumber === customerCount
      ? { build: { items_by_type: { activity: 1 }, started_offset_ms: 10, duration_ms: 20 } }
      : {},
  };
}

const transcript = [];
const revisions = [];
for (let turnNumber = 1; turnNumber <= customerCount; turnNumber += 1) {
  const requestId = `req-${turnNumber}`;
  transcript.push({
    id: `customer-${turnNumber}`,
    request_id: requestId,
    speaker: 'customer',
    direction: 'inbound',
    body: `Planning note ${turnNumber}`,
    payload: {},
    at: `2026-11-27T20:${String(turnNumber).padStart(2, '0')}:00.000Z`,
  });
  transcript.push({
    id: `app-${turnNumber}`,
    request_id: requestId,
    speaker: 'app',
    direction: 'outbound',
    body: `Saved note ${turnNumber}`,
    payload: {},
    at: `2026-11-27T20:${String(turnNumber).padStart(2, '0')}:30.000Z`,
  });
  revisions.push({
    request_id: requestId,
    turn: turnNumber,
    revision: turnNumber,
    state_json: JSON.stringify(conversationState(turnNumber)),
  });
}

const stale = revisionForAdminTurn(
  [{ request_id: 'stored-request', turn: 7, revision: 1, state_json: revisions[6].state_json }],
  7,
  'stale-request',
);
assert.equal(JSON.parse(stale.state_json).updated_turn, 7);

const vacation = {
  tripId: vacationId,
  turns: transcript.map((row) => ({
    turnId: row.id,
    requestId: row.request_id,
    speaker: row.speaker,
    direction: row.direction,
    body: row.body,
    payload: row.payload,
  })),
};
let revisionQueries = 0;
const counted = async (parts) => {
  const sql = parts.join('?');
  if (!sql.includes('from vacation_trip_state_revisions')) return [];
  revisionQueries += 1;
  return revisions;
};
const snapshots = await listTravelSummarySnapshots(counted, vacation);
assert.equal(revisionQueries, 1, 'a 50-message vacation loads conversation management in one read');
assert.equal(snapshots.length, customerCount);
assert.equal(snapshots[customerCount - 1].conversationState.saved.items['day-50'].title, 'Harbor walk');
assert.deepEqual(adminViewsStatus(vacation, snapshots), { missing: [] });
assert.deepEqual(adminViewsStatus({}, null), { missing: ['dialog', 'turns'] });

const tripRow = {
  trip_id: vacationId,
  title: 'Fixture coast vacation',
  destination: 'Fixture coast',
  created_at: '2026-11-27T20:15:46.000Z',
  start_date: '2027-04-05',
  end_date: '2027-04-09',
  status: 'active',
  metadata: {},
  customer_id: 'fixture-guest',
  customer_email: 'guest@harness.invalid',
  display_name: 'Fixture guest',
  harness_tag: 'harness:fixture:dialog-turns',
  share_slug: '',
  qa: null,
  survey: null,
  intake_share: false,
};
const db = async (parts) => {
  const sql = parts.join('?');
  if (sql.includes('from vacation_trip_state_revisions')) return revisions;
  if (sql.includes('from transcript_turns')) return transcript;
  if (sql.includes('where t.id')) return [tripRow];
  return [];
};

process.env.VK_ADMIN_LOGIN = 'dialog-turns-admin';
process.env.VK_ADMIN_SESSION_SECRET = 'dialog-turns-session';
delete process.env.VERCEL_ENV;
const stateDir = await mkdtemp(path.join(os.tmpdir(), 'vk-admin-dialog-turns-'));
const server = await startVkAdminLocalServer({
  adminDatabase: () => db,
  adminStore: () => new LocalVkAdminStore(stateDir),
});
const browser = await loadVkAdminPlaywright().chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${server.base}/vacation-app/admin/?vacationId=${vacationId}`);
  await page.fill('#adminLoginInput', process.env.VK_ADMIN_LOGIN);
  await page.locator('#adminLogin button').click();
  await page.locator(`#sitePane[data-kind="dialog"][data-run="${vacationId}"] #customerChatReplay`).waitFor();
  assert.equal(await page.locator('#customerChatReplay article.bubble.user').count(), customerCount);
  assert.match(await page.locator('#customerChatReplay').textContent(), /Planning note 1/);
  assert.match(await page.locator('#customerChatReplay').textContent(), /Planning note 50/);
  assert.equal(await page.locator('[data-admin-customers]').count(), 0, 'the direct vacation link opens the conversation');
  await page.locator('#tripButton').click();
  const viewNames = await page.locator('#vacationDropdown [data-view]').allTextContents();
  assert.ok(viewNames.includes('Dialog'));
  assert.ok(viewNames.includes('Turns'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#sitePane')?.dataset.adminViewsMissing === '');
  const summary = await page.request.get(`${server.base}/api/admin/customers/${vacationId}/artifacts/travel-summary`);
  assert.equal(summary.status(), 200);
  assert.deepEqual((await summary.json()).admin_views, { missing: [] });
  await page.locator('#tripButton').click();
  await page.getByRole('option', { name: 'Turns', exact: true }).click();
  await page.locator('#sitePane[data-kind="turns"] [data-conversation-json]').first().waitFor();
  assert.equal(await page.locator('[data-conversation-turn]').count(), customerCount);
  const headings = await page.locator('.admin-turns h3').allTextContents();
  assert.deepEqual(headings, Array.from({ length: customerCount }, (_, index) => `Turn ${index + 1}`));
  assert.equal(/\btrip\b/i.test(headings.join(' ')), false);
  const stored = JSON.parse(await page.locator('[data-conversation-turn="50"] [data-conversation-json]').textContent());
  assert.equal(stored.saved.items['day-50'].title, 'Harbor walk');
  assert.deepEqual(stored.research.build.items_by_type, { activity: 1 });
  assert.equal(await page.locator('#sitePane').getAttribute('data-admin-views-missing'), '');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
  await rm(stateDir, { recursive: true, force: true });
}

console.log('vk admin dialog and turns views ok');
