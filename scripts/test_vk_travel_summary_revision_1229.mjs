import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';
import { loadVkAdminPlaywright } from './qa/vk-admin-playwright.mjs';
import { LocalVkAdminStore } from '../src/vacation/vk-admin-review-storage.mjs';
import { turnUnderstandingRequest } from '../src/vacation/turn-understanding.mjs';
import { tripIntakeExtractionChatRequest } from '../src/vacation/trip-intake-classify.mjs';
import { persistVacationAppCustomerTurn } from '../src/vacation/vacation-app-queue-persist.mjs';
import { tripStateCapabilities } from '../src/vacation/trip-state-action-registry.mjs';

const readText = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ajv = new Ajv2020({ strictRequired: false, strictTypes: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readText('../src/vacation/trip-state.schema.json')));

const understandingReq = turnUnderstandingRequest(
  tripIntakeExtractionChatRequest({ message: 'Plan our family days', model: 'fixture' }),
  'Plan our family days',
);
assert.equal('travelSummary' in understandingReq.response_format.json_schema.schema.properties, false);
assert.equal(understandingReq.messages[0].content.includes('For travelSummary'), false);
assert.deepEqual(Object.keys(JSON.parse(understandingReq.messages[1].content)), ['sentences']);

const persistedSql = [];
await persistVacationAppCustomerTurn(async (strings) => {
  const query = strings.join('?');
  persistedSql.push(query);
  return [{ id: randomUUID() }];
}, {
  transcriptOwnerId: randomUUID(),
  tripId: randomUUID(),
  queuedJobType: 'trip_intake',
  requestText: 'Plan our family days',
  payload: {},
  turnTag: { category: 'other', tags: [], source: 'fixture', confidence: 1 },
  jobFields: {},
  customerTurnIndex: 1,
  intakeLatency: 12,
});
assert.equal(persistedSql.some((query) => query.includes('eula_store_objects') || query.includes('travel-summary')), false);

const tripId = randomUUID();
const customerId = randomUUID();
const turnPreId = randomUUID();
const turnRevId = randomUUID();
const reqRevId = randomUUID();
const replyRevId = randomUUID();
const token = () => randomUUID().slice(0, 8);
const decoyWhere = `Decoy-Where-${token()}`;
const decoyTitle = `Decoy-Title-${token()}`;
const decoyRoster = `Decoy-Person-${token()}`;
const capabilities = tripStateCapabilities({
  env: {},
  trip: { id: tripId, customer_id: customerId, status: 'planning', metadata: { intakeShare: true, trip_state_actions: true } },
  backing: 'intake',
  grant: 'owner',
  locked: false,
  read: 'current',
  serviceAvailable: true,
  emailHeld: true,
});

const revisionState = {
  version: '1.0',
  trip_id: tripId,
  updated_turn: 4,
  revision: 3,
  phase: 'shipped',
  scope: { mode: 'full', omitted: {} },
  capabilities,
  saved: {
    site_revision: `site-${token()}`,
    read: 'current',
    trip: {
      title: `Orlando Family Revision ${token()}`,
      destination: `Orlando ${token()}`,
      start: '2027-04-05',
      end: '2027-04-07',
      via: 'intake',
      turn: 2,
    },
    days: {
      d2: {
        date: '2027-04-06',
        assigned: [
          {
            id: 'a-cust-exact',
            item: 'it-mk',
            type: 'park',
            role: 'visit',
            time: { value: '09:15', precision: 'exact' },
            proposed_by: 'customer',
            via: 'chat_action',
            turn: 4,
          },
          {
            id: 'a-sys-prop',
            item: 'it-lunch',
            type: 'meal',
            role: 'visit',
            time: { value: '12:30', precision: 'proposed' },
            proposed_by: 'system',
            via: 'chat_action',
            turn: 4,
          },
        ],
        via: 'intake',
        turn: 2,
      },
      d1: {
        date: '2027-04-05',
        assigned: [
          {
            id: 'a-checkin',
            item: 'it-hotel',
            type: 'hotel',
            role: 'check_in',
            time: { value: 'late afternoon', precision: 'window' },
            proposed_by: 'customer',
            via: 'chat_action',
            turn: 4,
          },
        ],
        via: 'intake',
        turn: 2,
      },
    },
    items: {
      'it-hotel': { title: `Lake Buena Vista Stay ${token()}`, type: 'hotel', basis: 'placeholder', proposed_by: 'customer', via: 'customer_named', turn: 4 },
      'it-mk': { title: `Magic Kingdom ${token()}`, type: 'park', basis: 'named', proposed_by: 'customer', via: 'customer_named', turn: 4 },
      'it-lunch': { title: `Early Lunch ${token()}`, type: 'meal', basis: 'plan_block', proposed_by: 'system', via: 'chat_action', turn: 4 },
      'it-unassigned': { title: `Water Park Backup ${token()}`, type: 'activity', basis: 'named', proposed_by: 'customer', via: 'customer_named', turn: 4 },
    },
    unassigned: ['it-unassigned'],
    lodging: { 'it-hotel': { check_in: 'd1', check_out: 'd2', via: 'chat_action', turn: 4 } },
    flights: {},
    ground: {},
    travelers: {
      'tr-self': { name: `Sofia ${token()}`, relation: 'self', age: null, via: 'intake', turn: 2 },
      'tr-spouse': { name: `Mateo ${token()}`, relation: 'husband', age: null, via: 'intake', turn: 4 },
      'tr-kid': { name: null, relation: 'child', age: '6', via: 'intake', turn: 2 },
    },
    collaborators: {},
    invites: {
      'inv-mateo': { name: `Mateo ${token()}`, access: 'edit', status: 'held', via: 'chat_action', turn: 4 },
    },
  },
  disclosed: {
    party1: { kind: 'party', value: `My husband and our 6-year-old ${token()}`, turn: 2 },
    budget1: { kind: 'budget', value: `Mid-range ${token()}`, turn: 2 },
  },
  candidates: {},
  research: { key: null, state: 'waiting', turn: 2, areas: [], gaps: [] },
  proposals: {},
  open_asks: [
    { id: 'ask-1', text: `Confirm pool hours before booking ${token()}`, first_turn: 4, status: 'open', outcome: null, turn: 4, refs: ['it-hotel'] },
    { id: 'ask-2', text: `Share home airport for flight comparison ${token()}`, first_turn: 4, status: 'needs_info', outcome: null, turn: 4, refs: [] },
  ],
  answered: [],
  said: [],
  last_actions: [],
  tool_status: [],
  next_steps: [
    { kind: 'ask', task: `Confirm whether proposed lunch time works ${token()}`, refs: ['a-sys-prop'] },
    { kind: 'answer', task: `Explain held edit invite before sending ${token()}`, refs: ['inv-mateo'] },
  ],
  updates: [{ section: 'saved', source: 'site_read', turn: 4 }],
};
assert.equal(validate(revisionState), true, ajv.errorsText(validate.errors));

const raw = new PGlite({ extensions: { pgcrypto } });
const db = async (parts, ...params) => {
  const statement = parts.reduce((out, part, index) => index ? `${out}$${index}${part}` : part, '');
  return (await raw.query(statement, params)).rows;
};

const stateDir = await mkdtemp(path.join(os.tmpdir(), 'vk-travel-summary-1229-'));
class FailOnFiveFieldReadStore extends LocalVkAdminStore {
  async listJson(prefix) {
    if (String(prefix).includes('travel-summary')) throw new Error(`5-field snapshot path read forbidden: ${prefix}`);
    return super.listJson(prefix);
  }
  async getJson(key) {
    if (String(key).includes('travel-summary')) throw new Error(`5-field snapshot key read forbidden: ${key}`);
    return super.getJson(key);
  }
}
const poisonedStore = new FailOnFiveFieldReadStore(stateDir);
await poisonedStore.putJson(`artifacts/${tripId}/travel-summary/${turnPreId}.json`, {
  version: 2, turnId: turnPreId, where: decoyWhere, who: decoyRoster, transport: 'Decoy', tripName: decoyTitle, description: 'Decoy',
});
await poisonedStore.putJson(`artifacts/${tripId}/travel-summary/${turnRevId}.json`, {
  version: 2, turnId: turnRevId, where: decoyWhere, who: decoyRoster, transport: 'Decoy', tripName: decoyTitle, description: 'Decoy',
});

const rulesFixture = [{ purpose: 'reply_draft', sections: [{ title: 'State rules', text: `Exact rule ${token()}` }] }];
const revisionBytes = JSON.stringify(revisionState);
const revisionDigest = createHash('sha256').update(revisionBytes).digest('hex');

process.env.VK_ADMIN_LOGIN = randomUUID();
process.env.VK_ADMIN_SESSION_SECRET = randomUUID();

const chromium = loadVkAdminPlaywright().chromium;
const browser = await chromium.launch();
let server;
try {
  await raw.exec(readText('../db/migrations/001_vacation_mvp.sql'));
  await raw.exec(readText('../db/migrations/003_trip_things_source.sql'));
  await raw.exec(readText('../db/migrations/010_vacation_trip_state_actions.sql'));
  await raw.exec(readText('../db/migrations/011_vacation_trip_state_revisions.sql'));

  await db`
    insert into customers (id, email, display_name)
    values (${customerId}, 'revision-1229@gmail.com', 'Revision 1229 Account')
  `;
  await db`
    insert into trips (id, customer_id, title, destination, start_date, end_date, status, metadata)
    values (
      ${tripId}, ${customerId}, ${decoyTitle}, ${decoyWhere}, '2027-04-05', '2027-04-07', 'planning',
      ${{ intakeShare: true, trip_state_actions: true }}
    )
  `;
  await db`
    insert into transcript_turns (id, customer_id, trip_id, speaker, channel, body, payload, direction, received_at)
    values (
      ${turnPreId}, ${customerId}, ${tripId}, 'customer', 'vacation-app', 'Before trip state turn',
      ${{ liveTranscript: { turnIndex: 2 }, destination: decoyWhere, roster: [{ name: decoyRoster, role: 'owner' }] }},
      'inbound', '2026-11-26T18:00:00Z'
    )
  `;
  await db`
    insert into vacation_requests (id, customer_id, trip_id, source, request_type, request_text, status)
    values (${reqRevId}, ${customerId}, ${tripId}, 'vacation-app', 'trip_intake', 'Turn with trip state', 'completed')
  `;
  await db`
    insert into transcript_turns (id, customer_id, trip_id, request_id, speaker, channel, body, payload, direction, received_at)
    values (
      ${turnRevId}, ${customerId}, ${tripId}, ${reqRevId}, 'customer', 'vacation-app', 'Turn with trip state',
      ${{ liveTranscript: { turnIndex: 4 }, destination: decoyWhere, roster: [{ name: decoyRoster, role: 'owner' }] }},
      'inbound', '2026-11-26T19:00:00Z'
    )
  `;
  await db`
    insert into transcript_turns (id, customer_id, trip_id, request_id, speaker, channel, body, payload, direction, sent_at)
    values (
      ${replyRevId}, ${customerId}, ${tripId}, ${reqRevId}, 'app', 'vacation-app', 'App reply',
      ${{ modelRules: rulesFixture }},
      'outbound', '2026-11-26T19:01:00Z'
    )
  `;
  await db`
    insert into vacation_trip_state_revisions
      (trip_id, revision, request_id, turn, phase, schema_version, digest, state_json, shipped_reply_id)
    values (
      ${tripId}, ${revisionState.revision}, ${reqRevId}, ${revisionState.updated_turn}, ${revisionState.phase},
      ${revisionState.version}, ${revisionDigest}, ${revisionBytes}, ${replyRevId}
    )
  `;

  server = await startVkAdminLocalServer({ adminDatabase: () => db, adminStore: () => poisonedStore });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  assert.ok((await page.request.post(`${server.base}/api/admin/session`, { data: { login: process.env.VK_ADMIN_LOGIN } })).ok());

  const apiRes = await page.request.get(`${server.base}/api/admin/customers/${tripId}/artifacts/travel-summary`);
  assert.equal(apiRes.status(), 200);
  const apiBody = await apiRes.json();
  assert.equal(apiBody.snapshots.length, 2);
  assert.equal(apiBody.snapshots[0].tripState, null);
  assert.equal(apiBody.snapshots[1].tripState.revision, revisionState.revision);
  assert.equal(apiBody.snapshots[1].tripState.digest, revisionDigest);

  await page.goto(`${server.base}/vacation-app/admin`);
  await page.getByRole('button', { name: 'Open Revision 1229 Account', exact: true }).click();
  await page.locator('#tripButton').click();
  await page.getByRole('option', { name: 'Travel Summary', exact: true }).click();
  await page.locator('[data-travel-revision]').waitFor();

  const readRenderedRevision = () => page.locator('.admin-travel').evaluate((view) => {
    const rev = view.querySelector('[data-travel-revision]');
    const pane = view.closest('.admin-view-panel');
    const overflow = [pane, view, rev, ...rev.querySelectorAll('header, h1, h2, h3, dl, dt, dd, ul, li, span, code, p')]
      .map((node) => {
        const bounds = node.getBoundingClientRect();
        return bounds.width > 0 && bounds.left >= 0 && bounds.right <= innerWidth && node.scrollWidth <= node.clientWidth + 1
          ? null : [node.tagName, bounds.left, bounds.right, node.scrollWidth, node.clientWidth];
      }).filter(Boolean);
    return {
      text: view.textContent,
      overflow,
      revision: rev.querySelector('[data-revision-number]').textContent,
      phase: rev.querySelector('[data-revision-phase]').textContent,
      read: rev.querySelector('[data-revision-read]').textContent,
      siteRevision: rev.querySelector('[data-revision-site-revision]').textContent,
      title: rev.querySelector('[data-revision-trip-title]').textContent,
      destination: rev.querySelector('[data-revision-trip-destination]').textContent,
      start: rev.querySelector('[data-revision-trip-start]').textContent,
      end: rev.querySelector('[data-revision-trip-end]').textContent,
      days: [...rev.querySelectorAll('[data-revision-day]')].map((dayEl) => ({
        id: dayEl.dataset.revisionDay,
        date: dayEl.querySelector('[data-revision-day-heading]').textContent,
        assigned: [...dayEl.querySelectorAll('[data-revision-assignment]')].map((rowEl) => ({
          id: rowEl.dataset.revisionAssignment,
          item: rowEl.dataset.revisionItem,
          title: rowEl.querySelector('[data-revision-assignment-title]').textContent,
          role: rowEl.querySelector('[data-revision-assignment-role]').textContent,
          proposedBy: rowEl.querySelector('[data-revision-proposed-by-label]').textContent,
          timeValue: rowEl.querySelector('[data-revision-time-value]')?.textContent ?? null,
          timePrecision: rowEl.querySelector('[data-revision-time-precision-label]')?.textContent ?? null,
        })),
      })),
      unassigned: [...rev.querySelectorAll('[data-revision-unassigned-item]')].map((el) => ({
        id: el.dataset.revisionUnassignedItem,
        title: el.querySelector('[data-revision-unassigned-title]').textContent,
        type: el.querySelector('[data-revision-unassigned-type]')?.textContent ?? null,
      })),
      travelers: [...rev.querySelectorAll('[data-revision-traveler]')].map((el) => ({
        id: el.dataset.revisionTraveler,
        name: el.querySelector('[data-revision-traveler-name]')?.textContent ?? null,
        relation: el.querySelector('[data-revision-traveler-relation]')?.textContent ?? null,
        age: el.querySelector('[data-revision-traveler-age]')?.textContent ?? null,
      })),
      disclosed: [...rev.querySelectorAll('[data-revision-disclosed]')].map((el) => ({
        id: el.dataset.revisionDisclosed,
        value: el.matches('[data-revision-disclosed-value]')
          ? el.textContent
          : el.querySelector('[data-revision-disclosed-value]').textContent,
      })),
      invites: [...rev.querySelectorAll('[data-revision-invite]')].map((el) => ({
        id: el.dataset.revisionInvite,
        name: el.querySelector('[data-revision-invite-name]')?.textContent ?? null,
        access: el.querySelector('[data-revision-invite-access]').textContent,
        status: el.querySelector('[data-revision-invite-status]').textContent,
      })),
      openAsks: [...rev.querySelectorAll('[data-revision-open-ask]')].map((el) => ({
        id: el.dataset.revisionOpenAsk,
        text: el.querySelector('[data-revision-ask-text]').textContent,
        status: el.querySelector('[data-revision-ask-status-label]').textContent,
      })),
      nextSteps: [...rev.querySelectorAll('[data-revision-next-step]')].map((el) => ({
        kind: el.querySelector('[data-revision-step-kind-label]').textContent,
        task: el.querySelector('[data-revision-step-task]').textContent,
      })),
    };
  });

  const assertExactBytes = (actual, expected, label) => {
    assert.deepEqual(Buffer.from(String(actual ?? '')), Buffer.from(String(expected ?? '')), label);
  };

  const rendered = await readRenderedRevision();
  assert.deepEqual(rendered.overflow, [], '390 px revision view must not overflow');
  assert.equal(rendered.text.includes(decoyWhere), false, 'decoy destination must not leak');
  assert.equal(rendered.text.includes(decoyTitle), false, 'decoy title must not leak');
  assert.equal(rendered.text.includes(decoyRoster), false, 'decoy roster must not leak');

  assertExactBytes(rendered.revision, revisionState.revision, 'revision number');
  assertExactBytes(rendered.phase, revisionState.phase, 'phase');
  assertExactBytes(rendered.read, revisionState.saved.read, 'saved.read');
  assertExactBytes(rendered.siteRevision, revisionState.saved.site_revision, 'site_revision');
  assertExactBytes(rendered.title, revisionState.saved.trip.title, 'saved.trip.title');
  assertExactBytes(rendered.destination, revisionState.saved.trip.destination, 'saved.trip.destination');
  assertExactBytes(rendered.start, revisionState.saved.trip.start, 'saved.trip.start');
  assertExactBytes(rendered.end, revisionState.saved.trip.end, 'saved.trip.end');

  const expectedDays = Object.entries(revisionState.saved.days)
    .sort(([, a], [, b]) => a.date.localeCompare(b.date))
    .map(([id, day]) => ({
      id,
      date: day.date,
      assigned: day.assigned.map((row) => ({
        id: row.id,
        item: row.item,
        title: revisionState.saved.items[row.item].title,
        role: row.role,
        proposedBy: row.proposed_by,
        timeValue: row.time?.value ?? null,
        timePrecision: row.time?.precision ?? null,
      })),
    }));
  assert.deepEqual(rendered.days, expectedDays, 'saved days/assignments must match revision byte-for-byte');
  assert.deepEqual(rendered.unassigned, [{
    id: 'it-unassigned',
    title: revisionState.saved.items['it-unassigned'].title,
    type: revisionState.saved.items['it-unassigned'].type,
  }]);
  assert.deepEqual(rendered.travelers, Object.entries(revisionState.saved.travelers).map(([id, t]) => ({
    id, name: t.name, relation: t.relation, age: t.age,
  })));
  assert.deepEqual(rendered.disclosed, Object.entries(revisionState.disclosed).map(([id, f]) => ({
    id, value: f.value,
  })));
  assert.deepEqual(rendered.invites, Object.entries(revisionState.saved.invites).map(([id, inv]) => ({
    id, name: inv.name, access: inv.access, status: inv.status,
  })));
  assert.deepEqual(rendered.openAsks, revisionState.open_asks.map(({ id, text, status }) => ({ id, text, status })));
  assert.deepEqual(rendered.nextSteps, revisionState.next_steps.map(({ kind, task }) => ({ kind, task })));

  assert.equal(await page.getByRole('region', { name: 'What the assistant can do' }).count(), 1);
  const rulesToggle = page.getByRole('region', { name: 'Model rules' }).locator('summary');
  await rulesToggle.tap();
  assertExactBytes(await page.locator('.admin-travel-rule-text').textContent(), rulesFixture[0].sections[0].text, 'model rules verbatim');

  await page.locator('[data-revision-assignment-title]').first().evaluate((el) => { el.textContent = 'Tampered'; });
  const tampered = await readRenderedRevision();
  assert.notDeepEqual(tampered.days, expectedDays);

  await page.getByRole('button', { name: 'Previous turn' }).tap();
  const emptyNotice = page.locator('[data-travel-no-trip-state="1"]');
  await emptyNotice.waitFor();
  assertExactBytes(await emptyNotice.textContent(), 'No vacation state was stored for this turn.', 'explicit pre-Trip-State empty state');
  assert.equal(await page.locator('[data-travel-revision]').count(), 0);
  const preText = await page.locator('.admin-travel').textContent();
  assert.equal(preText.includes(decoyWhere), false, 'no fallback destination on pre-Trip-State turn');
  assert.equal(preText.includes(decoyTitle), false, 'no fallback title on pre-Trip-State turn');
  assert.equal(preText.includes(decoyRoster), false, 'no fallback roster on pre-Trip-State turn');
  assert.equal(await page.getByRole('region', { name: 'What the assistant can do' }).count(), 1);
  assert.equal(await page.getByRole('region', { name: 'Model rules' }).count(), 1);

  await db`drop table vacation_trip_state_revisions`;
  const missingTableRes = await page.request.get(`${server.base}/api/admin/customers/${tripId}/artifacts/travel-summary`);
  assert.equal(missingTableRes.status(), 200);
  const missingTableBody = await missingTableRes.json();
  assert.deepEqual(missingTableBody.snapshots.map((s) => s.tripState), [null, null]);

  await assert.rejects(() => poisonedStore.listJson(`artifacts/${tripId}/travel-summary`), /5-field snapshot path read forbidden/);
} finally {
  await browser.close();
  if (server) await server.close();
  await raw.close();
  await rm(stateDir, { recursive: true, force: true });
}

console.log('PASS VK admin Travel Summary Trip State revision projection (#1229)');
