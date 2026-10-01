import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import handler from '../api/[...route].mjs';
import { useOnboardingLookup } from '../routes/eula.mjs';
import { sessionKey } from '../src/onboarding/eula-persistent-core.mjs';
import { LocalJsonStore, VercelBlobStore } from '../src/onboarding/eula-persistent-store.mjs';
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

  const collaborator = await call('GET', '/accept/vacation-collaborator-invite-1');
  assert.equal(collaborator.statusCode, 404, collaborator.body);
  assert.equal(seen.some((call) => call.values.includes('collaborator-invite-1') || call.values.includes('vacation-collaborator-invite-1')), false);

  const docs = new Map();
  class FallbackStore extends VercelBlobStore {
    async blob() {
      return {
        get: async () => ({ statusCode: 404 }),
        put: async () => { throw new Error('403 access denied'); },
        list: async () => ({ blobs: [] }),
      };
    }

    async writeDatabaseJson(pathname, value) {
      docs.set(pathname, value);
      return { key: pathname, fallback: 'database' };
    }

    async readDatabaseJson(pathname) {
      return docs.get(pathname) ?? null;
    }

    async listDatabaseJson(prefix) {
      const needle = this.key(prefix);
      return [...docs.entries()].filter(([key]) => key.startsWith(needle) && key.endsWith('.json')).map(([, value]) => value);
    }
  }
  const blobStore = new FallbackStore({ prefix: 'timesyncher-eula' });
  const written = await blobStore.putJson(sessionKey('vacation-blob-token'), {
    sessionId: 'vacation-blob-token',
    status: 'pending',
  });
  assert.equal(written.fallback, 'database');
  const readBack = await blobStore.getJson(sessionKey('vacation-blob-token'));
  assert.equal(readBack.sessionId, 'vacation-blob-token');
  const listed = await blobStore.listJson('sessions');
  assert.equal(listed.some((item) => item.sessionId === 'vacation-blob-token'), true);
} finally {
  useOnboardingLookup(null);
  await rm(storeDir, { recursive: true, force: true });
}

console.log('eula accept onboarding passed');
