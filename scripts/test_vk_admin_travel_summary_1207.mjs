import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';
import { loadVkAdminPlaywright } from './qa/vk-admin-playwright.mjs';
import { LocalVkAdminStore } from '../src/vacation/vk-admin-review-storage.mjs';
import { projectTravelSummaryFromRevision } from '../src/vacation/vk-travel-summary.mjs';
import { persistVacationAppCustomerTurn } from '../src/vacation/vacation-app-queue-persist.mjs';
import { turnUnderstandingRequest } from '../src/vacation/turn-understanding.mjs';
import { tripIntakeExtractionChatRequest } from '../src/vacation/trip-intake-classify.mjs';
import { replyInstructionsPayload, withOpenRouterLedger } from '../src/vacation/openrouter-call-ledger.mjs';
import { vacationAppTurnPayloadForClient } from '../src/vacation/blocked-turn-payload.mjs';
import { tripStateCapabilities } from '../src/vacation/trip-state-action-registry.mjs';
import { callTieredModel } from './vacation-app-reply-rules.mjs';

const tripId = randomUUID();
const customerId = randomUUID();
const firstId = randomUUID();
const middleId = randomUUID();
const lastId = randomUUID();
const lastRequest = randomUUID();
const token = () => randomUUID().slice(0, 8);
const tripRow = { trip_id: tripId, customer_id: customerId, title: token(), destination: token(),
  customer_email: 'summary-test@gmail.com', display_name: 'Summary test account', created_at: '2026-11-26T18:00:00Z' };
const turn = (id, direction, hour) => ({
  id, direction, speaker: direction === 'inbound' ? 'customer' : 'app',
  body: '', payload: {}, at: `2026-11-26T${hour}:00:00Z`,
});

const request = turnUnderstandingRequest(tripIntakeExtractionChatRequest({ message: '', model: 'fixture' }), 'Customer turn');
assert.equal('travelSummary' in request.response_format.json_schema.schema.properties, false);
assert.deepEqual(Object.keys(JSON.parse(request.messages[1].content)), ['sentences']);

const capabilities = tripStateCapabilities({ env: {} });
function makeRevisionRow({ turnNumber, revision, destination, title, itemTitle, timeValue, precision, proposedBy, askText, stepTask }) {
  const state = {
    version: '1.0',
    trip_id: tripId,
    updated_turn: turnNumber,
    revision,
    phase: 'shipped',
    scope: { mode: 'full', omitted: {} },
    capabilities,
    saved: {
      site_revision: `site-${revision}`,
      read: 'current',
      trip: { title, destination, start: '2027-04-05', end: '2027-04-06', via: 'intake', turn: 1 },
      days: {
        d1: {
          date: '2027-04-05',
          assigned: [{
            id: `a-${revision}`,
            item: `it-${revision}`,
            type: 'park',
            role: 'visit',
            time: { value: timeValue, precision },
            proposed_by: proposedBy,
            via: 'chat_action',
            turn: turnNumber,
          }],
          via: 'intake',
          turn: 1,
        },
      },
      items: {
        [`it-${revision}`]: { title: itemTitle, type: 'park', basis: 'named', proposed_by: proposedBy, via: 'customer_named', turn: turnNumber },
      },
      unassigned: [],
      lodging: {},
      flights: {},
      ground: {},
      travelers: {
        'tr-1': { name: `Traveler ${token()}`, relation: 'self', age: null, via: 'intake', turn: 1 },
      },
      collaborators: {},
      invites: {},
    },
    disclosed: {
      party: { kind: 'party', value: `Party ${token()}`, turn: 1 },
    },
    candidates: {},
    research: { key: null, state: 'waiting', turn: 1, areas: [], gaps: [] },
    proposals: {},
    open_asks: askText ? [{ id: `ask-${revision}`, text: askText, first_turn: turnNumber, status: 'open', outcome: null, turn: turnNumber, refs: [] }] : [],
    answered: [],
    said: [],
    last_actions: [],
    tool_status: [],
    next_steps: [{ kind: 'wait', task: stepTask, refs: [] }],
    updates: [{ section: 'saved', source: 'site_read', turn: turnNumber }],
  };
  const state_json = JSON.stringify(state);
  return {
    trip_id: tripId,
    revision,
    request_id: `req-${turnNumber}`,
    turn: turnNumber,
    phase: 'shipped',
    schema_version: '1.0',
    digest: createHash('sha256').update(state_json).digest('hex'),
    state_json,
    shipped_reply_id: randomUUID(),
  };
}

const firstRevRow = makeRevisionRow({
  turnNumber: 1, revision: 1, destination: token(), title: token(), itemTitle: `Park ${token()}`,
  timeValue: '09:00', precision: 'proposed', proposedBy: 'system', askText: '', stepTask: `Check plan ${token()}`,
});
const lastRevRow = {
  ...makeRevisionRow({
    turnNumber: 3, revision: 2, destination: token(), title: tripRow.title, itemTitle: `Museum ${token()}`,
    timeValue: '10:30', precision: 'exact', proposedBy: 'customer', askText: `Ask ${token()}`, stepTask: `Confirm times ${token()}`,
  }),
  request_id: lastRequest,
};
const revisionsByTurn = new Map([[1, firstRevRow], [3, lastRevRow]]);
const revisionsByRequest = new Map([[lastRequest, lastRevRow]]);
const expectedSnapshots = [
  { turnId: firstId, turnNumber: 1, tripState: projectTravelSummaryFromRevision(firstRevRow), conversationState: JSON.parse(firstRevRow.state_json) },
  { turnId: middleId, turnNumber: 2, tripState: null, conversationState: null },
  { turnId: lastId, turnNumber: 3, tripState: projectTravelSummaryFromRevision(lastRevRow), conversationState: JSON.parse(lastRevRow.state_json) },
];

async function captureRules(purpose, intakeReplyTurn = false) {
  const systemExtra = `\n  ${token()} <em>é</em> &\r\nsecond line\rthird line\n`;
  const customerTurn = token();
  const realFetch = globalThis.fetch;
  let messages;
  globalThis.fetch = async (url, { body }) => {
    assert.equal(new URL(url).pathname, '/api/v1/chat/completions');
    const sent = JSON.parse(body);
    messages = sent.messages;
    return Response.json({ model: sent.model, choices: [{ message: { content: token() } }], usage: { cost: 0 } });
  };
  try {
    return await withOpenRouterLedger(async () => {
      const result = await callTieredModel({
        customerTurn, systemExtra, purpose, intakeReplyTurn, jev: { jevRan: true, modelTier: 1 }, env: { OPENROUTER_API_KEY: token() },
      });
      assert.equal(result.called, true, result.reason);
      const { modelRules } = replyInstructionsPayload();
      const [recorded] = modelRules;
      assert.equal(modelRules.length, 1);
      assert.equal(recorded.purpose, purpose);
      const systemBlocks = messages.find(({ role }) => role === 'system').content.map(({ text }) => text);
      const extra = intakeReplyTurn ? systemBlocks.pop() : systemBlocks.at(-1).slice(-systemExtra.length);
      assert.equal(extra, systemExtra);
      if (!intakeReplyTurn) systemBlocks[1] = systemBlocks[1].slice(0, -extra.length - 2);
      assert.deepEqual(Buffer.from(recorded.sections.at(-1).text), Buffer.from(extra));
      assert.deepEqual(Buffer.from(recorded.sections.slice(0, -1).map(({ text }) => text).join('\n')), Buffer.from(systemBlocks.join('\n')));
      assert.deepEqual(vacationAppTurnPayloadForClient({ modelRules, roster: [] }), { roster: [] });
      return recorded;
    });
  } finally {
    globalThis.fetch = realFetch;
  }
}

const firstRules = [await captureRules('reply_draft')];
const lastRules = [await captureRules('reply_rewrite', true)];
const query = async (strings, ...values) => {
  const sql = strings.join('?');
  if (sql.includes('from trips t left join customers c')) return [tripRow];
  if (sql.includes('from vacation_trip_state_revisions')) {
    const row = sql.includes('request_id =') ? revisionsByRequest.get(values[1]) : revisionsByTurn.get(values[1]);
    return row ? [row] : [];
  }
  if (sql.includes('from transcript_turns')) return [
    { ...turn(firstId, 'inbound', 19), payload: { modelRules: firstRules } },
    turn(randomUUID(), 'outbound', 20),
    { ...turn(middleId, 'inbound', 21), payload: { liveTranscript: { rules: { ok: true, slug: token(), contentHash: token() } } } },
    { ...turn(lastId, 'inbound', 22), request_id: lastRequest },
    { ...turn(randomUUID(), 'outbound', 23), request_id: lastRequest, payload: { modelRules: lastRules } },
  ];
  return [];
};
const stateDir = await mkdtemp(path.join(os.tmpdir(), 'vk-travel-summary-'));
const store = new LocalVkAdminStore(stateDir);
await persistVacationAppCustomerTurn(async (strings) => {
  const sql = strings.join('?');
  if (sql.includes('insert into vacation_requests') || sql.includes('insert into worker_jobs')) return [{ id: randomUUID() }];
  if (sql.includes('insert into transcript_turns')) {
    assert.equal(sql.includes('insert into eula_store_objects'), false, 'customer turn persist must not write 5-field snapshot');
    return [{ id: lastId }];
  }
  return [];
}, { transcriptOwnerId: customerId, tripId, payload: {}, turnTag: {}, jobFields: {} });

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
    const revision = view.querySelector('[data-travel-revision]');
    const empty = view.querySelector('[data-travel-no-trip-state]');
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
      hasRevision: Boolean(revision),
      emptyText: empty?.textContent ?? null,
      title: revision?.querySelector('[data-revision-trip-title]')?.textContent ?? null,
      destination: revision?.querySelector('[data-revision-trip-destination]')?.textContent ?? null,
      assignmentTitle: revision?.querySelector('[data-revision-assignment-title]')?.textContent ?? null,
      viewStructure: [...view.children].map((node) => node.tagName),
      scrubberStructure: [...view.querySelector('.admin-travel-scrubber').children].map((node) => node.tagName),
      width: innerWidth,
      overflow: [pane, view, ...(revision ? [revision] : []), ...view.querySelectorAll('header, h1, dt, dd, p, input, button, details')].map(geometry).filter(Boolean),
      wraps: [...view.querySelectorAll('label, output, dt')].filter((node) => !hasOneLine(node)).map((node) => node.tagName),
    };
  });
  if (snapshot.tripState) {
    assert.equal(actual.hasRevision, true, 'visible fields are bound to the selected stored revision');
    assert.equal(actual.title, snapshot.tripState.trip.title, 'visible fields are bound to the selected stored revision');
    assert.equal(actual.destination, snapshot.tripState.trip.destination, 'visible fields are bound to the selected stored revision');
    assert.equal(actual.assignmentTitle, snapshot.tripState.days[0].assigned[0].title, 'visible fields are bound to the selected stored revision');
  } else {
    assert.equal(actual.hasRevision, false);
    assert.equal(actual.emptyText, 'No vacation state was stored for this turn.');
  }
  assert.deepEqual(actual.viewStructure, ['DIV', 'DIV', 'SECTION']);
  assert.deepEqual(actual.scrubberStructure, ['LABEL', 'BUTTON', 'INPUT', 'BUTTON', 'OUTPUT']);
  assert.equal(actual.turnId, snapshot.turnId);
  assert.equal(actual.value, turnNumber);
  assert.equal(actual.width, 390);
  assert.deepEqual(actual.overflow, [], 'Travel Summary stored fields are not clipped');
  assert.deepEqual(actual.wraps, [], 'Travel Summary controls fit on one line');
}

async function assertTurn(page, snapshot, number, rules) {
  await assertSummary(page, snapshot, number);
  const view = page.getByRole('region', { name: 'Travel Summary' });
  const rulesPanel = view.getByRole('region', { name: 'Model rules' });
  const sections = rulesPanel.locator('details');
  assert.equal(await view.locator('output').textContent(), `${number} / 3`);
  assert.equal(await view.getByRole('slider').getAttribute('aria-valuetext'), `${number} of 3`);
  assert.equal(await view.getByRole('button', { name: 'Previous turn' }).isDisabled(), number === 1);
  assert.equal(await view.getByRole('button', { name: 'Next turn' }).isDisabled(), number === 3);
  assert.equal(await sections.count(), rules.length);
  assert.equal(await rulesPanel.locator('.admin-empty').count(), Number(rules.length === 0));
  if (!rules.length) {
    assert.equal(await rulesPanel.locator('.admin-empty').textContent(), 'No model rules were stored for this turn.');
    assert.equal(await rulesPanel.locator('.admin-travel-rule-text').count(), 0);
  }
  assert.equal(await rulesPanel.locator('details[open]').count(), 0);
  for (const [index, { title, text }] of rules.entries()) {
    const section = sections.nth(index);
    const toggle = section.locator('summary');
    const content = section.locator('.admin-travel-rule-text');
    assert.equal(await toggle.textContent(), title);
    assert.equal(await content.isVisible(), false);
    await toggle.tap();
    assert.equal(await content.isVisible(), true);
    assert.deepEqual(Buffer.from(await content.textContent()), Buffer.from(text));
    assert.equal(await content.locator('*').count(), 0);
    await toggle.tap();
    assert.equal(await content.isVisible(), false);
  }
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
  const detail = await page.request.get(`${server.base}/api/admin/customers/${tripId}`);
  assert.ok(detail.ok());
  assert.ok((await detail.json()).vacation.turns.every((turn) => !('modelRules' in turn) && !('modelRules' in turn.payload)));
  const response = await page.request.get(endpoint);
  assert.ok(response.ok());
  assert.deepEqual((await response.json()).snapshots, [
    { ...expectedSnapshots[0], modelRules: firstRules },
    { ...expectedSnapshots[1], modelRules: [] },
    { ...expectedSnapshots[2], modelRules: lastRules },
  ]);
  assert.equal((await page.request.put(endpoint, { data: { snapshots: [] } })).status(), 405);
  await page.goto(`${server.base}/vacation-app/admin`);
  await page.getByRole('button', { name: 'Open Summary test account', exact: true }).click();
  await page.locator('#tripButton').click();
  await page.getByRole('option', { name: 'Travel Summary', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Turn' });
  await slider.waitFor();
  const previous = page.getByRole('button', { name: 'Previous turn' });
  const next = page.getByRole('button', { name: 'Next turn' });
  for (const arrow of [previous, next]) {
    const { width, height } = await arrow.boundingBox();
    assert.ok(width >= 44 && height >= 44);
  }
  await assertTurn(page, expectedSnapshots[2], 3, lastRules[0].sections);
  await previous.tap();
  await assertTurn(page, expectedSnapshots[1], 2, []);
  await previous.tap();
  await assertTurn(page, expectedSnapshots[0], 1, firstRules[0].sections);
  await page.locator('.admin-travel-rules summary').first().tap();
  await next.tap();
  await assertTurn(page, expectedSnapshots[1], 2, []);
  await slider.press('Home');
  await assertTurn(page, expectedSnapshots[0], 1, firstRules[0].sections);
  await next.tap();
  await next.tap();
  await assertTurn(page, expectedSnapshots[2], 3, lastRules[0].sections);

  await page.locator('[data-revision-trip-destination]').evaluate((field) => { field.textContent = ''; });
  await assert.rejects(() => assertSummary(page, expectedSnapshots[2], 3),
    (error) => error.message.startsWith('visible fields are bound to the selected stored revision'));
  await page.locator('[data-revision-trip-destination]').evaluate((field, value) => { field.textContent = value; }, expectedSnapshots[2].tripState.trip.destination);
  await page.locator('[data-view="travel-summary"]').evaluate((item) => item.remove());
  await assert.rejects(() => assertSummary(page, expectedSnapshots[2], 3),
    (error) => error.message.startsWith('Travel Summary must be a dropdown option'));
} finally {
  await browser.close();
  await server.close();
  await rm(stateDir, { recursive: true, force: true });
}

console.log('PASS VK admin Travel Summary revision replay, model rules, and 390 px layout gates');
