#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCustomer } from './harness/customer.mjs';
import { guardedFetch, loadBannedHosts } from './harness/fetch-guard.mjs';
import { playCustomerTurns } from './harness/live-play.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const hosts = loadBannedHosts();
assert.ok(hosts.length > 0);
let blockedCalls = 0;
const guard = guardedFetch(() => { blockedCalls += 1; }, hosts);
await assert.rejects(() => guard(`https://${hosts[0]}/api/v1/chat`), /harness blocked a model host/);
assert.equal(blockedCalls, 0);
await assert.rejects(() => guard('https://vacation-staging.timesyncher.com/tts'), /speech host/);

const calls = [];
const fetchImpl = guardedFetch(async (url) => {
  calls.push(String(url));
  const parsed = new URL(String(url));
  if (parsed.pathname === '/api/version') return { status: 200, text: async () => JSON.stringify({ sha: 'abc123' }) };
  return { status: 201, text: async () => JSON.stringify({ ok: true, status: 'replied', reply: 'The harbor walk stays light.', modelId: 'anthropic/claude-haiku-5.5', responseModel: 'anthropic/claude-haiku-5.5' }) };
}, hosts);
const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
story.reply_backend = 'openrouter';
const played = await playCustomerTurns(story, {
  origin: 'https://vacation-staging.timesyncher.com',
  token: 'fixture-session',
  tripId: '11111111-2222-4333-8444-555555555555',
  fetchImpl,
  hosts,
});
assert.equal(played.reason, '');
assert.ok(calls.length >= story.turns.length);
for (const call of calls) {
  assert.equal(hosts.some((host) => call.includes(host)), false);
  assert.equal(new URL(call).origin, 'https://vacation-staging.timesyncher.com');
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mcp-'));
let mcpCalls = 0;
const mcpStory = structuredClone(story);
mcpStory.reply_backend = 'vk_bot_mcp';
const card = await runCustomer(mcpStory, {
  runId: 'r1',
  outDir: dir,
  fetchImpl: () => { mcpCalls += 1; },
  play: () => { mcpCalls += 1; throw new Error('played'); },
  cleanup: async () => ({ deleted: {}, remaining: 0 }),
});
assert.equal(mcpCalls, 0);
assert.equal(card.reason, 'backend-not-available');
assert.equal(card.wave_stop, true);
assert.match(card.checks.find((check) => check.id === 'backend-available').detail, /backend not available/);
fs.rmSync(dir, { recursive: true, force: true });

const files = fs.readdirSync(path.join(root, 'scripts/harness')).filter((name) => name.endsWith('.mjs'));
files.push('vk-customer-harness.mjs');
for (const name of files) {
  const text = fs.readFileSync(path.join(root, 'scripts', name.startsWith('vk-') ? name : `harness/${name}`), 'utf8');
  for (const host of hosts) assert.equal(text.includes(host), false, name);
}
console.log('test_vk_customer_harness_no_openrouter: ok');
