#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import sharedTripHandler, { useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { webAccessCookieName } from '../src/vacation/web-access.mjs';
import { createWebAccessMemoryDb } from './lib/web-access-memory-db.mjs';

const ownerAccess = await import('../src/vacation/vacation-app-owner-web-access.mjs').catch(() => ({}));
const { vacationAppOwnerWebAccessCookie, setVacationAppOwnerWebAccessCookie } = ownerAccess;
assert.equal(typeof vacationAppOwnerWebAccessCookie, 'function', 'owner app session must be able to mint website edit access');

const env = {
  TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'issue-959-salt',
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
  TIMESYNCHER_TRAVEL_BASE_URL: 'https://vacation-staging.timesyncher.com',
  NODE_ENV: 'production',
};
const ownerId = 'aaaaaaaa-0000-4000-8000-000000000001';
const viewerId = 'aaaaaaaa-0000-4000-8000-000000000002';
const tripId = 'bbbbbbbb-0000-4000-8000-000000000001';
const otherTripId = 'bbbbbbbb-0000-4000-8000-000000000002';
const shareToken = 'share959Token0123456789abcdefABCD';
const otherShare = 'share959Other0123456789abcdefABCD';

const customers = [
  { id: ownerId, email: 'owner@example.com', display_name: 'Owner' },
  { id: viewerId, email: 'viewer@example.com', display_name: 'Viewer' },
];
const trips = [
  { id: tripId, customer_id: ownerId, title: 'Trip A', metadata: { publicSlug: shareToken, publicUrl: `https://vacation-staging.timesyncher.com/shared/${shareToken}/` } },
  { id: otherTripId, customer_id: ownerId, title: 'Trip B', metadata: { sharedToken: otherShare } },
];
const ownerSession = { token: 'onboarding-owner-959', customer_id: ownerId, email: 'Owner@Example.com', display_name: 'Owner' };
const viewerSession = { token: 'onboarding-viewer-959', customer_id: viewerId, email: 'viewer@example.com', display_name: 'Viewer' };

function cookieValue(header) {
  const pair = String(header).split(';')[0];
  assert.ok(pair.startsWith(`${webAccessCookieName()}=`), `cookie name ${pair}`);
  return pair;
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

async function editAccess(db, slug, cookie = '') {
  const res = mockRes();
  useSharedTripDatabase(db);
  try {
    await sharedTripHandler({
      method: 'GET',
      url: `/api/shared/${encodeURIComponent(slug)}/edit-access`,
      headers: cookie ? { cookie } : {},
    }, res);
  } finally {
    useSharedTripDatabase(null);
  }
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

const savedSalt = process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT;
process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT = env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT;
try {
  const memory = createWebAccessMemoryDb({ customers, trips });
  assert.deepEqual(await editAccess(memory.db, shareToken), { canEdit: false }, 'session-link owner starts with no website edit cookie');

  const header = await vacationAppOwnerWebAccessCookie(memory.db, { headers: {} }, { session: ownerSession, tripId, env });
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Secure/);
  assert.match(header, /Domain=\.timesyncher\.com/);
  const cookie = cookieValue(header);
  assert.equal(memory.grants.length, 1);
  assert.equal(memory.grants[0].role, 'owner');
  assert.equal(memory.grants[0].email, 'owner@example.com');
  assert.equal(memory.grants[0].metadata.source, 'vacation_app_owner_session');

  assert.deepEqual(await editAccess(memory.db, shareToken, cookie), { canEdit: true, role: 'owner' }, 'owner app session cookie opens edit access on the shared trip iframe');
  assert.deepEqual(await editAccess(memory.db, otherShare, cookie), { canEdit: false }, 'cookie is scoped to the selected trip');

  assert.equal(await vacationAppOwnerWebAccessCookie(memory.db, { headers: { cookie } }, { session: ownerSession, tripId, env }), '', 'valid cookie is reused, not rotated');
  const again = await vacationAppOwnerWebAccessCookie(memory.db, { headers: {} }, { session: ownerSession, tripId, env });
  assert.equal(cookieValue(again), cookie, 'a second device on the same session link gets the same token');
  assert.deepEqual(await editAccess(memory.db, shareToken, cookie), { canEdit: true, role: 'owner' }, 'first device stays editable after a second device loads');

  const switched = await vacationAppOwnerWebAccessCookie(memory.db, { headers: { cookie } }, { session: ownerSession, tripId: otherTripId, env });
  assert.notEqual(cookieValue(switched), cookie, 'switching trips mints that trip');
  assert.deepEqual(await editAccess(memory.db, otherShare, cookieValue(switched)), { canEdit: true, role: 'owner' });

  assert.equal(await vacationAppOwnerWebAccessCookie(memory.db, { headers: {} }, { session: viewerSession, tripId, env }), '', 'a non-owner session gets no edit cookie');
  assert.equal(await vacationAppOwnerWebAccessCookie(memory.db, { headers: {} }, { session: { ...ownerSession, email: '' }, tripId, env }), '');
  assert.equal(await vacationAppOwnerWebAccessCookie(memory.db, { headers: {} }, { session: ownerSession, tripId: '', env }), '');
  assert.deepEqual(await editAccess(memory.db, shareToken, `${webAccessCookieName()}=forged`), { canEdit: false });

  const fresh = createWebAccessMemoryDb({ customers, trips });
  const res = mockRes();
  await setVacationAppOwnerWebAccessCookie(fresh.db, { headers: {} }, res, { session: ownerSession, tripId, env });
  assert.equal(res.headers['set-cookie'], header, 'route helper sets the same owner cookie');
  const quiet = mockRes();
  await setVacationAppOwnerWebAccessCookie(fresh.db, { headers: {} }, quiet, { session: viewerSession, tripId, env });
  assert.equal(quiet.headers['set-cookie'], undefined);
  const logged = [];
  const savedError = console.error;
  console.error = (line) => logged.push(String(line));
  try {
    const broken = mockRes();
    await setVacationAppOwnerWebAccessCookie(async () => { throw new Error('db down'); }, { headers: {} }, broken, { session: ownerSession, tripId, env });
    assert.equal(broken.headers['set-cookie'], undefined, 'a grant failure never blocks the app payload');
  } finally {
    console.error = savedError;
  }
  assert.match(logged.join('\n'), /vacation_app_owner_web_access_failed[\s\S]*db down/);
} finally {
  if (savedSalt == null) delete process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT;
  else process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT = savedSalt;
}

const route = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
const getBranch = route.slice(route.indexOf('async function handleVacationApp('), route.indexOf("if (req.method === 'POST')", route.indexOf('async function handleVacationApp(')));
const ownerCookieCall = "if (!seat && selected?.id) await setVacationAppOwnerWebAccessCookie(db, req, res, { session, tripId: selected.id });";
assert.ok(getBranch.includes(ownerCookieCall), 'vacation app GET must hand the owner a website edit cookie before the iframe loads');
assert.ok(getBranch.indexOf(ownerCookieCall) < getBranch.lastIndexOf('return sendJson(res, 200, {'), 'cookie is set before the app payload is sent');
assert.match(route, /const seat = seatFromSession\(session\);\n  if \(seat\?\.inviteId\)/, 'collaborator seats are resolved before the owner cookie step');

console.log('issue #959 owner session website edit access passed');
