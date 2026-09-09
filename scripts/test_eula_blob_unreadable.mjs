import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { activationStatusForSessionPersistent, receiptKey, sessionKey } from '../src/onboarding/eula-persistent-core.mjs';
import { isBlobUnreadable, VercelBlobStore } from '../src/onboarding/eula-persistent-store.mjs';

assert.equal(isBlobUnreadable(new Error('Vercel Blob: Failed to fetch blob: 403 Forbidden')), true);
assert.equal(isBlobUnreadable(new Error('Vercel Blob: Failed to fetch blob: 404 Not Found')), true);
assert.equal(isBlobUnreadable(Object.assign(new Error('nope'), { statusCode: 403 })), true);
assert.equal(isBlobUnreadable(new Error('Vercel Blob: Failed to fetch blob: 401 Unauthorized')), false);

function jsonStream(value) {
  return Readable.toWeb(Readable.from([Buffer.from(JSON.stringify(value))]));
}

const forbidden = new Error('Vercel Blob: Failed to fetch blob: 403 Forbidden');
const blobModule = {
  async get(pathname) {
    if (String(pathname).includes('readable.json')) {
      return { statusCode: 200, stream: jsonStream({ sessionId: 'readable', status: 'pending' }) };
    }
    throw forbidden;
  },
  async put() {
    return { pathname: 'put' };
  },
  async list() {
    return {
      blobs: [
        { pathname: 'timesyncher-eula/sessions/missing.json', url: 'https://store.private.blob.vercel-storage.com/timesyncher-eula/sessions/missing.json' },
        { pathname: 'timesyncher-eula/sessions/readable.json', url: 'https://store.private.blob.vercel-storage.com/timesyncher-eula/sessions/readable.json' },
      ],
    };
  },
};

const store = new VercelBlobStore({ prefix: 'timesyncher-eula', blobModule });
assert.equal(await store.getJson('sessions/missing.json'), null);
const listed = await store.listJson('sessions');
assert.equal(listed.length, 1);
assert.equal(listed[0].sessionId, 'readable');

const memory = new Map();
const keyedStore = {
  async getJson(key) {
    return memory.get(key) || null;
  },
  async putJson(key, value) {
    memory.set(key, value);
    return { key };
  },
};
memory.set(sessionKey('vacation-tok_customer_123'), {
  sessionId: 'vacation-tok_customer_123',
  clientKey: 'vacation-onboarding:onboarding-session-1',
  status: 'pending',
  expiresAt: '2026-12-01T00:00:00.000Z',
  selectedFunctionality: ['vacation_planning_onboarding'],
  eula: { version: '2026-08-canonical', text: 'terms' },
});
const pending = await activationStatusForSessionPersistent(keyedStore, 'vacation-tok_customer_123', '2026-08-canonical');
assert.equal(pending.ok, false);
assert.ok(pending.errors.includes('receipt missing'));

memory.set(receiptKey('vacation-tok_customer_123'), {
  receiptSha256: 'nope',
  eula: { status: 'accepted', version: '2026-08-canonical' },
});
const invalid = await activationStatusForSessionPersistent(keyedStore, 'vacation-tok_customer_123', '2026-08-canonical');
assert.equal(invalid.ok, false);

console.log('eula blob unreadable / keyed activation regression passed');
