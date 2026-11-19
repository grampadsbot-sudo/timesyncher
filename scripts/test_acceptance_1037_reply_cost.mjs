#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readStoredCost, rollupCost } from './harness/cost.mjs';
import { runCustomer } from './harness/customer.mjs';

const measured = {
  status: 'measured',
  dollars: 0.0025,
  currency: 'USD',
  source: 'openrouter_usage_cost',
  promptTokens: 100,
  completionTokens: 40,
  totalTokens: 140,
};
const second = { ...measured, dollars: 0.0015 };
assert.equal(readStoredCost({ cost: measured, backend: 'openrouter' }, 'openrouter').amount, 0.0025);
assert.equal(readStoredCost({ cost: measured, backend: 'openrouter' }, 'openrouter').state, 'measured');
assert.equal(readStoredCost({ total_tokens: 1000 }, 'openrouter').gap, 'stored-cost-missing');
assert.equal(readStoredCost({ cost: { status: 'unmeasured', dollars: null } }, 'openrouter').state, 'unmeasured');
assert.equal(readStoredCost({ generationCost: 1.25 }, 'openrouter').amount, 1.25);

const summed = rollupCost([
  { role: 'app', cost_state: 'measured', cost_amount: 0.0025, cost_unit: 'usd', gap: '' },
  { role: 'app', cost_state: 'measured', cost_amount: 0.0015, cost_unit: 'usd', gap: '' },
]);
assert.equal(summed.state, 'measured');
assert.equal(summed.per_customer, 0.004);
assert.equal(summed.per_100, 0.4);
const missing = rollupCost([
  { role: 'app', cost_state: 'missing', cost_amount: null, cost_unit: '', gap: 'stored-cost-missing' },
]);
assert.equal(missing.gap, 'stored-cost-missing');
assert.equal(missing.per_customer, null);
assert.equal(missing.per_100, null);

function appTurn(n, cost) {
  return {
    turnIndex: n,
    role: 'app',
    fixedOpener: false,
    replyProducer: 'vacation-app-reply-rules',
    modelId: 'anthropic/claude-haiku-5.5',
    genLatencyMs: 1283,
    jev: { jevRan: true, modelTier: 1 },
    quality: { judged: true, score: 4 },
    backend: 'openrouter',
    model: { responseModel: 'anthropic/claude-haiku-5.5', backend: 'openrouter', cost },
    cost,
  };
}

const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
story.reply_backend = 'openrouter';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-reply-cost-'));
const card = await runCustomer(story, {
  runId: 'r-cost',
  outDir: dir,
  secrets: [],
  cleanup: async () => ({ deleted: {}, remaining: 0 }),
  play: async () => ({
    transcript: { turns: [appTurn(3, measured), appTurn(5, second)] },
    pdfText: 'anthropic/claude-haiku-5.5 openrouter',
    liveShaStart: 'abc',
    liveShaEnd: 'abc',
    dialogOk: true,
    dialogRefused: false,
    keepsakeOk: true,
    screensOk: true,
    videoExists: true,
    videoPass: true,
    chromeOk: true,
    steps: [],
    itineraryCount: 1,
  }),
});
assert.equal(card.reason, '');
assert.equal(card.turns.length, 2);
assert.equal(card.turns[0].cost_amount, 0.0025);
assert.equal(card.turns[1].cost_amount, 0.0015);
assert.equal(card.cost.state, 'measured');
assert.equal(card.cost.per_customer, 0.004);
assert.equal(card.cost.per_100, 0.4);

const rules = fs.readFileSync(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
assert.match(rules, /usage: \{ include: true \}/);

console.log('test_acceptance_1037_reply_cost: ok');
