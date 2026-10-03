import assert from 'node:assert/strict';
import handler from '../api/[...route].mjs';
import { useOnboardingLookup } from '../routes/eula.mjs';
import { sessionKey } from '../src/onboarding/eula-persistent-core.mjs';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import { handleEulaStoreDbSql } from './fixtures/eula-store-db-sql.mjs';

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
    headers: { 'user-agent': 'eula-accept-db-fail-test' },
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

const token = 'db-fail-token';
const sessionId = `vacation-${token}`;
const row = {
  id: 'onboarding-db-fail',
  token,
  email: 'ada@example.com',
  first_name: 'Ada',
  last_name: 'Owner',
  display_name: 'Ada Owner',
  phone: '',
  telegram_deep_link: '',
  status: 'purchase_confirmed',
  current_step: 'post_purchase',
};

const eulaStore = {};
let writesBlocked = false;

function db(strings, ...values) {
  const text = strings.join(' ').replace(/\s+/g, ' ').trim();
  if (writesBlocked && /insert into eula_store_objects/i.test(text)) {
    throw new Error('database write failed');
  }
  const handled = handleEulaStoreDbSql(text, values, eulaStore);
  if (handled !== undefined) return handled;
  if (text.includes('onboarding_sessions.token') && values[0] === token) return [row];
  return [];
}

delete process.env.TIMESYNCHER_ONBOARDING_STORE;
delete process.env.BLOB_READ_WRITE_TOKEN;
process.env.DATABASE_URL = 'postgres://eula-accept-route-db-fail/local';
process.env.TIMESYNCHER_COLLABORATOR_NAME = process.env.TIMESYNCHER_COLLABORATOR_NAME || 'Collaborator seat';
process.env.TIMESYNCHER_EULA_VERSION = process.env.TIMESYNCHER_EULA_VERSION || '2026-06-terms-advisory-only';

useVacationDatabase(db);
useOnboardingLookup(db);

try {
  const page = await call('GET', `/accept/${sessionId}`);
  assert.equal(page.statusCode, 200, page.body.slice(0, 200));

  writesBlocked = true;
  const accepted = await call('POST', `/api/eula?action=accept&sessionId=${encodeURIComponent(sessionId)}`, {
    acceptedByName: 'Ada Owner',
    checkboxConfirmed: true,
  });
  assert.ok(accepted.statusCode < 200 || accepted.statusCode >= 300, `expected non-2xx, got ${accepted.statusCode}`);
  const payload = JSON.parse(accepted.body);
  assert.notEqual(payload.ok, true);
  assert.match(String(payload.error || ''), /database write failed/i);

  const sessionDoc = eulaStore[`timesyncher-eula/${sessionKey(sessionId)}`];
  assert.equal(sessionDoc?.status, 'pending', 'session must not be marked accepted after failed receipt write');
} finally {
  writesBlocked = false;
  useOnboardingLookup(null);
  useVacationDatabase(null);
  delete process.env.DATABASE_URL;
}

process.stdout.write('eula accept route db write failure test passed\n');
