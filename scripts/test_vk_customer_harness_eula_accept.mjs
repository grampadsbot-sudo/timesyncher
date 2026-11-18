#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { acceptAndConfirmEula, eulaAcceptRequest, eulaAccepted } from './harness/eula-accept.mjs';

const provision = fs.readFileSync(new URL('./harness/live-provision.mjs', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('./harness/runtime.mjs', import.meta.url), 'utf8');
assert.equal(provision.includes('acceptEulaPersistent'), false);
assert.equal(runtime.includes('acceptEulaPersistent'), false);
assert.match(runtime, /acceptAndConfirmEula/);

const request = eulaAcceptRequest({
  origin: 'https://vacation-staging.timesyncher.com',
  token: 'fixture-session',
  acceptedByName: 'Avery Hale',
});
const parsed = new URL(request.url);
assert.equal(parsed.pathname, '/api/eula');
assert.equal(parsed.searchParams.get('action'), 'accept');
assert.equal(parsed.searchParams.get('sessionId'), 'vacation-fixture-session');
assert.deepEqual(request.body, { acceptedByName: 'Avery Hale', checkboxConfirmed: true });
assert.equal(eulaAccepted({ eula: { accepted: true } }), true);
assert.equal(eulaAccepted({ eula: { accepted: false } }), false);
assert.equal(eulaAccepted({ ok: true }), false);

function scriptedPost(url, body) {
  const parsedUrl = new URL(String(url));
  const payload = body?.body ? JSON.parse(body.body) : null;
  return parsedUrl.pathname === '/api/vacation-itinerary' && body?.method === 'POST' && payload?.text;
}

const acceptedCalls = [];
await acceptAndConfirmEula({
  origin: 'https://vacation-staging.timesyncher.com',
  token: 'fixture-session',
  tripId: '11111111-2222-4333-8444-555555555555',
  acceptedByName: 'Avery Hale',
  fetchImpl: async (url, options = {}) => {
    acceptedCalls.push({ url: String(url), method: options.method || 'GET', body: options.body || '' });
    const parsedUrl = new URL(String(url));
    if (parsedUrl.pathname === '/api/eula') {
      return { status: 201, text: async () => JSON.stringify({ ok: true }) };
    }
    return { status: 200, text: async () => JSON.stringify({ ok: true, eula: { accepted: true } }) };
  },
});
assert.equal(acceptedCalls[0].method, 'POST');
assert.equal(new URL(acceptedCalls[0].url).searchParams.get('action'), 'accept');
assert.deepEqual(JSON.parse(acceptedCalls[0].body), { acceptedByName: 'Avery Hale', checkboxConfirmed: true });
assert.equal(acceptedCalls.some((call) => scriptedPost(call.url, call)), false);

const refusedCalls = [];
await assert.rejects(() => acceptAndConfirmEula({
  origin: 'https://vacation-staging.timesyncher.com',
  token: 'fixture-session',
  tripId: '11111111-2222-4333-8444-555555555555',
  acceptedByName: 'Avery Hale',
  fetchImpl: async (url, options = {}) => {
    refusedCalls.push({ url: String(url), method: options.method || 'GET', body: options.body || '' });
    return { status: 201, text: async () => JSON.stringify({ ok: true }) };
  },
}), (error) => error?.code === 'eula_not_accepted');
assert.equal(refusedCalls.some((call) => scriptedPost(call.url, call)), false);

await assert.rejects(() => acceptAndConfirmEula({
  origin: 'https://vacation-staging.timesyncher.com',
  token: 'fixture-session',
  tripId: '11111111-2222-4333-8444-555555555555',
  acceptedByName: 'Avery Hale',
  fetchImpl: async () => ({ status: 409, text: async () => JSON.stringify({ ok: false, error: 'checkboxConfirmed is required' }) }),
}), (error) => error?.code === 'eula_not_accepted');

console.log('test_vk_customer_harness_eula_accept: ok');
