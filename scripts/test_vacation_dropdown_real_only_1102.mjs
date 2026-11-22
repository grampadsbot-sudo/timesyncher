#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isPlaceholderTripRecord, isUpgradeablePlaceholderTrip } from '../src/vacation/owner-shell-trip.mjs';
import { loadVacationAppTripRows } from '../src/vacation/collaborator-app-seat.mjs';
import { createVacationFromChatMessage } from '../src/vacation/vacation-from-chat-intake.mjs';
import { createRelationalMemoryDb } from './fixtures/collaborator-auto-dropdown-1096-db.mjs';
import { testPlanEnv } from './fixtures/reply-plan-test-fixtures.mjs';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_BLOB_STORE_ID;

const storeDir = await mkdtemp(path.join(tmpdir(), 'dropdown-1102-'));
const savedEnv = {};
const fixtureEnv = {
  ...testPlanEnv,
  TIMESYNCHER_ONBOARDING_STORE: storeDir,
  TIMESYNCHER_EULA_STORE: '',
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
  TIMESYNCHER_TRAVEL_BASE_URL: 'https://vacation-staging.timesyncher.com',
  TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'test-1102-salt',
  TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '2500',
  TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
  TIMESYNCHER_EULA_VERSION: '2026-06-terms-advisory-only',
  OPENROUTER_API_KEY: 'test-key',
  JEV_ROUTER_MODEL: 'test/jev-router',
};
for (const key of Object.keys(fixtureEnv)) savedEnv[key] = process.env[key];
Object.assign(process.env, fixtureEnv);

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

async function call(method, url, json = null) {
  const res = mockRes();
  const req = {
    method,
    url,
    headers: { 'user-agent': 'test-1102' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (json) yield Buffer.from(JSON.stringify(json));
    },
  };
  await handler(req, res);
  return res;
}

const originalFetch = globalThis.fetch;

function intakeFetchMock({ title, destination, hasDates, startDate = '2026-10-07', endDate = '2026-10-09', intake = true }) {
  return async (url, init) => {
    const href = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (href.includes('/decisions')) {
      const questions = body?.questions || body?.input?.questions || {};
      if (questions.trip_intake) {
        return {
          ok: true,
          json: async () => ({ answers: { trip_intake: { noul: intake ? 0.94 : 0.08 } } }),
        };
      }
      return { ok: true, json: async () => ({ ok: true, answers: { model_tier: { score: 0 }, route_type: { choice: 'general' } } }) };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              things: [],
              roster: [],
              destination,
              hasDates,
              startDate: hasDates ? startDate : '',
              endDate: hasDates ? endDate : '',
              title,
            }),
          },
        }],
      }),
    };
  };
}

try {
  assert.equal(isPlaceholderTripRecord({
    title: 'Morgan unlimited account upgrade',
    status: 'account_upgrade',
    start_date: '2026-06-01',
    end_date: null,
    metadata: { notARealVacation: true, source: 'account_upgrade_cleanup' },
  }), true);
  assert.equal(isPlaceholderTripRecord({ title: 'Anything', status: 'account_upgrade', start_date: '2026-06-01', end_date: '2026-06-05' }), true);
  assert.equal(isPlaceholderTripRecord({ title: 'Anything', status: 'planning', metadata: { notARealVacation: true } }), true);
  assert.equal(isPlaceholderTripRecord({ title: 'Alex unlimited account upgrade', status: 'planning', start_date: '2026-06-01' }), true);
  assert.equal(isUpgradeablePlaceholderTrip({ title: 'Alex unlimited account upgrade', status: 'account_upgrade', metadata: { notARealVacation: true } }), false);

  assert.equal(isPlaceholderTripRecord({
    title: 'TimeSyncher Vacation Setup',
    status: 'onboarding',
    destination: null,
    start_date: '2026-07-01',
    end_date: null,
    has_items: false,
    never_started_onboarding: true,
    metadata: {},
  }), true);
  assert.equal(isPlaceholderTripRecord({
    title: 'TimeSyncher Vacation Setup',
    status: 'onboarding',
    destination: '',
    start_date: null,
    end_date: null,
    has_items: false,
  }), true);
  assert.equal(isUpgradeablePlaceholderTrip({
    title: 'TimeSyncher Vacation Setup',
    status: 'onboarding',
    destination: '',
    start_date: '2026-07-01',
    end_date: null,
    has_items: false,
  }), true);

  assert.equal(isPlaceholderTripRecord({
    title: 'shell-abc12345',
    status: 'onboarding',
    destination: '',
    start_date: '2026-07-01',
    end_date: null,
    has_items: false,
  }), true);

  assert.equal(isPlaceholderTripRecord({
    title: 'Harbor Ridge Week',
    destination: 'Monterey',
    start_date: '2026-08-01',
    end_date: '2026-08-05',
    status: 'planning',
    has_items: true,
    metadata: {},
  }), false);

  assert.equal(isPlaceholderTripRecord({
    title: 'First Chat Vacation',
    destination: 'Carmel',
    start_date: '2026-09-10',
    end_date: '2026-09-14',
    status: 'onboarding',
    has_items: false,
    metadata: { source: 'vacation_app_chat' },
  }), false);

  assert.equal(isPlaceholderTripRecord({
    title: 'Upgraded Vacation',
    destination: 'Sedona',
    start_date: '2026-10-07',
    end_date: '2026-10-09',
    status: 'planning',
    has_items: false,
    metadata: { placeholderTrip: false, upgradedFromShell: true, source: 'vacation_app_chat' },
  }), false);

  const { db, state } = createRelationalMemoryDb();
  useOnboardingLookup(db);
  useVacationAppDatabase(db);

  const ownerId = crypto.randomUUID();
  const hostId = crypto.randomUUID();
  const starterId = crypto.randomUUID();

  const realOwnedId = crypto.randomUUID();
  const upgradeRowId = crypto.randomUUID();
  const setupStubId = crypto.randomUUID();
  const collabTripId = crypto.randomUUID();
  const starterTripId = crypto.randomUUID();
  const shellOnlyOwnerId = crypto.randomUUID();
  const shellOnlyTripId = crypto.randomUUID();

  state.customers.push(
    { id: ownerId, email: 'owner-1102@example.test', first_name: 'Morgan', last_name: 'Reid', display_name: 'Morgan Reid' },
    { id: hostId, email: 'host-1102@example.test', first_name: 'Ada', last_name: 'Host', display_name: 'Ada Host' },
    { id: starterId, email: 'starter-1102@example.test', first_name: 'Riley', last_name: 'New', display_name: 'Riley New' },
    { id: shellOnlyOwnerId, email: 'shell-1102@example.test', first_name: 'Devon', last_name: 'Stub', display_name: 'Devon Stub' },
  );

  state.trips.push(
    {
      id: realOwnedId,
      customer_id: ownerId,
      title: 'Coastal Week',
      destination: 'Monterey',
      start_date: '2026-08-01',
      end_date: '2026-08-05',
      status: 'planning',
      has_items: true,
      metadata: { publicSlug: 'coastal-week-1102', shareToken: 'coastal-week-1102', publicUrl: 'https://vacation-staging.timesyncher.com/shared/coastal-week-1102/' },
    },
    {
      id: upgradeRowId,
      customer_id: ownerId,
      title: 'Morgan unlimited account upgrade',
      destination: null,
      start_date: '2026-05-01',
      end_date: null,
      status: 'account_upgrade',
      has_items: false,
      metadata: { notARealVacation: true, source: 'account_upgrade_cleanup' },
    },
    {
      id: setupStubId,
      customer_id: ownerId,
      title: 'TimeSyncher Vacation Setup',
      destination: null,
      start_date: '2026-06-15',
      end_date: null,
      status: 'onboarding',
      has_items: false,
      never_started_onboarding: true,
      metadata: { source: 'stripe_purchase' },
    },
    {
      id: collabTripId,
      customer_id: hostId,
      title: 'Alpine Retreat',
      destination: 'Tahoe',
      start_date: '2026-09-10',
      end_date: '2026-09-14',
      status: 'planning',
      has_items: true,
      metadata: { publicSlug: 'alpine-retreat-1102', shareToken: 'alpine-retreat-1102', publicUrl: 'https://vacation-staging.timesyncher.com/shared/alpine-retreat-1102/' },
    },
    {
      id: starterTripId,
      customer_id: starterId,
      title: 'Desert Escape',
      destination: 'Sedona',
      start_date: '2026-10-07',
      end_date: '2026-10-09',
      status: 'planning',
      has_items: false,
      metadata: { placeholderTrip: false, upgradedFromShell: true, source: 'vacation_app_chat' },
    },
    {
      id: shellOnlyTripId,
      customer_id: shellOnlyOwnerId,
      title: 'TimeSyncher Vacation Setup',
      destination: null,
      start_date: '2026-07-04',
      end_date: null,
      status: 'onboarding',
      has_items: false,
      never_started_onboarding: true,
      metadata: {},
    },
  );

  state.sessions.push(
    { id: crypto.randomUUID(), customer_id: ownerId, trip_id: realOwnedId, token: 'owner-tok-1102', status: 'purchase_confirmed', metadata: {} },
    { id: crypto.randomUUID(), customer_id: hostId, trip_id: collabTripId, token: 'host-tok-1102', status: 'purchase_confirmed', metadata: {} },
    { id: crypto.randomUUID(), customer_id: starterId, trip_id: starterTripId, token: 'starter-tok-1102', status: 'purchase_confirmed', metadata: {} },
    { id: crypto.randomUUID(), customer_id: shellOnlyOwnerId, trip_id: shellOnlyTripId, token: 'shell-tok-1102', status: 'purchase_confirmed', metadata: {} },
  );

  const invRes = await call('POST', '/api/vacation-itinerary?app=1&session=host-tok-1102', {
    action: 'collaborator-invite',
    tripId: collabTripId,
    name: 'Morgan Reid',
    email: 'owner-1102@example.test',
  });
  assert.equal(invRes.statusCode, 200, invRes.body);

  const ownerRes = await call('GET', '/api/vacation-itinerary?app=1&session=owner-tok-1102');
  assert.equal(ownerRes.statusCode, 200, ownerRes.body);
  const ownerData = JSON.parse(ownerRes.body);
  assert.deepEqual(
    ownerData.vacations.map((v) => `${v.id}:${v.role}`).sort(),
    [`${realOwnedId}:owner`, `${collabTripId}:collaborator`].sort(),
  );
  assert.equal(ownerData.vacations.some((v) => v.id === upgradeRowId || v.id === setupStubId), false);
  assert.equal(state.trips.some((t) => t.id === upgradeRowId), true);
  assert.equal(state.trips.some((t) => t.id === setupStubId), true);

  const starterRes = await call('GET', '/api/vacation-itinerary?app=1&session=starter-tok-1102');
  assert.equal(starterRes.statusCode, 200, starterRes.body);
  const starterData = JSON.parse(starterRes.body);
  assert.deepEqual(starterData.vacations.map((v) => v.id), [starterTripId]);

  const shellOnlyRes = await call('GET', '/api/vacation-itinerary?app=1&session=shell-tok-1102');
  assert.equal(shellOnlyRes.statusCode, 200, shellOnlyRes.body);
  const shellOnlyData = JSON.parse(shellOnlyRes.body);
  assert.deepEqual(shellOnlyData.vacations, []);
  assert.equal(shellOnlyData.trip, null);
  assert.equal(shellOnlyData.session.currentTripId, null);

  const shellTrips = [
    {
      id: shellOnlyTripId,
      customer_id: shellOnlyOwnerId,
      title: 'TimeSyncher Vacation Setup',
      destination: null,
      start_date: '2026-07-04',
      end_date: null,
      status: 'onboarding',
      has_items: false,
      never_started_onboarding: true,
      metadata: {},
    },
  ];
  const shellSession = { id: 'sess-shell-upgrade', customer_id: shellOnlyOwnerId, trip_id: shellOnlyTripId, metadata: {} };
  const shellDb = async (strings, ...values) => {
    const text = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (/from trips where trips\.customer_id =/i.test(text)) {
      return shellTrips.map((row) => ({ ...row, current: row.id === shellSession.trip_id, role: 'owner' }));
    }
    if (/from trips where id =/i.test(text)) {
      return shellTrips.filter((row) => row.id === values[0]);
    }
    if (/update trips set title =/i.test(text)) {
      const target = shellTrips.find((row) => row.id === values[values.length - 1]);
      if (target) {
        target.title = values[0];
        target.destination = values[1];
        target.start_date = values[2] || target.start_date;
        target.end_date = values[3] || target.end_date;
        if (target.status === 'onboarding') target.status = 'planning';
        target.metadata = { ...(target.metadata || {}), ...(values[4] || {}) };
      }
      return [];
    }
    return [];
  };
  const loadFiltered = async (dbArg, sessArg) => {
    const rows = await loadVacationAppTripRows(dbArg, sessArg);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      destination: row.destination || '',
      startDate: row.start_date || null,
      endDate: row.end_date || null,
      status: row.status,
      metadata: row.metadata || {},
      hasItems: Boolean(row.has_items),
    }));
  };

  assert.deepEqual(await loadFiltered(shellDb, shellSession), []);

  globalThis.fetch = intakeFetchMock({ title: '', destination: '', hasDates: false, intake: false });
  const greeting = await createVacationFromChatMessage(shellDb, shellSession, { text: 'Hello there' }, loadFiltered, process.env);
  assert.equal(greeting.ok, true);
  assert.equal(greeting.action, 'queue_without_trip');
  assert.deepEqual(await loadFiltered(shellDb, shellSession), []);

  globalThis.fetch = intakeFetchMock({
    title: 'Harbor Ridge Week',
    destination: 'Neutral Bay',
    hasDates: true,
    startDate: '2026-10-07',
    endDate: '2026-10-09',
    intake: true,
  });
  const upgraded = await createVacationFromChatMessage(
    shellDb,
    shellSession,
    { text: 'We are planning Harbor Ridge Week in Neutral Bay from October 7 to October 9, 2026.' },
    loadFiltered,
    process.env,
  );
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.action, 'upgraded');
  assert.equal(upgraded.selected?.id, shellOnlyTripId);
  assert.equal(upgraded.selected?.title, 'Harbor Ridge Week');
  assert.equal(upgraded.selected?.destination, 'Neutral Bay');
  assert.equal(upgraded.selected?.status, 'planning');
  assert.deepEqual(upgraded.vacations.map((v) => v.id), [shellOnlyTripId]);

  const html = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
  const selectorSource = html.slice(html.indexOf('function customerPlaceName'), html.indexOf('function realVacations'));
  const selector = new Function(
    'safe',
    'icon',
    `${selectorSource}; return { isPlaceholderTrip, vacationSelector };`,
  )((value) => String(value ?? ''), { chevron: '', check: '' });
  assert.equal(selector.isPlaceholderTrip({ title: 'Morgan unlimited account upgrade', status: 'account_upgrade', startDate: '2026-05-01' }), true);
  assert.equal(selector.isPlaceholderTrip({ title: 'TimeSyncher Vacation Setup', status: 'onboarding', startDate: '2026-06-15', endDate: null }), true);
  assert.equal(selector.isPlaceholderTrip({ id: realOwnedId, title: 'Coastal Week', destination: 'Monterey', startDate: '2026-08-01', endDate: '2026-08-05', status: 'planning' }), false);
  const dropdownMarkup = selector.vacationSelector(ownerData.vacations, ownerData.vacations[0]);
  assert.match(dropdownMarkup, /Coastal Week/);
  assert.match(dropdownMarkup, /Alpine Retreat/);
  assert.doesNotMatch(dropdownMarkup, /unlimited account upgrade/i);
  assert.doesNotMatch(dropdownMarkup, /Vacation Setup/i);
} finally {
  useOnboardingLookup(null);
  useVacationAppDatabase(null);
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(storeDir, { recursive: true, force: true });
}

console.log('vacation dropdown real-only #1102 tests passed');
