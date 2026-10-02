#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import handler from '../api/[...route].mjs';
import { useOnboardingLookup } from '../routes/eula.mjs';
import { useVacationAppDatabase } from '../routes/vacation-itinerary.mjs';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import { couponHash } from '../src/vacation/coupons.mjs';
import { createVacationFromChatMessage } from '../src/vacation/vacation-from-chat-intake.mjs';
import { testPlanEnv } from './fixtures/reply-plan-test-fixtures.mjs';
import {
  BRAVE_HOST,
  DESTINATION,
  TAVILY_HOST,
  TRIP_ID,
  TRIP_ID_B,
  TRIP_TITLE,
  buildState,
  dbFor,
  intakeFetchMock,
  providerFetchMock,
} from './fixtures/vacation-chat-entitlement-e2e-fixtures.mjs';

async function runPlanFlow(plan) {
  const storeDir = await mkdtemp(path.join(tmpdir(), `chat-entitlement-e2e-${plan}-`));
  const state = buildState(plan);

  const fixtureEnv = {
    ...testPlanEnv,
    TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
    TIMESYNCHER_ONBOARDING_STORE: storeDir,
    TIMESYNCHER_EULA_VERSION: 'test-eula-e2e',
    TIMESYNCHER_COUPON_HASH_SALT: 'chat-entitlement-e2e',
    RESEND_API_KEY: 'test-key',
    BRAVE_SEARCH_API_KEY: 'brave-e2e-key',
    TAVILI_API_KEY: 'tavily-e2e-key',
    OPENROUTER_API_KEY: 'openrouter-e2e-key',
    DATABASE_URL: 'postgresql://chat-entitlement-e2e@127.0.0.1/chat_entitlement_e2e',
    TIMESYNCHER_CHECKOUT_CURRENCY: 'usd',
    TIMESYNCHER_BASE_PRICE_CENTS: '3700',
    TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
    TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '2100',
    TIMESYNCHER_MEDIA_PRICE_CENTS: '1700',
    TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
    TIMESYNCHER_MEDIA_NAME: 'Photo memories',
    TIMESYNCHER_SINGLE_NAME: 'Single vacation',
    TIMESYNCHER_UNLIMITED_NAME: 'Unlimited add-on',
  };

  const saved = {};
  for (const key of Object.keys(fixtureEnv).concat(['BLOB_READ_WRITE_TOKEN', 'VERCEL_BLOB_STORE_ID'])) {
    saved[key] = process.env[key];
  }
  Object.assign(process.env, fixtureEnv);
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL_BLOB_STORE_ID;
  state.coupon.code_hash = couponHash(state.couponCode, process.env);

  const db = dbFor(state);
  useVacationDatabase(db);
  useVacationAppDatabase(db);
  useOnboardingLookup(db);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = providerFetchMock(state, process.env, originalFetch);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      await handler(req, res);
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;

    const couponRes = await fetch(`${origin}/api/checkout-coupon`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Buyer',
        lastName: 'Example',
        email: 'buyer@example.com',
        couponCode: state.couponCode,
        orderBump: plan === 'unlimited',
        photoMemories: false,
      }),
    });
    const couponBody = await couponRes.json();
    assert.equal(couponRes.status, 200, JSON.stringify(couponBody));
    assert.equal(state.tripCount, 0);

    const token = couponBody.session?.token;
    assert.ok(token);

    const eulaRes = await fetch(`${origin}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${token}`)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acceptedByName: 'Buyer Example', checkboxConfirmed: true }),
    });
    assert.equal(eulaRes.status, 201, await eulaRes.text());

    async function postTurn(text) {
      state.fetchCalls = [];
      const res = await fetch(`${origin}/api/vacation-itinerary?app=1&session=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const body = await res.json();
      return { status: res.status, body };
    }

    globalThis.fetch = intakeFetchMock({ title: '', destination: '', hasDates: false, intake: false });
    const hi = await postTurn('hi');
    globalThis.fetch = providerFetchMock(state, process.env, originalFetch);
    assert.notEqual(hi.status, 502, JSON.stringify(hi.body));
    assert.equal(state.tripCount, 0);

    globalThis.fetch = intakeFetchMock({
      title: TRIP_TITLE,
      destination: DESTINATION,
      hasDates: true,
      intake: true,
    });
    const createdTrip = await createVacationFromChatMessage(
      db,
      state.session,
      { text: `We are planning ${TRIP_TITLE} in ${DESTINATION} from October 7 to October 9, 2026.` },
      async () => state.trips.map((trip) => ({
        id: trip.id,
        title: trip.title,
        destination: trip.destination,
        startDate: trip.start_date,
        endDate: trip.end_date,
        status: trip.status,
        current: trip.id === state.session.trip_id,
        publicUrl: '',
        shareToken: '',
        intakeShare: false,
      })),
      process.env,
    );
    globalThis.fetch = providerFetchMock(state, process.env, originalFetch);
    assert.equal(createdTrip.ok, true, JSON.stringify(createdTrip));
    assert.equal(createdTrip.action, 'created');
    assert.equal(state.tripCount, 1);
    assert.equal(state.session.trip_id, TRIP_ID);
    assert.equal(state.entitlement.trip_id, TRIP_ID);

    const taco = await postTurn('Find kid-friendly taco spots within walking distance of Pike Place');
    assert.notEqual(taco.status, 502, JSON.stringify(taco.body));
    assert.equal(taco.body.ok, true, JSON.stringify(taco.body));
    assert.equal(state.tripThings.some((row) => row.source === 'brave'), true);
    assert.equal(state.fetchCalls.some((href) => href.includes(BRAVE_HOST) && href.includes('local')), true);

    const weather = await postTurn('What is the weather usually like in October?');
    assert.notEqual(weather.status, 502, JSON.stringify(weather.body));
    assert.equal(weather.body.ok, true, JSON.stringify(weather.body));
    assert.equal(state.tripThings.some((row) => row.source === 'tavily'), true);
    assert.equal(state.fetchCalls.some((href) => href.includes(TAVILY_HOST)), true);

    const loadTrips = async () => state.trips.map((trip) => ({
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      startDate: trip.start_date,
      endDate: trip.end_date,
      status: trip.status,
      current: trip.id === state.session.trip_id,
      publicUrl: '',
      shareToken: '',
      intakeShare: false,
    }));

    globalThis.fetch = intakeFetchMock({
      title: 'Second Ridge Week',
      destination: DESTINATION,
      hasDates: true,
      intake: true,
    });
    state.session.trip_id = null;
    const second = await createVacationFromChatMessage(
      db,
      state.session,
      { text: `We are planning Second Ridge Week in ${DESTINATION} from October 14 to October 16, 2026.` },
      loadTrips,
      process.env,
    );
    if (plan === 'single') {
      assert.equal(second.ok, false);
      assert.equal(second.code, 'vacation_app_single_plan_second_trip_forbidden');
      assert.equal(state.tripCount, 1);
    } else {
      assert.equal(second.ok, true);
      assert.equal(second.action, 'created');
      assert.equal(state.tripCount, 2);
      assert.equal(state.siblings.length, 1);
      assert.equal(state.siblings[0].trip_id, TRIP_ID_B);
    }

    return { plan, ok: true };
  } finally {
    globalThis.fetch = originalFetch;
    useVacationDatabase(null);
    useVacationAppDatabase(null);
    useOnboardingLookup(null);
    await new Promise((resolve) => server.close(resolve));
    await rm(storeDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(saved)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const single = await runPlanFlow('single');
const unlimited = await runPlanFlow('unlimited');
console.log(JSON.stringify({ ok: true, checked: 'vacation-chat-entitlement-e2e', single, unlimited }));
