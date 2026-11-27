import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { buildTripStateChatCall, pinTripStateContext } from '../src/vacation/trip-state-model-context.mjs';
import { prepareProactiveTripState } from '../src/vacation/trip-state-proactive.mjs';
import { persistVacationAppCustomerTurn } from '../src/vacation/vacation-app-queue-persist.mjs';
import { useNominatimStore } from '../src/vacation/nominatim-store.mjs';
import { LocalVkAdminStore } from '../src/vacation/vk-admin-review-storage.mjs';
import { customerSection, severityOf } from './harness/findings.mjs';
import { measureInitialBuild } from './harness/initial-build.mjs';
import { provisionThrowaway } from './harness/live-provision.mjs';
import { buildScorecard } from './harness/scorecard.mjs';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';
import { loadVkAdminPlaywright } from './qa/vk-admin-playwright.mjs';

const raw = new PGlite({ extensions: { pgcrypto } });
const db = async (parts, ...params) => (await raw.query(parts.reduce((sql, part, index) => index ? `${sql}$${index}${part}` : part, ''), params)).rows;
const pool = { async connect() { return { query: raw.query.bind(raw), release() {} }; } };
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-build-timing-'));
const story = {
  story_id: 'vk-001', reply_backend: 'trip_state', destination: 'Orlando',
  dates: { start: '2027-04-05', end: '2027-04-09' }, customer: { name: 'Synthetic Setup', email_alias: 'synthetic-setup' },
};
const env = { TIMESYNCHER_TRAVEL_BASE_URL: 'https://vacation.example', VK_SEARCH_WAKE_URL: 'https://vk-search.test/wake' };
const blurb = 'My sister and I are going to Orlando April 5–9, 2027. We want Cuban food, jazz bars, outdoor concerts, gardens, and a boutique hotel.';
const classification = {
  ok: true, destination: 'Orlando', hasDates: true, startDate: '2027-04-05', endDate: '2027-04-09',
  planningParty: 'My sister and I',
  planningWants: [
    { category: 'restaurant', value: 'Cuban food' }, { category: 'bar', value: 'jazz bars' },
    { category: 'event', value: 'outdoor concerts' }, { category: 'park', value: 'gardens' },
    { category: 'hotel', value: 'boutique hotel' },
  ],
};
const places = [
  ['Cuban food', 'restaurant', 'Mango Courtyard'], ['jazz bars', 'restaurant', 'Night Heron Jazz Club'],
  ['outdoor concerts', 'activity', 'Lakefront Music Series'], ['gardens', 'activity', 'Cypress Gardens'],
  ['boutique hotel', 'hotel', 'Palmetto Court Inn'],
];
const queries = [];
const fetchImpl = async (url, init) => {
  assert.equal(String(url), env.VK_SEARCH_WAKE_URL);
  const { place } = JSON.parse(init.body);
  queries.push(place);
  const index = places.findIndex(([term, category]) => place.category === category && place.query.includes(term));
  if (index < 0) return Response.json({ places: [] });
  const [, category, title] = places[index];
  return Response.json({
    places: [{
      externalId: `venue-${index}`, title, category,
      address: `${100 + index} Main Street, Orlando`, lat: 28.54, lng: -81.38,
      url: `https://venue-${index}.example.com`,
    }],
  });
};

useNominatimStore({
  async getCachedGeocode() {
    return [{
      lat: '28.54', lon: '-81.38',
      display_name: 'Orlando, Florida, United States',
      address: { city: 'Orlando', state: 'Florida', country_code: 'us' },
    }];
  },
  async putCachedGeocode() {},
  async runNominatimThrottled() { assert.fail('fixture geocoding must use the cached center'); },
});

async function provision(runId, clearHeader = false) {
  const tag = `harness:${runId}:${story.story_id}`;
  const { tripId, customerId } = await provisionThrowaway(db, story, { tag, runId, outDir, env });
  if (clearHeader) await db`update trips set destination = null, start_date = null, end_date = null where id = ${tripId}`;
  const [trip] = await db`select * from trips where id = ${tripId}`;
  assert.equal(trip.metadata.trip_state_actions, true);
  assert.equal(trip.metadata.replyBackend, 'trip_state');
  return { trip, tripId, customerId, tag };
}

async function send({ trip, tripId, customerId }, turn, text, fields, activeEnv = env, appLatencyMs = null) {
  const { requestId } = await persistVacationAppCustomerTurn(db, {
    transcriptOwnerId: customerId, tripId, queuedJobType: 'vacation_intake', requestText: text,
    payload: { liveTranscript: { turnIndex: turn * 2, latencyMs: 15 * turn } }, customerTurnIndex: turn * 2,
    intakeLatency: 15 * turn,
    turnTag: { category: null, tags: [] }, jobFields: {},
  });
  const revision = await prepareProactiveTripState({
    trip, requestId, turn, actorId: customerId, classification: fields, text,
    firstCustomerStartedMs: Date.now() - 100, env: activeEnv, pool, fetchImpl,
  });
  if (appLatencyMs != null) {
    await db`
      insert into transcript_turns (
        customer_id, trip_id, request_id, speaker, channel, body, payload, direction, sent_at, response_latency_ms
      )
      values (
        ${customerId}, ${tripId}, ${requestId}, 'app', 'vacation-app', ${`Reply for turn ${turn}`},
        ${{ liveTranscript: { turnIndex: turn * 2 + 1, latencyMs: appLatencyMs } }},
        'outbound', now() + (${turn} * interval '1 second'), ${appLatencyMs}
      )
    `;
  }
  return { requestId, revision, state: JSON.parse(revision.state_json) };
}

const checks = ['dialog-pdf', 'keepsake-pdf', 'screens', 'onboarding-screens-in-pdf', 'video-check', 'scorecard',
  'build-sha', 'no-stub-chrome', 'dialog-renderer-ok', 'video-check-pass', 'cleanup', 'itinerary-stored']
  .map((id) => ({ id, pass: true }));
function score(initialBuild) {
  return buildScorecard({
    reply_backend: 'trip_state', story_id: story.story_id, checks, initialBuild,
    started_at: '2027-01-01T00:00:00Z', ended_at: '2027-01-01T00:00:03Z',
    timings: [{ n: 1, customer_ms: 25, wall_ms: 1000 }],
  });
}

try {
  for (const name of ['001_vacation_mvp', '003_trip_things_source', '010_vacation_trip_state_actions', '011_vacation_trip_state_revisions']) {
    await raw.exec(fs.readFileSync(new URL(`../db/migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  const complete = await provision('complete-orlando');
  const { state } = await send(complete, 1, blurb, classification);
  assert.equal(state.updated_turn, 1);
  assert.equal(state.research.state, 'complete');
  assert.equal(queries.length, 5);
  assert.ok(queries.every(({ query }) => query.includes('Orlando') && query.includes('2027-04-05') && query.includes('2027-04-09')));
  assert.ok(Object.values(state.saved.days).every(({ assigned }) => assigned.length > 0));
  const placed = await db`
    select category from trip_things where trip_id = ${complete.tripId}
      and jsonb_array_length(coalesce(metadata->'tripState'->'occurrences', '[]')) > 0
  `;
  const expected = { hotel: 1, park: 1, restaurant: 1, bar: 1, event: 1 };
  assert.deepEqual(placed.map(({ category }) => category).sort(), Object.keys(expected).sort());
  assert.deepEqual(state.research.build.items_by_type, expected);
  assert.ok(state.research.build.started_offset_ms >= 100);
  assert.ok(state.research.build.duration_ms >= 0);
  const measured = await measureInitialBuild(db, complete.tripId, complete.tag);
  const passed = score(measured);
  assert.equal(passed.findings[0].status, 'PASS');
  assert.equal(passed.findings[0].firedByTurn2, true);
  assert.deepEqual(passed.findings[0].itemsByType, expected);
  assert.deepEqual(passed.timing, {
    turns: [{ turnNumber: 1, customerMs: 25, appMs: 1000 }], timeToBuildMs: state.research.build.started_offset_ms,
    buildDurationMs: state.research.build.duration_ms, totalWallMs: 3000,
  });

  const thin = await provision('thin-orlando', true);
  const thinText = 'Can you help plan a vacation?';
  const beforeCount = queries.length;
  const first = await send(thin, 1, thinText, { ok: true }, env, 240);
  assert.equal(queries.length, beforeCount);
  const missing = ['destination', 'dates', 'party', 'interests/wants'];
  assert.deepEqual(first.state.research.gaps, missing);
  assert.equal(first.state.next_steps[0].kind, 'ask');
  assert.deepEqual(first.state.next_steps[0].missing_inputs, missing);
  const call = buildTripStateChatCall({ tripStateContext: pinTripStateContext(first.revision), customerTurn: thinText });
  assert.match(call.messages[0].content.at(-1).text, /Ask one concise question covering exactly the fields in missing_inputs/);
  const trusted = JSON.parse(call.messages[1].content[0].text).trip_state;
  assert.deepEqual(trusted.next_steps[0].missing_inputs, missing);
  assert.equal(trusted.capabilities.actions.save_plan.enabled, true);
  const noBuild = await measureInitialBuild(db, thin.tripId, thin.tag);
  assert.equal(noBuild.turn, null);
  const second = await send(thin, 2, blurb, classification, env, 680);
  assert.equal(second.state.research.turn, 2);
  assert.deepEqual(second.state.research.build.items_by_type, expected);
  assert.equal((await measureInitialBuild(db, thin.tripId, thin.tag)).turn, 2);

  process.env.VK_ADMIN_LOGIN = randomUUID();
  process.env.VK_ADMIN_SESSION_SECRET = randomUUID();
  const adminStore = new LocalVkAdminStore(path.join(outDir, 'admin-store'));
  const server = await startVkAdminLocalServer({ adminDatabase: () => db, adminStore: () => adminStore });
  const browser = await loadVkAdminPlaywright().chromium.launch();
  try {
    for (const viewport of [{ width: 390, height: 844, isMobile: true, hasTouch: true }, { width: 1280, height: 800 }]) {
      const page = await browser.newPage(viewport);
      assert.ok((await page.request.post(`${server.base}/api/admin/session`, { data: { login: process.env.VK_ADMIN_LOGIN } })).ok());
      const res = await page.request.get(`${server.base}/api/admin/customers/${thin.tripId}/artifacts/travel-summary`);
      assert.equal(res.status(), 200);
      const summaryBody = await res.json();
      assert.equal(summaryBody.snapshots.length, 2);
      assert.deepEqual(summaryBody.snapshots[0].conversationState.next_steps[0].missing_inputs, missing);
      assert.deepEqual(summaryBody.snapshots[1].conversationState.research.build.items_by_type, expected);
      assert.equal(summaryBody.timing.buildTurn, 2);
      assert.equal(summaryBody.timing.timeToBuildMs, second.state.research.build.started_offset_ms);
      assert.equal(summaryBody.timing.buildDurationMs, second.state.research.build.duration_ms);
      assert.deepEqual(summaryBody.timing.itemsByType, expected);
      assert.deepEqual(summaryBody.timing.turns, [
        { turnNumber: 1, customerMs: 15, appMs: 240 },
        { turnNumber: 2, customerMs: 30, appMs: 680 },
      ]);
      assert.ok(summaryBody.timing.totalWallMs >= 0);

      await page.goto(`${server.base}/vacation-app/admin`);
      const showTest = page.locator('[data-admin-show-test]');
      await showTest.waitFor();
      if (!(await showTest.isChecked())) await showTest.check();
      await page.getByRole('button', { name: 'Open Synthetic Setup', exact: true }).first().click();
      await page.locator('#tripButton').click();
      await page.getByRole('option', { name: 'Travel Summary', exact: true }).click();
      const conversationRegion = page.getByRole('region', { name: 'Conversation management' });
      await conversationRegion.waitFor();
      assert.equal(await conversationRegion.locator('details').evaluate((el) => el.open), false);
      await conversationRegion.locator('summary').click();
      assert.deepEqual(JSON.parse(await conversationRegion.locator('[data-conversation-json]').textContent()), second.state);

      const timingRegion = page.getByRole('region', { name: 'Timing summary' });
      await timingRegion.waitFor();
      const timingText = await timingRegion.textContent();
      assert.match(timingText, /\(turn 2\)/);
      assert.match(timingText, /hotel 1/);
      assert.match(timingText, /bar 1/);
      assert.match(timingText, /event 1/);
      assert.equal(/\btrip\b/i.test(timingText), false);
      await timingRegion.locator('summary').click();
      const rows = await timingRegion.locator('tbody tr').allTextContents();
      assert.deepEqual(rows.map((row) => row.replace(/\s+/g, ' ').trim()), ['115 ms240 ms', '230 ms680 ms']);

      await page.getByRole('button', { name: 'Previous turn' }).click();
      await conversationRegion.locator('summary').click();
      assert.deepEqual(JSON.parse(await conversationRegion.locator('[data-conversation-json]').textContent()), first.state);

      const overflow = await page.locator('.admin-travel').evaluate((view) => {
        const pane = view.closest('.admin-view-panel');
        return [pane, view, ...view.querySelectorAll('section, dl, dt, dd, details, summary, table, pre')].map((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth && node.scrollWidth <= node.clientWidth + 1
            ? null : [node.tagName, rect.left, rect.right, node.scrollWidth, node.clientWidth];
        }).filter(Boolean);
      });
      assert.deepEqual(overflow, [], `admin travel summary must not overflow at ${viewport.width}px`);
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const empty = await provision('empty-search');
  const { state: emptyState } = await send(empty, 1, blurb, classification, {});
  assert.equal(emptyState.research.provider_unavailable, true);
  const zero = await measureInitialBuild(db, empty.tripId, empty.tag);
  for (const [evidence, detail] of [[noBuild, /No initial build recorded/], [zero, /VK Search was unavailable.*zero placed items/],
    [{ ...measured, turn: 3 }, /customer turn 3/]]) {
    const card = score(evidence);
    assert.equal(card.verdict, 'PASS');
    assert.equal(card.checks.some(({ id }) => id === 'initial-build'), false);
    assert.equal(card.findings[0].status, 'FLAGGED');
    assert.equal(card.findings[0].severity, 'major');
    assert.match(card.findings[0].detail, detail);
    assert.match(customerSection(card, { wave: 'offline' }), /initial-build: FLAGGED \(major\)/);
    assert.equal(severityOf(card), 'major');
  }
  const isolated = await measureInitialBuild(db, randomUUID(), thin.tag);
  assert.equal(isolated, null);
  for (const dir of ['src', 'routes', 'public']) {
    for (const entry of fs.readdirSync(new URL(`../${dir}`, import.meta.url), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.[cm]?js$|\.tsx?$/.test(entry.name)) continue;
      assert.ok(!fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8').includes("'initial-build'"), entry.name);
    }
  }
} finally {
  await raw.close();
  fs.rmSync(outDir, { recursive: true, force: true });
}

console.log('test_vk_initial_build_timing: ok');
