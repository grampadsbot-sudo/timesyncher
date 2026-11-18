#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HARNESS_ENV_DEFAULTS, preflightHarnessEnv, withHarnessEnvDefaults } from './harness/env.mjs';
import { buildTurnPayload, playCustomerTurns, turnFailure } from './harness/live-play.mjs';
import { singlePlanEntitlement } from './harness/live-provision.mjs';
import { keepsakeDecision, playwrightSearchPaths, resolvePlaywright, writeVideoCheck } from './harness/live-outputs.mjs';

const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
story.reply_backend = 'openrouter';
const origin = 'https://vacation-staging.timesyncher.com';
const hosts = [];

function fetchReturning(status, body) {
  return async () => ({ status, text: async () => JSON.stringify(body) });
}

const missingSession = await playCustomerTurns(story, {
  origin,
  token: 'fixture-session',
  tripId: '11111111-2222-4333-8444-555555555555',
  hosts,
  waitMs: 0,
  fetchImpl: async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/version') return { status: 200, text: async () => JSON.stringify({ sha: 'abc123' }) };
    return { status: 404, text: async () => JSON.stringify({ ok: false, error: 'Vacation app session not found.' }) };
  },
});
assert.equal(missingSession.reason, 'session-not-found');
assert.equal(missingSession.storedTurns, 0);

const refusedEula = await playCustomerTurns(story, {
  origin,
  token: 'fixture-session',
  tripId: '11111111-2222-4333-8444-555555555555',
  hosts,
  waitMs: 0,
  fetchImpl: fetchReturning(200, { ok: true, eula: { accepted: false } }),
});
assert.equal(refusedEula.reason, 'eula_not_accepted');
assert.equal(refusedEula.storedTurns, 0);
assert.equal(turnFailure(409, { ok: false, code: 'vacation_app_owner_entitlement_missing' }), 'vacation_app_owner_entitlement_missing');

const noReply = await playCustomerTurns({ ...story, turns: [story.turns[0]] }, {
  origin,
  token: 'fixture-session',
  tripId: '11111111-2222-4333-8444-555555555555',
  hosts,
  waitMs: 0,
  fetchImpl: async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/version') return { status: 200, text: async () => JSON.stringify({ sha: 'abc123' }) };
    return { status: 200, text: async () => JSON.stringify({ ok: true, turns: [] }) };
  },
});
assert.equal(noReply.reason, 'reply-not-stored');
assert.equal(noReply.storedTurns, 0);
assert.match(noReply.detail, /no stored reply/);

const voice = buildTurnPayload(story.turns[1], '11111111-2222-4333-8444-555555555555');
assert.equal(voice.voiceMode, true);
assert.equal(voice.browserTranscription, true);
assert.equal(buildTurnPayload(story.turns[0], '11111111-2222-4333-8444-555555555555').voiceMode, undefined);

const html = keepsakeDecision({ status: 200, contentType: 'text/html; charset=utf-8', bytes: Buffer.from('<html>keepsake</html>'), redirected: true });
assert.equal(html.ok, false);
assert.match(html.detail, /not a PDF/);
assert.match(html.detail, /text\/html/);
assert.notEqual(html.detail, 'keepsake http 200');
const pdf = keepsakeDecision({ status: 200, contentType: 'application/pdf', bytes: Buffer.from('%PDF-1.4'), redirected: false });
assert.equal(pdf.ok, true);

const browser = resolvePlaywright(['playwright-not-installed'], () => null);
assert.match(browser.missing, /playwright-missing/);
assert.match(browser.missing, /npm install playwright/);
assert.match(browser.missing, /tsv-dispatch\/capture/);
assert.ok(playwrightSearchPaths('/tmp/harness-home').some((item) => item.includes('tsv-dispatch/capture/node_modules/playwright')));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-no-thing-'));
const video = await writeVideoCheck({
  origin,
  attachment: { ok: false, detail: 'no-thing-for-media', bindings: [] },
  fetchImpl: () => { throw new Error('media fetch'); },
  outDir: dir,
});
assert.equal(video.pass, false);
assert.equal(video.detail, 'no-thing-for-media');
fs.rmSync(dir, { recursive: true, force: true });

const purchase = singlePlanEntitlement({ harnessTag: 'harness:r1:dry-run' }, '11111111-2222-4333-8444-555555555555');
assert.equal(purchase.plan, 'single');
assert.equal(purchase.status, 'active');
assert.equal(purchase.trip_id, '11111111-2222-4333-8444-555555555555');
assert.equal(purchase.metadata.product, 'timesyncher_vacation_single');

let created = false;
assert.throws(() => {
  preflightHarnessEnv({});
  created = true;
}, /harness preflight missing DATABASE_URL/);
assert.equal(created, false);
const ready = preflightHarnessEnv({ DATABASE_URL: 'postgres://fixture', HARNESS_LIVE: '1' });
assert.equal(ready.TIMESYNCHER_TRAVEL_BASE_URL, HARNESS_ENV_DEFAULTS.TIMESYNCHER_TRAVEL_BASE_URL);
assert.equal(ready.TIMESYNCHER_COLLABORATOR_NAME, HARNESS_ENV_DEFAULTS.TIMESYNCHER_COLLABORATOR_NAME);
assert.equal(withHarnessEnvDefaults({ TIMESYNCHER_TRAVEL_BASE_URL: 'https://example.test' }).TIMESYNCHER_TRAVEL_BASE_URL, 'https://example.test');

console.log('test_vk_customer_harness_dry_run_failures: ok');
