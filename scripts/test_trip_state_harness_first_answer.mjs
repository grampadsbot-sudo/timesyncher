import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { Pool } from '@neondatabase/serverless';
import handler from '../routes/vacation-itinerary.mjs';
import { acceptEulaPersistent } from '../src/onboarding/eula-persistent-core.mjs';
import { createPersistentStoreFromEnv } from '../src/onboarding/eula-persistent-store.mjs';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import { ensureVacationEulaSession } from '../src/vacation/onboarding.mjs';
import { TRIP_STATE_PROACTIVE_PLAN_INSTRUCTION } from '../src/vacation/trip-state-model-context.mjs';
import { installNoopNominatimStore, resetNominatimStore } from './fixtures/nominatim-store-test-double.mjs';
import { measureInitialBuild } from './harness/initial-build.mjs';
import { measureItemStorage, measureStoredItinerary } from './harness/itinerary-evidence.mjs';
import { provisionThrowaway } from './harness/live-provision.mjs';

const raw = new PGlite({ extensions: { pgcrypto } });
const query = raw.query.bind(raw);
const db = async (parts, ...params) => (await query(parts.reduce(
  (sql, part, index) => index ? `${sql}$${index}${part}` : part, '',
), params)).rows;
const outDir = await mkdtemp(join(tmpdir(), 'trip-state-first-answer-'));
const searchUrl = 'https://vk-search.test/wake';
const story = {
  story_id: 'vk-001',
  reply_backend: 'trip_state',
  destination: 'Orlando theme parks, FL',
  dates: { start: '2027-04-05', end: '2027-04-09' },
  customer: { name: 'Synthetic Family', email_alias: 'synthetic-family' },
};
const complete = 'We are going to Orlando theme parks, FL from April 5, 2027 to April 9, 2027. Two parents and kids ages 6 and 9. Our budget is mid-range.';
const thin = 'Can you help plan a vacation?';
const searchQueries = [];
const classifierSchemas = [];
const drafts = [];

async function provision(runId) {
  const tag = `harness:${runId}:${story.story_id}`;
  return { ...await provisionThrowaway(db, story, { tag, runId, outDir, env: process.env }), tag };
}

async function acceptTerms({ token }) {
  const [session] = await db`
    select s.*, c.email, c.display_name
    from onboarding_sessions s join customers c on c.id = s.customer_id
    where s.token = ${token}
  `;
  const { sessionId } = await ensureVacationEulaSession(session);
  await acceptEulaPersistent(createPersistentStoreFromEnv(process.env), sessionId, {
    acceptedByName: story.customer.name, checkboxConfirmed: true,
  });
}

async function postTurn({ token, tripId }, text) {
  const req = {
    method: 'POST',
    url: `/api/vacation-itinerary?app=1&session=${encodeURIComponent(token)}`,
    headers: { host: 'vacation.example', 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ text, tripId })); },
  };
  const res = { setHeader() {}, end(chunk) { this.body = JSON.parse(chunk); } };
  await handler(req, res);
  return { ...res.body, httpStatus: res.statusCode };
}

try {
  for (const migration of [
    '001_vacation_mvp', '003_trip_things_source', '005_vacation_onboarding_welcomes',
    '006_vacation_onboarding_welcomes_session_for_unique', '008_eula_store_objects',
    '010_vacation_trip_state_actions', '011_vacation_trip_state_revisions',
  ]) {
    await raw.exec(await readFile(new URL(`../db/migrations/${migration}.sql`, import.meta.url), 'utf8'));
  }
  Object.assign(process.env, {
    DATABASE_URL: 'postgresql://offline@localhost/trip_state_fixture',
    OPENROUTER_API_KEY: 'offline-test-key',
    TIMESYNCHER_EULA_VERSION: 'offline-trip-state',
    TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
    TIMESYNCHER_SINGLE_NAME: 'TimeSyncher Vacation Single',
    TIMESYNCHER_UNLIMITED_NAME: 'TimeSyncher Vacation Year',
    TIMESYNCHER_ONBOARDING_STORE: outDir,
    TIMESYNCHER_TRAVEL_BASE_URL: 'https://vacation.example',
    TIMESYNCHER_SITE_BASE_URL: 'https://vacation.example',
    VK_SEARCH_WAKE_URL: searchUrl,
    VK_TRIP_STATE_ACTIONS: '0',
    PATH: '/nonexistent',
  });
  useVacationDatabase(db);
  installNoopNominatimStore();
  mock.method(Pool.prototype, 'connect', async () => ({ query, release() {} }));
  mock.method(Pool.prototype, 'end', async () => {});
  mock.method(globalThis, 'fetch', async (url, init) => {
    const href = new URL(url);
    if (href.hostname.startsWith('nominatim.')) {
      return Response.json([{
        lat: '28.42', lon: '-81.57', display_name: 'Walt Disney World, Lake Buena Vista, Florida',
        address: { city: 'Lake Buena Vista', state: 'Florida', country_code: 'us' },
      }]);
    }
    const body = JSON.parse(init.body);
    if (href.href === searchUrl) {
      searchQueries.push(body.place.query);
      return Response.json({ places: [{
        externalId: 'magic-kingdom-park', title: 'Magic Kingdom Park', category: 'activity',
        address: '1180 Seven Seas Drive, Lake Buena Vista, FL', lat: 28.4186, lng: -81.5812,
        url: 'https://disneyworld.disney.go.com/destinations/magic-kingdom/',
      }] });
    }
    if (href.pathname.endsWith('/decisions')) {
      return Response.json({ answers: {
        overall_quality: { score: 5 }, disposition: { choice: 'keep' }, fix_focus: { choice: 'keep' },
        claims_mutation: { noul: 0.01 }, change_claim_grounded: { noul: 0.99 },
        route_type: { choice: 'itinerary_advice' }, needs_day_for_note: { noul: 0.05 },
      } });
    }
    assert.equal(href.pathname, '/api/v1/chat/completions');
    const schema = body.response_format?.json_schema;
    if (schema?.name === 'vacation_turn_understanding') {
      classifierSchemas.push(schema.schema.properties);
      const full = JSON.parse(body.messages.at(-1).content).sentences.join(' ').includes('mid-range');
      const fields = {
        turnKind: full ? 'trip_intake' : 'other', things: [], roster: [],
        intent: { asksPrice: false, asksAccess: false, pullsAccess: false, seats: [], ask: false },
        contentTags: { tags: [], ask: false }, committedSentenceIndexes: [], sendCollaboratorInvite: null,
        ...(full ? {
          destination: 'the theme park city', hasDates: true, startDate: 'April 5', endDate: 'April 9',
          planningParty: 'a family of four',
          planningWants: [{ category: 'park', value: 'attractions suited to their children' }],
        } : { planningParty: '', planningWants: [] }),
      };
      return Response.json({ choices: [{ message: { content: JSON.stringify(fields) } }] });
    }
    drafts.push(body);
    return Response.json({ model: body.model, choices: [{ message: { content: 'Which part of the vacation would you like to review first?' } }] });
  });

  const prior = await provision('replacement');
  const replacement = await provision('replacement');
  assert.notEqual(replacement.tripId, prior.tripId);
  const [storedTrip] = await db`select metadata from trips where id = ${replacement.tripId}`;
  assert.equal(storedTrip.metadata.trip_state_actions, true);
  await acceptTerms(replacement);
  const answer = await postTurn(replacement, complete);
  const stored = await measureStoredItinerary(db, replacement.tripId, replacement.tag);
  assert.equal(stored.itineraryCountSource, 'db');
  assert.ok(stored.itineraryCount > 0, `first answer stored ${stored.itineraryCount} itinerary items (HTTP ${answer.httpStatus}, ${answer.error || 'no error'})`);
  assert.equal(answer.httpStatus, 201, JSON.stringify(answer));
  assert.equal(answer.trip.id, replacement.tripId);
  assert.equal(answer.trip.metadata, undefined);
  const [park] = await db`
    select metadata from trip_things where trip_id = ${replacement.tripId} and title = 'Magic Kingdom Park'
  `;
  assert.ok(park?.metadata?.tripState?.occurrences?.length);
  assert.equal((await measureItemStorage(db, replacement.tripId, replacement.tag)).storagePath, 'trip_state');
  assert.equal((await measureInitialBuild(db, replacement.tripId, replacement.tag)).turn, 1);
  const [shipped] = await db`
    select shipped_reply_id from vacation_trip_state_revisions
    where trip_id = ${replacement.tripId} and phase = 'shipped'
  `;
  assert.ok(shipped?.shipped_reply_id);
  assert.ok(classifierSchemas[0].planningParty && classifierSchemas[0].planningWants);
  assert.ok(searchQueries.some((queryText) => /theme parks.*6.*9.*mid-range/i.test(queryText)));
  assert.ok(drafts.some(({ messages }) => JSON.stringify(messages).includes(TRIP_STATE_PROACTIVE_PLAN_INSTRUCTION)));

  const incomplete = await provision('incomplete');
  await acceptTerms(incomplete);
  const searchesBeforeQuestion = searchQueries.length;
  assert.equal((await postTurn(incomplete, thin)).httpStatus, 201);
  assert.equal(searchQueries.length, searchesBeforeQuestion);
  assert.equal((await measureStoredItinerary(db, incomplete.tripId, incomplete.tag)).itineraryCount, 0);
  assert.equal((await measureInitialBuild(db, incomplete.tripId, incomplete.tag)).turn, null);

  const disabled = await provision('disabled');
  await acceptTerms(disabled);
  await db`update trips set metadata = metadata - 'trip_state_actions' where id = ${disabled.tripId}`;
  const callsBeforeDisabled = classifierSchemas.length + searchQueries.length + drafts.length;
  const refused = await postTurn(disabled, complete);
  assert.equal(refused.httpStatus, 502);
  assert.equal(refused.error, 'trip_state_actions_unavailable');

  await db`update trips set metadata = metadata - 'replyBackend' where id = ${disabled.tripId}`;
  const sessionRefused = await postTurn(disabled, complete);
  assert.equal(sessionRefused.httpStatus, 502);
  assert.equal(sessionRefused.error, 'trip_state_actions_unavailable');
  assert.equal(classifierSchemas.length + searchQueries.length + drafts.length, callsBeforeDisabled);
  assert.equal((await measureStoredItinerary(db, disabled.tripId, disabled.tag)).itineraryCount, 0);
  console.log(`First complete answer stored ${stored.itineraryCount} Trip State itinerary item(s). Thin question stored 0.`);
} finally {
  mock.restoreAll();
  resetNominatimStore();
  useVacationDatabase(null);
  await raw.close();
  await rm(outDir, { recursive: true, force: true });
}

console.log('Trip State harness first-answer route regression passed.');
