#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createPersistentStoreFromEnv } from '../src/onboarding/eula-persistent-store.mjs';
import {
  liveReplyCommerceGate,
  seatForSessionTrip,
  sessionWithTripSeat,
} from '../src/vacation/collaborator-app-seat.mjs';
import {
  personEulaKey,
  vacationAppEulaForCollaboratorSeat,
} from '../src/vacation/collaborator-eula-accept.mjs';
import { sharedTripEditAccessFromRequest, webAccessCookieName } from '../src/vacation/web-access.mjs';
import { createRelationalMemoryDb } from './fixtures/collaborator-auto-dropdown-1096-db.mjs';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_BLOB_STORE_ID;

const storeDir = await mkdtemp(path.join(tmpdir(), 'collab-1096-'));
process.env.TIMESYNCHER_ONBOARDING_STORE = storeDir;
process.env.TIMESYNCHER_EULA_STORE = '';
process.env.TIMESYNCHER_SITE_BASE_URL = 'https://vacation-staging.timesyncher.com';
process.env.TIMESYNCHER_TRAVEL_BASE_URL = 'https://vacation-staging.timesyncher.com';
process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT = 'test-1096-salt';
process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS = '2500';
process.env.TIMESYNCHER_COLLABORATOR_NAME = 'Collaborator seat';
process.env.TIMESYNCHER_EULA_VERSION = '2026-06-terms-advisory-only';

const { default: handler } = await import('../api/[...route].mjs');
const { useOnboardingLookup } = await import('../routes/eula.mjs');
const { useVacationAppDatabase } = await import('../routes/vacation-itinerary.mjs');

function mockRes() {
  return {
    statusCode: 0,
    body: '',
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(payload) { this.body = String(payload ?? ''); },
  };
}

function makeCaller() {
  return async function call(method, url, json = null, extraHeaders = {}) {
    const res = mockRes();
    const req = {
      method,
      url,
      headers: { 'user-agent': 'test-1096', ...extraHeaders },
      socket: { remoteAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() {
        if (json) yield Buffer.from(JSON.stringify(json));
      },
    };
    await handler(req, res);
    return res;
  };
}

function cookiePair(setCookieHeader) {
  const first = String(setCookieHeader || '').split(';')[0];
  assert.ok(first.startsWith(`${webAccessCookieName()}=`), `expected cookie header, got: ${setCookieHeader}`);
  return first;
}

const { db, state } = createRelationalMemoryDb();
useOnboardingLookup(db);
useVacationAppDatabase(db);
const call = makeCaller();

const ownerId = crypto.randomUUID();
const morganId = crypto.randomUUID();
const jordanId = crypto.randomUUID();
const soloId = crypto.randomUUID();
const trip1Id = crypto.randomUUID();
const trip2Id = crypto.randomUUID();
const trip3Id = crypto.randomUUID();
const morganTripId = crypto.randomUUID();
const jordanTripId = crypto.randomUUID();
const soloTrip1Id = crypto.randomUUID();
const soloTrip2Id = crypto.randomUUID();

state.customers.push(
  { id: ownerId, email: 'owner-ada@example.test', first_name: 'Ada', last_name: 'Owner', display_name: 'Owner Ada' },
  { id: morganId, email: 'morgan@example.test', first_name: 'Morgan', last_name: 'Reid', display_name: 'Morgan Reid' },
  { id: jordanId, email: 'jordan@example.test', first_name: 'Jordan', last_name: 'Lee', display_name: 'Jordan Lee' },
  { id: soloId, email: 'solo@example.test', first_name: 'Solo', last_name: 'Owner', display_name: 'Solo Owner' },
);
state.trips.push(
  { id: trip1Id, customer_id: ownerId, title: 'Harbor Week', destination: 'Monterey', start_date: '2026-08-01', end_date: '2026-08-05', status: 'planning', metadata: { publicSlug: 'harbor-week-1096', shareToken: 'harbor-week-1096', publicUrl: 'https://vacation-staging.timesyncher.com/shared/harbor-week-1096/' } },
  { id: trip2Id, customer_id: ownerId, title: 'Coastal Escape', destination: 'Big Sur', start_date: '2026-09-10', end_date: '2026-09-14', status: 'planning', metadata: { publicSlug: 'coastal-escape-1096', shareToken: 'coastal-escape-1096', publicUrl: 'https://vacation-staging.timesyncher.com/shared/coastal-escape-1096/' } },
  { id: trip3Id, customer_id: ownerId, title: 'Unseated Alpine', destination: 'Tahoe', start_date: '2026-10-01', end_date: '2026-10-04', status: 'planning', metadata: { publicSlug: 'unseated-alpine-1096', shareToken: 'unseated-alpine-1096', publicUrl: 'https://vacation-staging.timesyncher.com/shared/unseated-alpine-1096/' } },
  { id: morganTripId, customer_id: morganId, title: 'Morgan Own Vacation', destination: 'Carmel', start_date: '2026-07-01', end_date: '2026-07-04', status: 'planning', metadata: { publicSlug: 'morgan-own-1096', shareToken: 'morgan-own-1096', publicUrl: 'https://vacation-staging.timesyncher.com/shared/morgan-own-1096/' } },
  { id: jordanTripId, customer_id: jordanId, title: 'Jordan Own Vacation', destination: 'Napa', start_date: '2026-07-10', end_date: '2026-07-12', status: 'planning', metadata: {} },
  { id: soloTrip1Id, customer_id: soloId, title: 'Solo One', destination: 'Sedona', start_date: '2026-08-10', end_date: '2026-08-12', status: 'planning', metadata: {} },
  { id: soloTrip2Id, customer_id: soloId, title: 'Solo Two', destination: 'Austin', start_date: '2026-09-10', end_date: '2026-09-12', status: 'planning', metadata: {} },
);
state.sessions.push(
  { id: crypto.randomUUID(), customer_id: ownerId, trip_id: trip1Id, token: 'owner-tok-1096', status: 'purchase_confirmed', metadata: {} },
  { id: crypto.randomUUID(), customer_id: morganId, trip_id: morganTripId, token: 'morgan-tok-1096', status: 'purchase_confirmed', metadata: {} },
  { id: crypto.randomUUID(), customer_id: jordanId, trip_id: jordanTripId, token: 'jordan-tok-1096', status: 'purchase_confirmed', metadata: {} },
  { id: crypto.randomUUID(), customer_id: soloId, trip_id: soloTrip1Id, token: 'solo-tok-1096', status: 'purchase_confirmed', metadata: {} },
);

try {
  const morganInitial = JSON.parse((await call('GET', '/api/vacation-itinerary?app=1&session=morgan-tok-1096')).body);
  assert.equal(morganInitial.eula.accepted, false);
  const morganAccept = await call('POST', `/api/eula?action=accept&sessionId=${encodeURIComponent(morganInitial.eula.sessionId)}`, {
    acceptedByName: 'Morgan Reid',
    checkboxConfirmed: true,
  });
  assert.equal(morganAccept.statusCode, 201, morganAccept.body);

  const inv1Res = await call('POST', '/api/vacation-itinerary?app=1&session=owner-tok-1096', {
    action: 'collaborator-invite',
    tripId: trip1Id,
    name: 'Morgan Reid',
    email: 'morgan@example.test',
  });
  assert.equal(inv1Res.statusCode, 200, inv1Res.body);
  const inv1Body = JSON.parse(inv1Res.body);
  assert.equal(inv1Body.inviteResult.code, 'collaborator_seat_activated');
  assert.equal(inv1Body.inviteResult.emailStatus, 'skipped_existing_customer');
  assert.equal(state.outboundEmails.length, 0);

  const morganAfter1 = JSON.parse((await call('GET', '/api/vacation-itinerary?app=1&session=morgan-tok-1096')).body);
  assert.equal(morganAfter1.eula.accepted, true);
  assert.equal(morganAfter1.session.token, 'morgan-tok-1096');
  assert.deepEqual(
    morganAfter1.vacations.map((v) => `${v.id}:${v.role}`).sort(),
    [`${morganTripId}:owner`, `${trip1Id}:collaborator`].sort(),
  );

  const inv2Res = await call('POST', '/api/vacation-itinerary?app=1&session=owner-tok-1096', {
    action: 'collaborator-invite',
    tripId: trip2Id,
    name: 'Morgan Reid',
    email: 'morgan@example.test',
  });
  assert.equal(inv2Res.statusCode, 200, inv2Res.body);
  assert.equal(state.outboundEmails.length, 0);

  const newPersonRes = await call('POST', '/api/vacation-itinerary?app=1&session=owner-tok-1096', {
    action: 'collaborator-invite',
    tripId: trip1Id,
    name: 'Casey New',
    email: 'casey-new@example.test',
  });
  assert.equal(newPersonRes.statusCode, 200, newPersonRes.body);
  assert.equal(JSON.parse(newPersonRes.body).inviteResult.code, 'collaborator_invite_sent');
  assert.equal(state.outboundEmails.length, 1);

  const seatSessions = state.sessions.filter((s) => s.customer_id === morganId && s.metadata?.seat);
  assert.equal(seatSessions.length, 2);
  const [seat1Token, seat2Token] = seatSessions.map((s) => s.token);
  const expectedThree = [`${morganTripId}:owner`, `${trip1Id}:collaborator`, `${trip2Id}:collaborator`].sort();
  for (const tok of ['morgan-tok-1096', seat1Token, seat2Token]) {
    const res = await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(tok)}`);
    assert.equal(res.statusCode, 200, res.body);
    const data = JSON.parse(res.body);
    assert.deepEqual(data.vacations.map((v) => `${v.id}:${v.role}`).sort(), expectedThree);
    assert.equal(data.eula.accepted, true);
    assert.equal(data.session.token, tok);
  }

  const openTrip1 = await call('GET', `/api/vacation-itinerary?app=1&session=morgan-tok-1096&tripId=${trip1Id}`);
  assert.equal(openTrip1.statusCode, 200, openTrip1.body);
  const openTrip1Data = JSON.parse(openTrip1.body);
  assert.equal(openTrip1Data.session.token, 'morgan-tok-1096');
  assert.equal(openTrip1Data.session.seat?.displayName, 'Morgan Reid');
  const trip1Cookie = cookiePair(openTrip1.headers['set-cookie']);

  const canEdit1 = await call('POST', '/api/vacation-itinerary?webAccess=1', { action: 'assert_can_edit', tripId: trip1Id }, { cookie: trip1Cookie });
  assert.equal(canEdit1.statusCode, 200, canEdit1.body);

  const openOwnFromSeat = await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(seat1Token)}&tripId=${morganTripId}`);
  assert.equal(openOwnFromSeat.statusCode, 200, openOwnFromSeat.body);
  assert.equal(JSON.parse(openOwnFromSeat.body).session.seat, null);

  assert.equal((await call('GET', `/api/vacation-itinerary?app=1&session=morgan-tok-1096&tripId=${trip3Id}`)).statusCode, 403);
  assert.equal((await call('POST', '/api/vacation-itinerary?app=1&session=morgan-tok-1096', { tripId: trip3Id, text: 'hello' })).statusCode, 403);
  assert.equal((await call('POST', '/api/vacation-itinerary?webAccess=1', { action: 'assert_can_edit', tripId: trip3Id }, { cookie: trip1Cookie })).statusCode, 403);
  assert.equal((await call('POST', '/api/vacation-itinerary?app=1&session=morgan-tok-1096', { action: 'collaborator-invite', tripId: trip1Id, name: 'X', email: 'x@example.test' })).statusCode, 403);
  assert.equal((await call('POST', '/api/vacation-itinerary?app=1&session=morgan-tok-1096', { action: 'seat-join', tripId: trip1Id })).statusCode, 201);

  const morganBaseSession = state.sessions.find((s) => s.token === 'morgan-tok-1096');
  const trip2Seat = await seatForSessionTrip(db, morganBaseSession, trip2Id);
  assert.ok(trip2Seat);
  const commerceCollab = liveReplyCommerceGate({
    session: sessionWithTripSeat(morganBaseSession, trip2Seat),
    suppliedSeatDollars: 25,
    customerTurn: 'How much is this?',
    intent: {},
    mergedTrip: { planOwned: true, purchased_plan: 'unlimited' },
    upsellMode: 'allow-once',
    asksPriceFn: () => true,
    payerLineFn: () => '$25',
  });
  assert.equal(commerceCollab.upsell, 'forbidden');
  assert.equal(commerceCollab.collaboratorSeat, true);
  assert.equal(commerceCollab.planLine, '');

  const seat1Session = state.sessions.find((s) => s.token === seat1Token);
  const ownSeatResolved = await seatForSessionTrip(db, seat1Session, morganTripId);
  assert.equal(ownSeatResolved, null);
  const commerceOwn = liveReplyCommerceGate({
    session: sessionWithTripSeat(seat1Session, ownSeatResolved),
    suppliedSeatDollars: 25,
    customerTurn: 'How much is this?',
    intent: {},
    mergedTrip: { planOwned: false, purchased_plan: 'single' },
    upsellMode: 'allow-once',
    asksPriceFn: () => true,
    payerLineFn: () => '$25',
  });
  assert.equal(commerceOwn.collaboratorSeat, false);
  assert.equal(commerceOwn.upsell, 'allow-once');

  state.collaborators.find((vc) => vc.trip_id === trip1Id && vc.metadata?.email === 'morgan@example.test').status = 'revoked';
  const afterRevoke = JSON.parse((await call('GET', '/api/vacation-itinerary?app=1&session=morgan-tok-1096')).body);
  assert.deepEqual(
    afterRevoke.vacations.map((v) => `${v.id}:${v.role}`).sort(),
    [`${morganTripId}:owner`, `${trip2Id}:collaborator`].sort(),
  );
  assert.equal((await call('GET', `/api/vacation-itinerary?app=1&session=morgan-tok-1096&tripId=${trip1Id}`)).statusCode, 403);
  assert.equal((await call('POST', '/api/vacation-itinerary?app=1&session=morgan-tok-1096', { tripId: trip1Id, text: 'hello' })).statusCode, 403);
  assert.equal((await call('POST', '/api/vacation-itinerary?webAccess=1', { action: 'assert_can_edit', tripId: trip1Id }, { cookie: trip1Cookie })).statusCode, 403);
  assert.deepEqual(
    await sharedTripEditAccessFromRequest(db, { headers: { cookie: trip1Cookie } }, { shareToken: 'harbor-week-1096', env: process.env }),
    { canEdit: false },
  );
  assert.equal(await seatForSessionTrip(db, morganBaseSession, trip1Id), null);

  await call('POST', '/api/vacation-itinerary?app=1&session=owner-tok-1096', {
    action: 'collaborator-invite',
    tripId: trip1Id,
    name: 'Jordan Lee',
    email: 'jordan@example.test',
  });
  await call('POST', '/api/vacation-itinerary?app=1&session=owner-tok-1096', {
    action: 'collaborator-invite',
    tripId: trip2Id,
    name: 'Jordan Lee',
    email: 'jordan@example.test',
  });
  const jordanTrip1Load = JSON.parse((await call('GET', `/api/vacation-itinerary?app=1&session=jordan-tok-1096&tripId=${trip1Id}`)).body);
  assert.equal(jordanTrip1Load.eula.accepted, false);
  assert.equal(jordanTrip1Load.eula.version, '2026-06-terms-advisory-only');
  const jordanAccept1 = await call('POST', `/api/eula?action=accept&sessionId=${encodeURIComponent(jordanTrip1Load.eula.sessionId)}`, {
    acceptedByName: 'Jordan Lee',
    checkboxConfirmed: true,
  });
  assert.equal(jordanAccept1.statusCode, 201, jordanAccept1.body);
  const store = createPersistentStoreFromEnv(process.env);
  const storedPerson = await store.getJson(personEulaKey(jordanId));
  assert.equal(storedPerson?.version, '2026-06-terms-advisory-only');

  const jordanTrip2Load = JSON.parse((await call('GET', `/api/vacation-itinerary?app=1&session=jordan-tok-1096&tripId=${trip2Id}`)).body);
  assert.equal(jordanTrip2Load.eula.accepted, true);
  const jordanOwnLoad = JSON.parse((await call('GET', `/api/vacation-itinerary?app=1&session=jordan-tok-1096&tripId=${jordanTripId}`)).body);
  assert.equal(jordanOwnLoad.eula.accepted, true);

  process.env.TIMESYNCHER_EULA_VERSION = '2026-09-terms-v2';
  const jordanV2Prompt = JSON.parse((await call('GET', `/api/vacation-itinerary?app=1&session=jordan-tok-1096&tripId=${trip2Id}`)).body);
  assert.equal(jordanV2Prompt.eula.accepted, false);
  assert.equal(jordanV2Prompt.eula.version, '2026-09-terms-v2');
  const jordanAcceptV2 = await call('POST', `/api/eula?action=accept&sessionId=${encodeURIComponent(jordanV2Prompt.eula.sessionId)}`, {
    acceptedByName: 'Jordan Lee',
    checkboxConfirmed: true,
  });
  assert.equal(jordanAcceptV2.statusCode, 201, jordanAcceptV2.body);
  const jordanTrip1V2 = JSON.parse((await call('GET', `/api/vacation-itinerary?app=1&session=jordan-tok-1096&tripId=${trip1Id}`)).body);
  assert.equal(jordanTrip1V2.eula.accepted, true);
  const jordanSeat1 = await seatForSessionTrip(db, state.sessions.find((s) => s.token === 'jordan-tok-1096'), trip1Id);
  const directV2 = await vacationAppEulaForCollaboratorSeat(
    { customer_id: jordanId, email: 'jordan@example.test' },
    jordanSeat1,
    process.env,
    db,
  );
  assert.equal(directV2.accepted, true);

  const soloLoad = JSON.parse((await call('GET', '/api/vacation-itinerary?app=1&session=solo-tok-1096')).body);
  assert.equal(soloLoad.session.seat, null);
  assert.deepEqual(
    soloLoad.vacations.map((v) => `${v.id}:${v.role}`).sort(),
    [`${soloTrip1Id}:owner`, `${soloTrip2Id}:owner`].sort(),
  );
} finally {
  useOnboardingLookup(null);
  useVacationAppDatabase(null);
  await rm(storeDir, { recursive: true, force: true });
}

console.log('collaborator auto dropdown #1096 tests passed');
