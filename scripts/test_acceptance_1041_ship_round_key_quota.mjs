#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DRY_RUN_KEY_DAILY_CAP_USD, withDryRunCapShare } from './harness/cost.mjs';
import { runCustomer } from './harness/customer.mjs';
import { OPENROUTER_KEY_URL } from './vacation-app-reply-rules.mjs';
import { applyDryRunCard, doorbellReasons, dryRunRecorded, rememberCustomerCost } from './host/vk_ship_round_core.mjs';
import { markEnvBlocked } from './host/vk_ship_dry_env.mjs';
import {
  DRY_RUN_COST_FLOOR_USD,
  customerBudgetUsd,
  dryRunQuotaGate,
  keyLimitReason,
  nextQuotaReset,
  parseKeyPayload,
  providerQuotaReason,
  readDryRunKeyQuota,
} from './host/vk_ship_key_quota.mjs';

const OUTPUTS = ['dialog-pdf', 'keepsake-pdf', 'screens', 'video-check', 'scorecard'];
const RESET = '2026-11-26T00:00:00.000Z';
const GAP = `Key limit exceeded (daily limit). Manage it using [redacted-url] $1.00 of $1.00 used; resets ${RESET}.`;
const FIXTURE_KEY = 'fixture-key-quota';

assert.equal(DRY_RUN_KEY_DAILY_CAP_USD, 1);
assert.equal(DRY_RUN_COST_FLOOR_USD, 0.25);
assert.equal(customerBudgetUsd(null), 0.25);
assert.equal(customerBudgetUsd(0), 0.25);
assert.equal(customerBudgetUsd(0.04), 0.04);
assert.equal(nextQuotaReset('daily', new Date('2026-11-25T18:40:00.000Z')), RESET);
assert.equal(nextQuotaReset('weekly', new Date('2026-11-25T18:40:00.000Z')), '2026-11-30T00:00:00.000Z');
assert.equal(nextQuotaReset('monthly', new Date('2026-11-25T18:40:00.000Z')), '2026-12-01T00:00:00.000Z');

const parsed = parseKeyPayload({
  data: {
    label: FIXTURE_KEY,
    limit: 1,
    limit_remaining: 0,
    limit_reset: 'daily',
    usage_daily: 1,
    effective_budget: { limit_usd: 1, remaining_usd: 0, spend_usd: 1, reset_interval: 'daily', resets_at: RESET },
  },
}, new Date('2026-11-25T18:40:00.000Z'));
assert.equal(parsed.remaining, 0);
assert.equal(parsed.limit, 1);
assert.equal(parsed.resetAt, RESET);
assert.equal(JSON.stringify(parsed).includes(FIXTURE_KEY), false);
assert.equal(parseKeyPayload({ data: { limit: 1, usage_daily: 0.2, limit_reset: 'daily' } }, new Date('2026-11-25T18:40:00.000Z')).remaining, 0.8);

function card(extra = {}) {
  return {
    verdict: 'FAIL',
    reason: 'key-limit',
    checks: OUTPUTS.map((id) => ({ id, pass: id === 'scorecard' })),
    turns: [
      { n: 1, role: 'app', stored_model: 'non-model greeting', cost_amount: null, gap: GAP },
      { n: 2, role: 'customer', stored_model: '', cost_amount: null, gap: '' },
    ],
    cost: { per_customer: null, per_100: null, unit: '' },
    cleanup: { remaining: 0 },
    ...extra,
  };
}

const incident = applyDryRunCard({ dryRun: { ran: true, sha: '6fbe8dac4925525577f8cccd7ecf9cf8c3545a5c' }, needsRebase: [], errors: [] }, card());
assert.equal(incident.dryRun.blockedEnv, true);
assert.equal(incident.dryRun.verdict, '');
assert.equal(incident.dryRun.reason, `blocked: env key-limit resets ${RESET}`);
assert.equal(incident.dryRun.outputs.scorecard, true);
assert.equal(incident.dryRun.outputs['dialog-pdf'], false);
assert.equal(incident.dryRun.outputs['keepsake-pdf'], false);
assert.equal(incident.dryRun.outputs.screens, false);
assert.equal(incident.dryRun.outputs['video-check'], false);
assert.equal(incident.dryRun.per_customer, null);
assert.equal(dryRunRecorded(incident.dryRun), false);
assert.equal(doorbellReasons(incident, {}).includes('new-failure'), false);
assert.equal(doorbellReasons(incident, {}).includes('blocked: env'), true);
assert.equal(doorbellReasons(incident, { reason: incident.dryRun.reason }).includes('blocked: env'), false);
assert.equal(doorbellReasons(incident, { reason: incident.dryRun.reason }).includes('new-failure'), false);

const payment = applyDryRunCard({ dryRun: { ran: true }, needsRebase: [], errors: [] }, card({
  reason: 'payment-required',
  turns: [],
  turn_http: { post_status: 402, body: { error: 'Payment required' } },
}));
assert.equal(payment.dryRun.blockedEnv, true);
assert.equal(payment.dryRun.verdict, '');
assert.equal(payment.dryRun.reason, 'blocked: env key-limit');
assert.equal(doorbellReasons(payment, {}).includes('new-failure'), false);

const quota429 = applyDryRunCard({ dryRun: { ran: true }, needsRebase: [], errors: [] }, card({
  reason: 'turn-not-stored',
  turns: [],
  turn_http: { post_status: 429, body: { error: 'Rate limit exceeded: free-models-per-day (daily limit reached)' } },
}));
assert.equal(quota429.dryRun.blockedEnv, true);
assert.equal(quota429.dryRun.verdict, '');
assert.equal(doorbellReasons(quota429, {}).includes('new-failure'), false);

const plain429 = applyDryRunCard({ dryRun: { ran: true }, needsRebase: [], errors: [] }, card({
  reason: 'turn-not-stored',
  turns: [{ n: 1, role: 'app', gap: 'slow down' }],
  turn_http: { post_status: 429, body: { error: 'slow down' } },
}));
assert.equal(plain429.dryRun.blockedEnv, false);
assert.equal(plain429.dryRun.verdict, 'FAIL');
assert.equal(plain429.dryRun.reason, 'turn-not-stored');
assert.equal(doorbellReasons(plain429, {}).includes('new-failure'), true);

const product = applyDryRunCard({ dryRun: { ran: true }, needsRebase: [], errors: [] }, card({
  reason: 'stored-cost-missing',
  turns: [],
  checks: [],
}));
assert.equal(product.dryRun.blockedEnv, false);
assert.equal(product.dryRun.verdict, 'FAIL');
assert.equal(doorbellReasons(product, {}).includes('new-failure'), true);
assert.equal(providerQuotaReason(card()), `blocked: env key-limit resets ${RESET}`);

const deferred = {
  dryRun: markEnvBlocked({ ran: true }, 'sha', 'dry-run-20261125-1830-openrouter', keyLimitReason(RESET)),
  needsRebase: [],
  errors: [],
};
assert.equal(deferred.dryRun.ran, false);
assert.equal(doorbellReasons(deferred, {}).includes('new-failure'), false);
assert.equal(doorbellReasons(deferred, {}).includes('blocked: env'), true);
assert.deepEqual(doorbellReasons(deferred, { reason: deferred.dryRun.reason }), []);

const measured = applyDryRunCard({ dryRun: { ran: true }, needsRebase: [], errors: [] }, {
  verdict: 'PASS',
  reason: '',
  checks: OUTPUTS.map((id) => ({ id, pass: true })),
  turns: [],
  cost: { state: 'measured', unit: 'usd', per_customer: 0.04, per_100: 4, daily_cap_usd: 1, daily_cap_fraction: 0.04 },
  cleanup: { remaining: 0 },
});
assert.equal(measured.dryRun.verdict, 'PASS');
assert.equal(measured.dryRun.blockedEnv, false);
assert.equal(measured.dryRun.daily_cap_usd, 1);
assert.equal(measured.dryRun.daily_cap_fraction, 0.04);
assert.equal(rememberCustomerCost(null, measured.dryRun), 0.04);
assert.equal(rememberCustomerCost(0.04, incident.dryRun), 0.04);
assert.equal(rememberCustomerCost(0.04, { blockedEnv: false, per_customer: null, cost_unit: 'usd' }), 0.04);

const calls = [];
const exhausted = await readDryRunKeyQuota({
  env: { OPENROUTER_API_KEY: FIXTURE_KEY },
  now: new Date('2026-11-25T18:40:00.000Z'),
  fetchImpl: async (url, init) => {
    calls.push({ url: String(url), method: init.method, authorization: init.headers.Authorization });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { label: FIXTURE_KEY, limit: 1, limit_remaining: 0, limit_reset: 'daily', effective_budget: { resets_at: RESET, remaining_usd: 0, limit_usd: 1 } } }),
    };
  },
});
assert.equal(calls.length, 1);
assert.equal(calls[0].url, OPENROUTER_KEY_URL);
assert.equal(new URL(OPENROUTER_KEY_URL).pathname, '/api/v1/key');
assert.equal(calls[0].method, 'GET');
assert.equal(calls[0].authorization, `Bearer ${FIXTURE_KEY}`);
const { secret, ...pub } = exhausted;
assert.equal(secret, FIXTURE_KEY);
assert.equal(JSON.stringify(pub).includes(FIXTURE_KEY), false);
const blockedGate = dryRunQuotaGate(pub, null);
assert.equal(blockedGate.skip, true);
assert.equal(blockedGate.needed, 0.25);
assert.equal(blockedGate.reason, `blocked: env key-limit resets ${RESET}`);
assert.equal(blockedGate.reason.includes(FIXTURE_KEY), false);
assert.equal(dryRunQuotaGate({ limited: true, remaining: 1, resetAt: '2026-11-27T00:00:00.000Z', block: '' }, null).skip, false);
assert.equal(dryRunQuotaGate({ limited: true, remaining: 0.04, resetAt: RESET, block: '' }, 0.04).skip, false);
assert.equal(dryRunQuotaGate({ limited: true, remaining: 0.03, resetAt: RESET, block: '' }, 0.04).reason, `blocked: env key-limit resets ${RESET}`);

const vercelKey = 'fixture-key-from-vercel';
const vercelUrls = [];
const fromVercel = await readDryRunKeyQuota({
  env: { VERCEL_TOKEN: 'vt_fixture', VERCEL_TEAM_ID: 'team_fixture', VERCEL_PROJECT_ID: 'timesyncher-vacation-staging' },
  tokenFile: '/missing-token',
  exists: () => false,
  readFile: () => { throw new Error('missing'); },
  fetchImpl: async (url, init) => {
    const target = String(url);
    vercelUrls.push(target);
    assert.equal(target.includes(vercelKey), false);
    assert.equal(String(init.body || '').includes(vercelKey), false);
    if (target === OPENROUTER_KEY_URL) {
      return { ok: true, status: 200, json: async () => ({ data: { limit: 1, limit_remaining: 0.9, limit_reset: 'daily', effective_budget: { resets_at: '2026-11-27T00:00:00.000Z' } } }) };
    }
    if (target.includes('/v9/')) return { ok: true, status: 200, json: async () => ({ envs: [{ id: 'env_or', key: 'OPENROUTER_API_KEY' }] }) };
    return { ok: true, status: 200, json: async () => ({ key: 'OPENROUTER_API_KEY', value: vercelKey }) };
  },
});
assert.equal(vercelUrls.some((url) => url.includes('/v9/projects/timesyncher-vacation-staging/env')), true);
assert.equal(vercelUrls.some((url) => url.includes('decrypt=true')), true);
assert.equal(fromVercel.remaining, 0.9);
assert.equal(fromVercel.secret, vercelKey);
assert.equal(JSON.stringify({ ...fromVercel, secret: '' }).includes(vercelKey), false);
assert.equal(dryRunQuotaGate(fromVercel, 0.04).skip, false);

const unread = await readDryRunKeyQuota({
  env: { OPENROUTER_API_KEY: FIXTURE_KEY },
  fetchImpl: async () => { throw new Error(`network ${FIXTURE_KEY}`); },
});
assert.equal(unread.block, 'blocked: env key-quota unread');
assert.equal(unread.block.includes(FIXTURE_KEY), false);
assert.equal(dryRunQuotaGate(unread, 0.04).skip, true);
assert.equal(dryRunQuotaGate(unread, 0.04).reason.includes(FIXTURE_KEY), false);

const http402 = await readDryRunKeyQuota({
  env: { OPENROUTER_API_KEY: FIXTURE_KEY },
  now: new Date('2026-11-25T18:40:00.000Z'),
  fetchImpl: async () => ({ ok: false, status: 402, json: async () => ({ data: { limit_reset: 'daily' } }) }),
});
assert.equal(http402.limited, true);
assert.equal(http402.remaining, 0);
assert.equal(http402.block, '');
assert.equal(dryRunQuotaGate(http402, 0.04).reason, `blocked: env key-limit resets ${RESET}`);

const quotaSource = fs.readFileSync(new URL('./host/vk_ship_key_quota.mjs', import.meta.url), 'utf8');
assert.equal(quotaSource.includes(new URL(OPENROUTER_KEY_URL).host), false);
assert.match(quotaSource, /OPENROUTER_KEY_URL/);
assert.equal(quotaSource.includes('PATCH'), false);
assert.equal(quotaSource.includes("method: 'POST'"), false);
assert.equal(quotaSource.includes('console.'), false);
assert.equal(quotaSource.includes('process.stdout'), false);
const roundJs = fs.readFileSync(new URL('./host/vk_ship_round.mjs', import.meta.url), 'utf8');
const quotaAt = roundJs.indexOf('readDryRunKeyQuota');
const spawnAt = roundJs.indexOf("scripts/vk-customer-harness.mjs");
assert.ok(quotaAt > 0 && spawnAt > quotaAt);
const launcher = fs.readFileSync(new URL('./host/vk_ship_round.sh', import.meta.url), 'utf8');
assert.match(launcher, /^SHIP_ROUND_VERSION=2$/m);
const dryEnv = fs.readFileSync(new URL('./host/vk_ship_dry_env.mjs', import.meta.url), 'utf8');
assert.equal(dryEnv.includes('OPENROUTER'), false);

const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-dry-run-cap-'));
try {
  const played = {
    reason: '',
    pdfText: 'anthropic/claude-haiku-5.5 openrouter',
    dialogOk: true,
    keepsakeOk: true,
    screensOk: true,
    onboardingPdfOk: true,
    videoExists: true,
    videoPass: true,
    videoDetail: 'present',
    chromeOk: true,
    liveShaStart: 'abc',
    liveShaEnd: 'abc',
    transcript: {
      turns: [{
        turnIndex: 2,
        role: 'app',
        text: 'Harbor walk is set.',
        modelId: 'anthropic/claude-haiku-5.5',
        replyBackend: 'openrouter',
        jev: { jevRan: true, responseModel: 'anthropic/claude-haiku-5.5' },
        quality: { judged: true, score: 4 },
        generationCost: 0.04,
      }],
    },
  };
  const scored = await runCustomer({ ...story, reply_backend: 'openrouter' }, {
    runId: 'cap-share',
    outDir: dir,
    secrets: [],
    cleanup: async () => ({ deleted: {}, remaining: 0 }),
    play: async () => played,
  });
  assert.equal(scored.verdict, 'PASS');
  assert.equal(scored.cost.per_customer, 0.04);
  assert.equal(scored.cost.daily_cap_usd, 1);
  assert.equal(scored.cost.daily_cap_fraction, 0.04);
  const written = fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8');
  assert.match(written, /"daily_cap_usd": 1/);
  assert.match(written, /"daily_cap_fraction": 0\.04/);
  assert.equal(written.includes(FIXTURE_KEY), false);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

const other = withDryRunCapShare({ state: 'measured', unit: 'usd', per_customer: 0.04, amount: 0.04 }, 'other-story');
assert.equal(other.daily_cap_usd, undefined);
const notRun = withDryRunCapShare({ state: 'not-run', unit: '', per_customer: null }, 'dry-run');
assert.equal(notRun.daily_cap_usd, undefined);

console.log('test_acceptance_1041_ship_round_key_quota: ok');
