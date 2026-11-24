#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertCouponCode } from './harness/coupon.mjs';
import { customerLane, personaSeed, speakCustomer } from './harness/customer-live.mjs';
import { mcpRouteIsFailClosed, runCustomer } from './harness/customer.mjs';
import { assertStagingHarnessTarget, httpHarnessEnv, loadStagingHarnessDatabase, STAGING_HARNESS_ORIGIN, STAGING_PROJECT_NAME } from './harness/env.mjs';
import { httpLiveOptions } from './harness/http-live.mjs';

const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
story.reply_backend = 'vk_bot_mcp';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mcp-route-'));
let played = 0;
const unverified = await runCustomer(story, {
  runId: 'r1',
  outDir: dir,
  play: () => { played += 1; throw new Error('played'); },
  cleanup: async () => ({ deleted: {}, remaining: 0 }),
});
assert.equal(played, 0);
assert.equal(unverified.reason, 'backend-not-available');
assert.equal(customerLane(), 'gemini');
assert.throws(() => customerLane(['claude', 'gemini']), /gemini/);
assert.throws(() => customerLane(['gemini', 'openrouter']), /banned/);
const seed = personaSeed(story);
const spoken = await speakCustomer({
  persona: seed,
  appReply: 'Thursday can stay light.',
  index: 0,
  ask: async ({ lane, appReply, goal }) => {
    assert.equal(lane, 'gemini');
    assert.match(appReply, /Thursday/);
    assert.equal(seed.goals.includes(goal), true);
    return { text: 'Can we keep Thursday lighter than that?', model: 'gemini', cost: { status: 'measured', amount: 1, unit: 'tokens' } };
  },
});
assert.equal(spoken.text.includes(seed.goals[0]), false);
const odd = await speakCustomer({ persona: seed, index: 2 });
assert.equal(odd.kind === 'goal', false);

const origin = STAGING_HARNESS_ORIGIN;
const play = async () => ({
  reason: '',
  transcript: { turns: [] },
  pdfText: '',
  timings: [],
  liveShaStart: 'abc',
  liveShaEnd: 'abc',
  dialogOk: false,
  dialogDetail: 'fixture',
  keepsakeOk: false,
  keepsakeDetail: '',
  screensOk: false,
  screensDetail: '',
  videoExists: false,
  videoPass: false,
  videoDetail: '',
  chromeOk: false,
  chromeDetail: '',
});
const route = { backend: 'vk_bot_mcp', openRouter: false, guard: 'staging-fetch', origin, play };
assert.equal(mcpRouteIsFailClosed(route), true);
assert.equal(mcpRouteIsFailClosed({ ...route, openRouter: true }), false);
assert.equal(mcpRouteIsFailClosed({ ...route, origin: 'https://www.timesyncher.com' }), false);
assert.equal(mcpRouteIsFailClosed({ ...route, play: async () => ({}) }), true);
const verified = await runCustomer(story, {
  runId: 'r1',
  outDir: dir,
  play,
  mcpRoute: route,
  cleanup: async () => ({ deleted: {}, remaining: 0 }),
});
assert.notEqual(verified.reason, 'backend-not-available');
const swapped = await runCustomer(story, {
  runId: 'r1',
  outDir: dir,
  play: () => { played += 1; throw new Error('played'); },
  mcpRoute: route,
  cleanup: async () => ({ deleted: {}, remaining: 0 }),
});
assert.equal(played, 0);
assert.equal(swapped.reason, 'backend-not-available');
fs.rmSync(dir, { recursive: true, force: true });

assert.throws(
  () => assertStagingHarnessTarget({ projectName: 'timesyncher', projectId: 'prj_prod', stagingProjectId: 'prj_stage', origin }),
  /timesyncher-vacation-staging/,
);
assert.throws(
  () => assertStagingHarnessTarget({ projectName: STAGING_PROJECT_NAME, projectId: 'prj_prod', stagingProjectId: 'prj_stage', origin }),
  /staging project/,
);
assert.throws(
  () => assertStagingHarnessTarget({ projectName: STAGING_PROJECT_NAME, origin: 'https://www.timesyncher.com' }),
  /vacation-staging/,
);
assert.doesNotThrow(() => assertStagingHarnessTarget({
  projectName: STAGING_PROJECT_NAME,
  projectId: 'prj_stage',
  stagingProjectId: 'prj_stage',
  origin,
}));

let fetched = 0;
await assert.rejects(() => loadStagingHarnessDatabase({
  env: { VERCEL_PROJECT_ID: 'prj_prod', DATABASE_URL: 'postgres://prod.example/db', OPENROUTER_API_KEY: 'secret' },
  projectName: STAGING_PROJECT_NAME,
  projectId: 'prj_prod',
  stagingProjectId: 'prj_stage',
  origin,
  fetchImpl: async () => { fetched += 1; return { ok: true, json: async () => ({}) }; },
  readFile: () => '',
  tokenFileExists: () => false,
}), /staging project/);
assert.equal(fetched, 0);
const unread = await loadStagingHarnessDatabase({
  env: {},
  projectName: STAGING_PROJECT_NAME,
  origin,
  readFile: () => '',
  tokenFileExists: () => false,
});
assert.equal(unread.ok, false);
assert.equal(unread.hostOnly, 'DATABASE_URL');
assert.equal(unread.where, 'ubuntu-host');
assert.equal(unread.missing, undefined);
assert.equal(unread.environment, undefined);
const http = httpHarnessEnv({
  DATABASE_URL: 'postgres://local.example/db',
  NEON_DATABASE_URL: 'postgres://neon.example/db',
  OPENROUTER_API_KEY: 'secret',
  HARNESS_STAGING_ORIGIN: origin,
});
assert.equal(http.ok, true);
assert.equal(http.env.DATABASE_URL, undefined);
assert.equal(http.env.NEON_DATABASE_URL, undefined);
assert.equal(http.env.OPENROUTER_API_KEY, undefined);
assert.equal(http.env.HARNESS_LIVE, '1');
assert.equal(http.origin, origin);
assert.throws(() => httpHarnessEnv({ HARNESS_STAGING_ORIGIN: 'https://www.timesyncher.com' }), /vacation-staging/);
assert.throws(() => assertCouponCode('TS-NOTMINTED'), /VK-TEST/);
const blocked = httpLiveOptions({ HARNESS_STAGING_ORIGIN: origin }, {
  fetchImpl: async () => { throw new Error('fetched'); },
});
const unminted = await blocked.play({ ...story, story_id: 'vk-001', coupon: { code: 'VK-TEST-001' } }, { runId: 'vk-test-001' });
assert.equal(unminted.reason, 'coupon-not-minted');
assert.equal(unminted.hostOnly, 'TIMESYNCHER_ADMIN_TOKEN');
const calls = [];
const live = httpLiveOptions({ HARNESS_STAGING_ORIGIN: origin, TIMESYNCHER_ADMIN_TOKEN: 'admin-token-fixture' }, {
  fetchImpl: async (url, init) => {
    calls.push({ url: String(url), body: init?.body || '' });
    if (String(url).includes('create-coupon')) {
      return { ok: true, status: 201, json: async () => ({ ok: true, code: 'TS-FRESHCODE1', coupon: { id: 'c1', codeHint: 'TS-...DE1' } }) };
    }
    return { status: 200, json: async () => ({ ok: true, status: 'coupon_valid' }) };
  },
});
assert.equal(live.env.DATABASE_URL, undefined);
const held = await live.play({ ...story, story_id: 'vk-001', coupon: { code: 'VK-TEST-001' } }, { runId: 'vk-test-001' });
assert.equal(held.reason, 'host-only-database');
assert.equal(calls.some((call) => call.url.includes('/api/vacation-itinerary')), false);
assert.equal(calls[0].url, 'https://vacation-staging.timesyncher.com/api/admin-onboardings?action=create-coupon');
assert.match(calls[0].body, /"maxRedemptions":1/);
assert.equal(calls[0].body.includes('VK-TEST-001'), false);
const checkout = calls.find((call) => call.url.includes('/api/checkout-coupon'));
assert.match(checkout.body, /TS-FRESHCODE1/);
assert.equal(checkout.body.includes('admin-token-fixture'), false);
console.log('test_vk_harness_mcp_staging: ok');
