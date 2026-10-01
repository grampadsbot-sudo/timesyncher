#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { probePlaceSearchKeys } from '../src/vacation/poi-search.mjs';
import { requireAdminAuth } from '../src/vacation/auth.mjs';

const MOCK_BRAVE = 'probe-test-brave-key-7f3a';
const MOCK_TAVILY = 'probe-test-tavily-key-9c2b';
const adminSource = fs.readFileSync(new URL('../routes/admin-onboardings.mjs', import.meta.url), 'utf8');

assert.match(adminSource, /requireAdminAuth\(req/);
assert.match(adminSource, /probe-place-keys/);

assert.throws(
  () => requireAdminAuth({ url: 'https://timesyncher.com/api/admin-onboardings?action=probe-place-keys', headers: {} }, { TIMESYNCHER_ADMIN_TOKEN: 'admin-secret' }),
  (error) => error.statusCode === 401,
);

let fetchCalls = 0;
const missingBrave = await probePlaceSearchKeys({ tavily: MOCK_TAVILY }, async () => {
  fetchCalls += 1;
  return { ok: true, status: 200, json: async () => ({ results: [] }) };
});
assert.equal(fetchCalls, 0, 'missing brave key must not fetch');
assert.equal(missingBrave.statusCode, 503);
assert.deepEqual(missingBrave.body, { provider: 'brave', error: 'missing_key' });

fetchCalls = 0;
const missingTavily = await probePlaceSearchKeys({ brave: MOCK_BRAVE }, async (url) => {
  fetchCalls += 1;
  return {
    ok: true,
    status: 200,
    json: async () => ({ results: [{ title: 'Cafe Test' }] }),
  };
});
assert.equal(fetchCalls, 1, 'brave probe runs before tavily missing is detected');
assert.equal(missingTavily.statusCode, 503);
assert.deepEqual(missingTavily.body, { provider: 'tavily', error: 'missing_key' });

fetchCalls = 0;
const ok = await probePlaceSearchKeys({
  brave: MOCK_BRAVE,
  tavily: MOCK_TAVILY,
}, async () => {
  fetchCalls += 1;
  if (fetchCalls === 1) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ results: [{ title: 'Brave Coffee House' }] }),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ results: [{ title: 'Tavily Coffee Guide' }] }),
  };
});
assert.equal(fetchCalls, 2);
assert.equal(ok.statusCode, 200);
assert.equal(ok.body.ok, true);
assert.equal(ok.body.providers.length, 2);
assert.equal(ok.body.providers[0].provider, 'brave');
assert.equal(ok.body.providers[0].resultCount, 1);
assert.equal(ok.body.providers[0].firstTitle, 'Brave Coffee House');
const serialized = JSON.stringify(ok.body);
assert.doesNotMatch(serialized, new RegExp(MOCK_BRAVE));
assert.doesNotMatch(serialized, new RegExp(MOCK_TAVILY));
assert.doesNotMatch(serialized, /authorization|X-Subscription-Token/i);

const braveError = await probePlaceSearchKeys({
  brave: MOCK_BRAVE,
  tavily: MOCK_TAVILY,
}, async (url) => {
  if (String(url).includes('brave.com')) {
    return { ok: false, status: 402, json: async () => ({}) };
  }
  return { ok: true, status: 200, json: async () => ({ results: [{ title: 'Tavily OK' }] }) };
});
assert.equal(braveError.statusCode, 200);
assert.equal(braveError.body.providers[0].httpStatus, 402);
assert.equal(braveError.body.providers[0].resultCount, 0);

console.log(JSON.stringify({
  ok: true,
  checked: 'admin-place-key-probe',
  tests: [
    'admin_auth_required',
    'missing_brave_key_no_fetch',
    'missing_tavily_key_no_second_fetch',
    'success_shape_excludes_key_material',
    'provider_http_status_passthrough',
  ],
}));
