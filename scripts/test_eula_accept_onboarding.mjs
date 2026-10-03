import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import handler from '../api/[...route].mjs';
import { useOnboardingLookup } from '../routes/eula.mjs';
import { DatabaseJsonStore, LocalJsonStore } from '../src/onboarding/eula-persistent-store.mjs';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import { handleEulaStoreDbSql } from './fixtures/eula-store-db-sql.mjs';

function sessionKey(sessionId) {
  return `sessions/${sessionId}.json`;
}
import { ensureVacationEulaSession, vacationEulaStatus } from '../src/vacation/onboarding.mjs';

function mockRes() {
  return {
    statusCode: 0,
    body: '',
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(payload) { this.body = String(payload ?? ''); },
  };
}

function request(method, url, json) {
  return {
    method,
    url,
    headers: { 'user-agent': 'eula-accept-test' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (json) yield Buffer.from(JSON.stringify(json));
    },
  };
}

async function call(method, url, json) {
  const res = mockRes();
  await handler(request(method, url, json), res);
  return res;
}

function onboardingRow(token) {
  return {
    id: 'onboarding-row-1',
    token,
    email: 'owner@example.com',
    first_name: 'Ada',
    last_name: 'Owner',
    display_name: 'Ada Owner',
    phone: '',
    telegram_deep_link: '',
    status: 'purchase_confirmed',
    current_step: 'post_purchase',
  };
}

function lookupDb(row, seen) {
  return (strings, ...values) => {
    const query = strings.join(' ');
    seen.push({ query, values });
    if (query.includes('onboarding_sessions.token') && values[0] === row.token) return [row];
    return [];
  };
}

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_BLOB_STORE_ID;
process.env.TIMESYNCHER_EULA_STORE = '';
process.env.TIMESYNCHER_COLLABORATOR_NAME = process.env.TIMESYNCHER_COLLABORATOR_NAME || 'Collaborator seat';

const storeDir = await mkdtemp(path.join(tmpdir(), 'eula-accept-'));
process.env.TIMESYNCHER_ONBOARDING_STORE = storeDir;
const token = 'route-token';
const sessionId = `vacation-${token}`;
const row = onboardingRow(token);
const seen = [];
useOnboardingLookup(lookupDb(row, seen));

try {
  const missing = await call('GET', `/accept/${sessionId}`);
  assert.equal(missing.statusCode, 200, missing.body.slice(0, 180));
  assert.match(missing.headers['content-type'], /text\/html/);
  assert.match(missing.body, /Review & continue/);
  assert.equal(seen.some((call) => call.query.includes('onboarding_sessions.token') && call.values[0] === token), true);

  const accepted = await call('POST', `/api/eula?action=accept&sessionId=${encodeURIComponent(sessionId)}`, {
    acceptedByName: 'Ada Owner',
    checkboxConfirmed: true,
  });
  assert.equal(accepted.statusCode, 201, accepted.body.slice(0, 180));

  const onboarding = await call('GET', `/api/onboarding-session?session=${encodeURIComponent(token)}`);
  assert.equal(onboarding.statusCode, 200, onboarding.body.slice(0, 240));
  const payload = JSON.parse(onboarding.body);
  assert.equal(payload.session.eula.status, 'accepted');
  assert.equal(payload.session.eula.accepted, true);
  assert.equal(payload.session.eula.sessionId, sessionId);

  const status = await vacationEulaStatus(row, process.env);
  assert.equal(status.ok, true);
  assert.equal(status.status, 'accepted');

  const created = await ensureVacationEulaSession(onboardingRow('already-stored'), { env: process.env });
  const again = await call('GET', `/accept/${created.sessionId}`);
  assert.equal(again.statusCode, 200, again.body.slice(0, 180));

  const expiredId = 'vacation-expired-token';
  const expiredPath = path.join(storeDir, sessionKey(expiredId));
  const expired = {
    sessionId: expiredId,
    clientKey: 'vacation-onboarding:expired',
    clientLabel: 'Expired',
    contact: {},
    selectedFunctionality: ['vacation_planning_onboarding'],
    google: {},
    eula: { version: '2026-04-initial-draft', text: 'Expired terms.' },
    status: 'pending',
    createdAt: '2020-01-01T00:00:00.000Z',
    expiresAt: '2020-01-02T00:00:00.000Z',
  };
  await new LocalJsonStore(storeDir).putJson(sessionKey(expiredId), expired);
  const expiredPage = await call('GET', `/accept/${expiredId}`);
  assert.equal(expiredPage.statusCode, 404, expiredPage.body);
  assert.match(expiredPage.body, /Acceptance session not found/);
  const stillExpired = JSON.parse(await readFile(expiredPath, 'utf8'));
  assert.equal(stillExpired.expiresAt, expired.expiresAt);

  const inviteId = '11111111-1111-1111-1111-111111111111';
  const collabLookup = (strings, ...values) => {
    const query = strings.join(' ');
    seen.push({ query, values });
    if (query.includes('onboarding_sessions.token') && values[0] === row.token) return [row];
    if (query.includes('vacation_collaborator_invites') && values.includes(inviteId)) {
      return [{
        id: inviteId,
        owner_customer_id: 'owner-1',
        trip_id: null,
        plan_code: 'telegram_collaborators_single_trip',
        scope: 'single_trip',
        requested_for: 'Alex',
        status: 'pending_payment',
        metadata: {
          payer: 'owner',
          email: 'alex@example.com',
          displayName: 'Alex',
          channel: 'vacation-app',
          onboardingSessionId: 'owner-session-1',
        },
        owner_display_name: 'Ada Owner',
        owner_email: 'owner@example.com',
        trip_title: null,
      }];
    }
    if (/insert into customers/i.test(query)) return [{ id: 'collab-customer-1' }];
    if (/insert into onboarding_sessions/i.test(query)) return [{ id: 'collab-session-1', token: 'collab-token-1' }];
    if (/insert into vacation_collaborators/i.test(query)) return [];
    if (/update vacation_collaborator_invites/i.test(query)) return [{ id: inviteId }];
    if (/from onboarding_sessions/i.test(query) && values[0] === 'collab-token-1') {
      return [{ token: 'collab-token-1', metadata: { seat: { inviteId } } }];
    }
    return [];
  };
  useOnboardingLookup(collabLookup);
  const collaborator = await call('GET', `/accept/vacation-collaborator-${inviteId}`);
  assert.equal(collaborator.statusCode, 200, collaborator.body.slice(0, 200));
  assert.match(collaborator.body, /Review & continue/);
  assert.doesNotMatch(collaborator.body, /Acceptance session not found/);

  const eulaStore = {};
  useVacationDatabase((strings, ...values) => {
    const text = strings.join(' ').replace(/\s+/g, ' ').trim();
    const handled = handleEulaStoreDbSql(text, values, eulaStore);
    if (handled !== undefined) return handled;
    throw new Error(`unexpected sql in eula accept onboarding db test: ${text}`);
  });
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://eula-accept-onboarding/local';
  const dbStore = new DatabaseJsonStore({ prefix: 'timesyncher-eula' });
  const written = await dbStore.putJson(sessionKey('vacation-db-token'), {
    sessionId: 'vacation-db-token',
    status: 'pending',
  });
  assert.equal(written.key.includes('timesyncher-eula/sessions/vacation-db-token.json'), true);
  const readBack = await dbStore.getJson(sessionKey('vacation-db-token'));
  assert.equal(readBack.sessionId, 'vacation-db-token');
  const listed = await dbStore.listJson('sessions');
  assert.equal(listed.some((item) => item.sessionId === 'vacation-db-token'), true);
  useVacationDatabase(null);
  delete process.env.DATABASE_URL;
} finally {
  useOnboardingLookup(null);
  await rm(storeDir, { recursive: true, force: true });
}

console.log('eula accept onboarding passed');
