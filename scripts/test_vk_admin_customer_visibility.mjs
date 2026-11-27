#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createVkAdminHandler } from '../routes/vk-admin.mjs';
import { listVkAdminGroups } from '../src/vacation/vk-admin-fixtures.mjs';
import {
  classifyVkAdminGroup, findVkAdminVacation, VK_ADMIN_TEST_DOMAINS, vkAdminGroups, vkAdminIncludeFixtureRoster,
} from '../src/vacation/vk-admin-review-data.mjs';

const real = { isTest: false, testReason: null, visibleByDefault: true, testTag: null };
const test = (testReason) => ({ isTest: true, testReason, visibleByDefault: false, testTag: 'Test' });
const owner = { customerId: 'owner', email: 'synthetic@gmail.com' };
assert.deepEqual(classifyVkAdminGroup(owner), real);
assert.deepEqual(classifyVkAdminGroup({ ...owner, customerId: null }), test('no-owner'));
assert.deepEqual(classifyVkAdminGroup({ ...owner, email: null }), test('no-email'));
assert.deepEqual(classifyVkAdminGroup({ ...owner, email: ' ' }), test('no-email'));
assert.deepEqual(classifyVkAdminGroup({ ...owner, rosterId: 1 }), test('fixture'));
assert.deepEqual(classifyVkAdminGroup(owner, { fixture: true }), test('fixture'));
assert.deepEqual(classifyVkAdminGroup({ ...owner, harnessTag: 'harness:run:vk-story' }), test('harness'));

const testDomains = [
  'agentmail.to', 'example.com', 'example.test', 'example.invalid', 'harness.invalid',
  'resend.dev', 'timesyncher.test', 'test.com',
];
assert.deepEqual(new Set(VK_ADMIN_TEST_DOMAINS), new Set(testDomains));
for (const domain of [...testDomains, 'other.invalid', 'other.test', 'other.local', 'other.example']) {
  assert.deepEqual(classifyVkAdminGroup({ ...owner, email: ` inbox@${domain.toUpperCase()} ` }), test('test-domain'));
}
assert.deepEqual(classifyVkAdminGroup({ ...owner, email: 'inbox@notexample.com' }), real);

function vacation(tripId, day, overrides = {}) {
  return {
    trip_id: tripId, title: tripId, destination: 'Fixture destination',
    customer_id: tripId, customer_email: owner.email, created_at: `2026-10-${day}T12:00:00Z`,
    ...overrides,
  };
}

const gmail = vacation('gmail-vacation', '08');
const noOwner = vacation('ownerless-vacation', '09', { customer_id: null });
const noEmail = vacation('email-less-vacation', '10', { customer_email: null });
const older = vacation('older-harness', '11', {
  customer_id: 'harness-owner', customer_email: 'inbox@harness.invalid', harness_tag: 'harness:prior:vk-story',
});
const latest = vacation('latest-harness', '12', {
  customer_id: older.customer_id, customer_email: older.customer_email, harness_tag: 'harness:current:vk-story',
});
const other = vacation('other-story', '07', { harness_tag: 'harness:prior:vk-other' });
const legacy = vacation('noncanonical-tag', '15', { harness_tag: 'harness:legacy' });
const domainTrips = ['agentmail.to', 'example.com', 'resend.dev', 'harness.invalid'].map((domain) =>
  vacation(domain, '13', { customer_email: `inbox@${domain}` }));
const rows = [older, ...domainTrips, other, gmail, noOwner, latest, legacy, noEmail];
const db = async ([query]) => {
  assert.match(query, /from trips t left join customers/);
  assert.match(query, /metadata->>'harnessTag'/);
  return rows;
};

const fixtures = listVkAdminGroups();
const fixture = fixtures.find((group) => group.customers.length);
const groups = await vkAdminGroups(db);
const group = (row) => groups.find((entry) => entry.tripId === row.trip_id);
const visibilityKeys = Object.keys(real);
const visibility = (entry) => Object.fromEntries(visibilityKeys.map((key) => [key, entry[key]]));
assert.deepEqual(visibility(group(gmail)), real);
assert.deepEqual(visibility(group(noOwner)), test('no-owner'));
assert.deepEqual(visibility(group(noEmail)), test('no-email'));
for (const row of domainTrips) assert.deepEqual(visibility(group(row)), test('test-domain'));
assert.deepEqual(visibility(group(older)), test('harness'));
assert.deepEqual(visibility(group(latest)), { ...test('harness'), visibleByDefault: true });
assert.deepEqual(visibility(group(other)), { ...test('harness'), visibleByDefault: true });
assert.deepEqual(visibility(group(legacy)), test('harness'));
assert.deepEqual(visibility(groups.find((entry) => entry.tripId === fixture.tripId)), test('fixture'));
const direct = await findVkAdminVacation(null, fixture.tripId);
assert.equal(direct.tripId, fixture.tripId);
assert.deepEqual(visibility(direct), test('fixture'));

const login = randomUUID();
process.env.VK_ADMIN_LOGIN = login;
process.env.VK_ADMIN_SESSION_SECRET = randomUUID();
delete process.env.VERCEL_ENV;
const handle = createVkAdminHandler({ database: () => db });
async function request(url, { method = 'GET', cookie, body, host = 'localhost', handler = handle, status = 200 } = {}) {
  const headers = {};
  let data;
  const res = {
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(value) { data = value ? JSON.parse(value) : {}; },
  };
  await handler({ url, method, headers: { host, cookie }, body }, res);
  assert.equal(res.statusCode, status);
  return { headers, data };
}

const session = await request('/api/admin/session', { method: 'POST', body: { login } });
const cookie = session.headers['set-cookie'].split(';')[0];
const fixtureCustomers = new Set(fixtures.flatMap((entry) => entry.customers.map((member) => member.id))).size;
const fixtureRowsWithoutMembers = fixtures.filter((entry) => entry.customers.length === 0).length;
const expectedCounts = {
  testCustomerCount: fixtureCustomers + domainTrips.length + 4,
  hiddenTestCount: fixtureCustomers + fixtureRowsWithoutMembers + domainTrips.length + 3,
};
const visibleIds = [latest, gmail, other].map((row) => row.trip_id);
for (const [query, expectedIds] of [
  ['', visibleIds],
  ['?includeTest=0', visibleIds],
  ['?includeTest=1', [...fixtures.map((entry) => entry.tripId), ...rows.map((row) => row.trip_id)]],
]) {
  const { data } = await request(`/api/admin/customers${query}`, { cookie });
  assert.equal(data.ok, true);
  assert.equal(data.role, 'admin');
  assert.deepEqual(data.opened, []);
  assert.deepEqual(data.groups.map((entry) => entry.tripId).sort(), [...expectedIds].sort());
  for (const [key, count] of Object.entries(expectedCounts)) assert.equal(data[key], count, key);
}
const detail = await request(`/api/admin/customers/${fixture.tripId}`, { cookie });
assert.equal(detail.data.vacation.tripId, fixture.tripId);

const stagingHost = 'vacation-staging.timesyncher.com';
const lopezVacation = '159bf80f-5c6c-44f3-8b67-df2afeead39c';
assert.equal(vkAdminIncludeFixtureRoster({ headers: { host: stagingHost } }, { VK_ADMIN_FIXTURE_ROSTER: '1' }), false);
assert.equal(vkAdminIncludeFixtureRoster({ headers: { host: 'localhost' } }, {}), true);
assert.equal(vkAdminIncludeFixtureRoster({ headers: { host: '127.0.0.1' } }, { VERCEL_ENV: 'production' }), true);
assert.equal(vkAdminIncludeFixtureRoster({ headers: { host: 'timesyncher-vacation-staging.vercel.app' } }, { VERCEL_ENV: 'production' }), false);
assert.equal(vkAdminIncludeFixtureRoster({ headers: { host: 'timesyncher-vacation-staging.vercel.app' } }, { VERCEL_ENV: 'production', VK_ADMIN_FIXTURE_ROSTER: '1' }), true);
assert.equal(vkAdminIncludeFixtureRoster({ headers: { host: '127.0.0.1' } }, { VK_ADMIN_FIXTURE_ROSTER: '0' }), false);

const stagingRows = [
  vacation(lopezVacation, '21', {
    customer_id: 'sofia-lopez', customer_email: 'sofia.lopez@gmail.com', display_name: 'Sofia Lopez',
    title: 'Orlando theme parks', destination: 'Orlando theme parks',
  }),
  vacation('alex-rivera-vacation', '18', {
    customer_id: 'alex-rivera', customer_email: 'alex.rivera@example.com', display_name: 'Alex Rivera',
  }),
];
const stagingDb = async (strings, id) => {
  const query = Array.isArray(strings) ? strings.join('?') : String(strings);
  if (/where t\.id/.test(query)) return stagingRows.filter((row) => row.trip_id === id);
  if (/from trips/.test(query)) return stagingRows;
  return [];
};
const rosterAlias = await vkAdminGroups(async () => [vacation(lopezVacation, '21', {
  customer_id: 'sofia-lopez',
  customer_email: 'harness+live+vk-001-lopez@harness.invalid',
  display_name: 'Sofia Lopez',
  harness_tag: 'harness:live:vk-001',
})], { includeFixtures: false });
assert.equal(rosterAlias.length, 1);
assert.equal(rosterAlias[0].tripId, lopezVacation);
assert.equal(rosterAlias[0].customers[0].id, 1);
assert.equal(rosterAlias[0].customers[0].customer_label, 'Sofia Lopez');
assert.equal(rosterAlias[0].visibleByDefault, true);
assert.equal(rosterAlias.some((entry) => String(entry.tripId).startsWith('vk-fixture-')), false);

const stagingHandle = createVkAdminHandler({ database: () => stagingDb });
const stagingSession = await request('/api/admin/session', { method: 'POST', body: { login }, host: stagingHost, handler: stagingHandle });
const stagingCookie = stagingSession.headers['set-cookie'].split(';')[0];
const fixtureOnlyIds = new Set(fixtures.map((entry) => entry.tripId));
for (const [query, expectedIds] of [
  ['', [lopezVacation]],
  ['?includeTest=1', [lopezVacation, 'alex-rivera-vacation']],
]) {
  const { data } = await request(`/api/admin/customers${query}`, { cookie: stagingCookie, host: stagingHost, handler: stagingHandle });
  assert.equal(data.hiddenTestCount, 1, `${query || 'default'} hiddenTestCount`);
  assert.equal(data.testCustomerCount, 1, `${query || 'default'} testCustomerCount`);
  assert.deepEqual(data.groups.map((entry) => entry.tripId), expectedIds);
  assert.equal(data.groups.some((entry) => fixtureOnlyIds.has(entry.tripId)), false);
  assert.equal(data.groups.some((entry) => /portland weekend/i.test(entry.label || '')), false);
  assert.equal(data.groups.some((entry) => entry.customers.some((member) => member.customer_label === 'Lopez family')), false);
}
const stagingSofia = await request(`/api/admin/customers/${lopezVacation}`, { cookie: stagingCookie, host: stagingHost, handler: stagingHandle });
assert.equal(stagingSofia.data.vacation.tripId, lopezVacation);
assert.equal(stagingSofia.data.vacation.label, 'Sofia Lopez');
const stagingFixture = await request(`/api/admin/customers/${fixture.tripId}`, {
  cookie: stagingCookie, host: stagingHost, handler: stagingHandle, status: 404,
});
assert.equal(stagingFixture.data.ok, false);
console.log('VK Admin customer visibility passed');
