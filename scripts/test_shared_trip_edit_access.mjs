#!/usr/bin/env node
import assert from 'node:assert/strict';

import sharedTripHandler, { useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import {
  sharedTripEditAccessFromRequest,
  webAccessCookieName,
  webAccessTokenHash,
} from '../src/vacation/web-access.mjs';

const tripId = '11111111-1111-1111-1111-111111111111';
const realOwnerId = '22222222-2222-2222-2222-222222222222';
const forgedOwnerId = '33333333-3333-3333-3333-333333333333';
const publicSlug = '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y';
const env = { TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'edit-access-846-test-salt' };

function makeDbStub({ sessionToken, role = 'owner', ownerCustomerId = realOwnerId, shareToken = publicSlug }) {
  const sessionHash = webAccessTokenHash(sessionToken, env);
  return async (strings, ...values) => {
    const query = String(strings.raw ? strings.raw.join('?') : strings);
    if (/create table if not exists vacation_web_access_grants/i.test(query)) return [];
    if (/alter table vacation_web_access_grants/i.test(query)) return [];
    if (/create unique index if not exists vacation_web_access_active_email_idx/i.test(query)) return [];
    if (/from vacation_web_access_grants/i.test(query) && /session_token_hash/i.test(query)) {
      if (!values.includes(sessionHash)) return [];
      if (/join trips/i.test(query) && !values.includes(shareToken)) return [];
      return [{
        id: 'grant-1',
        trip_id: tripId,
        owner_customer_id: ownerCustomerId,
        role,
        status: 'accepted',
      }];
    }
    if (/from trips/i.test(query) && /customer_id/i.test(query)) {
      return [{ customer_id: realOwnerId }];
    }
    if (/update vacation_web_access_grants/i.test(query)) return [];
    throw new Error(`unexpected query in test db stub: ${query}`);
  };
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(payload) { this.body = String(payload || ''); },
  };
}

const ownerSession = 'accepted-owner-session-846';
const db = makeDbStub({ sessionToken: ownerSession, role: 'owner' });

const ownerReq = {
  headers: {
    cookie: `${webAccessCookieName()}=${encodeURIComponent(ownerSession)}`,
  },
};

const ownerAccess = await sharedTripEditAccessFromRequest(db, ownerReq, { shareToken: publicSlug, env });
assert.deepEqual(ownerAccess, { canEdit: true, role: 'owner' });

const noCookie = await sharedTripEditAccessFromRequest(db, { headers: {} }, { shareToken: publicSlug, env });
assert.deepEqual(noCookie, { canEdit: false });

const mismatchedOwnerSession = 'forged-owner-session';
const forgedDb = makeDbStub({
  sessionToken: mismatchedOwnerSession,
  role: 'owner',
  ownerCustomerId: forgedOwnerId,
});
const forgedAccess = await sharedTripEditAccessFromRequest(forgedDb, {
  headers: { cookie: `${webAccessCookieName()}=${encodeURIComponent(mismatchedOwnerSession)}` },
}, { shareToken: publicSlug, env });
assert.deepEqual(forgedAccess, { canEdit: false });

let upstreamCalled = false;
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => {
  upstreamCalled = true;
  return new Response('{}', { status: 404 });
};

const savedSalt = process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT;
process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT = env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT;

useSharedTripDatabase(db);
try {
  const deny = mockRes();
  await sharedTripHandler({
    method: 'GET',
    url: `/api/shared/${encodeURIComponent(publicSlug)}/edit-access`,
    headers: {},
  }, deny);
  assert.equal(deny.statusCode, 200);
  assert.equal(JSON.parse(deny.body).canEdit, false);
  assert.equal(upstreamCalled, false);

  const allow = mockRes();
  await sharedTripHandler({
    method: 'GET',
    url: `/api/shared/${encodeURIComponent(publicSlug)}/edit-access`,
    headers: ownerReq.headers,
  }, allow);
  assert.equal(allow.statusCode, 200);
  assert.deepEqual(JSON.parse(allow.body), { canEdit: true, role: 'owner' });
  assert.equal(upstreamCalled, false);

  upstreamCalled = false;
  const intake = mockRes();
  const intakeSlug = 'intake-0123456789ab';
  await sharedTripHandler({
    method: 'GET',
    url: `/api/shared/${intakeSlug}/edit-access`,
    headers: ownerReq.headers,
  }, intake);
  assert.equal(intake.statusCode, 200);
  assert.deepEqual(JSON.parse(intake.body), { canEdit: false });
  assert.equal(upstreamCalled, false);
} finally {
  useSharedTripDatabase(null);
  globalThis.fetch = savedFetch;
  if (savedSalt == null) delete process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT;
  else process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT = savedSalt;
}

process.stdout.write('shared trip edit access tests passed\n');
