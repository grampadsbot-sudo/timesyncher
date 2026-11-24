#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creditHeadroom, readCreditSnapshot } from './harness/credit-guard.mjs';
import { LIVE_CHECK_IDS } from './harness/dry.mjs';
import { dryMediaLoad, mediaBytes, mediaLoad } from './harness/media-plan.mjs';
import { runRamp, waveFailed } from './harness/ramp.mjs';
import { loadRoster, rosterToStory } from './harness/roster.mjs';
import { isRosterMode, runRosterCli } from './harness/roster-cli.mjs';

const fixture = fileURLToPath(new URL('./fixtures/harness/vk-roster.json', import.meta.url));
const customers = loadRoster(fixture);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-ramp-'));

assert.equal(isRosterMode(['--customer', '1', '--dry']), true);
assert.equal(isRosterMode(['--story', 'a.json']), false);

const logs = [];
const c1 = await runRosterCli(
  ['--run-id', 'dry-c1', '--roster', fixture, '--customer', '1', '--dry'],
  { outRoot: tmp, buildSha: 'deadbeef', log: (line) => logs.push(JSON.parse(line)) },
);
assert.equal(c1.stopped_at, null);
assert.equal(c1.waves.length, 1);
assert.deepEqual(c1.summary.waves[0].verdicts, ['vk-001:DRY_PASS']);
assert.deepEqual(c1.summary.waves[0].coupons, ['vk-001:dry-not-sent']);
const c1Dir = path.join(tmp, 'dry-c1-w1', 'vk-001');
assert.ok(fs.readFileSync(path.join(c1Dir, 'dialog.pdf'), 'utf8').startsWith('%PDF-1.4'));
assert.ok(fs.readFileSync(path.join(c1Dir, 'keepsake.pdf'), 'utf8').startsWith('%PDF-1.4'));
const c1Card = JSON.parse(fs.readFileSync(path.join(c1Dir, 'scorecard.json'), 'utf8'));
assert.equal(c1Card.verdict, 'DRY_PASS');
assert.equal(c1Card.not_run.length, LIVE_CHECK_IDS.length);
assert.equal(fs.existsSync(c1.summary.findings), true);

const forced = await runRosterCli(
  ['--run-id', 'dry-c1-mcp', '--roster', fixture, '--customer', '1', '--reply-backend', 'vk_bot_mcp', '--dry'],
  { outRoot: tmp, buildSha: 'deadbeef', log: () => {} },
);
assert.equal(forced.stopped_at, null);
const forcedCard = JSON.parse(fs.readFileSync(path.join(tmp, 'dry-c1-mcp-w1', 'vk-001', 'scorecard.json'), 'utf8'));
assert.equal(forcedCard.reply_backend, 'vk_bot_mcp');
assert.equal(forcedCard.ab_arm, 'B vk_bot_mcp');

await assert.rejects(
  () => runRosterCli(['--run-id', 'bad-be', '--roster', fixture, '--customer', '1', '--reply-backend', 'invalid', '--dry'], { outRoot: tmp, log: () => {} }),
  /--reply-backend/,
);

const w5 = await runRosterCli(
  ['--run-id', 'dry-w5', '--roster', fixture, '--wave-size', '5', '--dry'],
  { outRoot: tmp, buildSha: 'deadbeef', log: () => {} },
);
assert.equal(w5.stopped_at, null);
assert.equal(w5.summary.waves[0].ran, 5);
assert.equal(w5.summary.waves[0].verdicts.every((v) => v.endsWith(':DRY_PASS')), true);

const stopped = await runRosterCli(
  ['--run-id', 'dry-stop', '--roster', fixture, '--ramp', '--inject-fail', '3', '--dry'],
  { outRoot: tmp, buildSha: 'deadbeef', log: () => {} },
);
assert.equal(stopped.stopped_at, 5);
assert.equal(stopped.waves.length, 2);
assert.equal(stopped.waves[0].failed, false);
assert.equal(stopped.waves[1].failed, true);
assert.equal(stopped.waves[1].result.cards.length, 3);
assert.equal(stopped.waves[1].result.cards[2].verdict, 'FAIL');
assert.equal(waveFailed(stopped.waves[1].result), true);
assert.equal(waveFailed(stopped.waves[0].result), false);

const missingSnap = readCreditSnapshot({});
assert.equal(missingSnap.ok, false);
assert.equal(missingSnap.reason, 'credit-unknown');

const snapFile = path.join(tmp, 'credits.json');
fs.writeFileSync(snapFile, JSON.stringify({ total_credits: 5, total_usage: 3.5, as_of: new Date().toISOString() }));
const goodSnap = readCreditSnapshot({ HARNESS_OPENROUTER_CREDITS_FILE: snapFile });
assert.equal(goodSnap.ok, true);
assert.equal(goodSnap.remaining, 1.5);
assert.equal(creditHeadroom({ snapshot: goodSnap, customers: 1, projectedPerCustomer: 0.25, env: {} }).ok, true);
const low = creditHeadroom({ snapshot: goodSnap, customers: 10, projectedPerCustomer: 0.25, env: {} });
assert.equal(low.ok, false);
assert.equal(low.reason, 'credit-cap');

fs.writeFileSync(snapFile, JSON.stringify({ total_credits: 5, total_usage: 0, as_of: '2020-01-01T00:00:00Z' }));
assert.equal(readCreditSnapshot({ HARNESS_OPENROUTER_CREDITS_FILE: snapFile }).ok, false);

const mcpOnlyLive = await runRamp(customers, {
  mode: 'live',
  runId: 'live-mcp-no-or',
  outRoot: tmp,
  sizes: [1],
  env: {},
  storiesFor: () => [{ ...rosterToStory(customers[0]), reply_backend: 'vk_bot_mcp' }],
  run: async (story) => ({
    story_id: story.story_id,
    reply_backend: story.reply_backend,
    verdict: 'PASS',
    reason: '',
    checks: [],
    turns: [],
    cost: { state: 'not-run', amount: null, unit: '', gap: '' },
  }),
});
assert.equal(mcpOnlyLive.stopped_at, null);

const openRouterBlocked = await runRamp(customers, {
  mode: 'live',
  runId: 'live-or-nocredit',
  outRoot: tmp,
  sizes: [1],
  env: {},
  storiesFor: () => [{ ...rosterToStory(customers[0]), reply_backend: 'openrouter' }],
});
assert.equal(openRouterBlocked.stopped_at, 1);
assert.match(openRouterBlocked.reason, /credit-unknown/);

const defaults = mediaBytes({});
assert.equal(defaults.photo, 3000000);
assert.equal(defaults.video30, 65000000);
const loaded = mediaLoad({ itineraryItems: 10, hasHotel: true }, { HARNESS_STORAGE_DOLLARS_PER_GB_MONTH: '0.02' });
assert.equal(loaded.photos, 24);
assert.equal(loaded.videos, 12);
assert.equal(loaded.video_seconds, 360);
assert.equal(loaded.storage_price_state, 'priced');
const dryLoaded = dryMediaLoad(rosterToStory(customers[0]));
assert.equal(dryLoaded.itinerary_items, 15);
assert.match(dryLoaded.source, /estimate-dry/);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('test_vk_customer_harness_ramp_stop: ok');
