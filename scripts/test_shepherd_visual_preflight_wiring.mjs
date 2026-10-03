#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VISUAL_JUDGE_MODEL,
  buildVisualJudgePrompt,
} from './shepherd-staging-smoke-visual-rubric.mjs';
import {
  visualInfraBlockedFromPreflight,
  visualPreflightReady,
  fetchOpenRouterModelRecord,
  runVisualOpenRouterPreflight,
} from './shepherd-staging-smoke-visual-preflight.mjs';

const visionModel = {
  id: VISUAL_JUDGE_MODEL,
  architecture: { input_modalities: ['text', 'image'] },
};
const preflightFetchOk = async (url, init) => {
  if (String(url).includes('/models')) {
    return { ok: true, json: async () => ({ data: [visionModel] }) };
  }
  if (init?.method === 'POST') {
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }) };
  }
  throw new Error(`unexpected fetch ${url}`);
};

const visualText = readFileSync(new URL('./shepherd-staging-smoke-visual.mjs', import.meta.url), 'utf8');
assert.match(visualText, /visualPreflightReady/);
assert.match(visualText, /writeVisualComposerVerifyMd/);

const spineText = readFileSync(new URL('./shepherd-staging-smoke-layout-visual-spine.mjs', import.meta.url), 'utf8');
assert.match(spineText, /visualPreflightReady/);

assert.equal(visualPreflightReady(null), false);
assert.equal(visualPreflightReady({ ok: true }), false);
assert.equal(visualPreflightReady({ ok: true, imageOk: true }), true);
assert.equal(visualInfraBlockedFromPreflight(null).infraDetail.reason, 'visual_openrouter_preflight_missing');

const chatPrompt = buildVisualJudgePrompt({
  screenLabel: 'v1 composer 390',
  pageKind: 'chat',
  stateId: 'v1',
  tabLabel: '',
  viewport: { width: 390, height: 844 },
  screenSpecText: 'spec',
  specSource: 'test',
  layoutDomFacts: 'LAYOUT DOM ground truth: PASS',
});
assert.match(chatPrompt, /form#composer/);
assert.match(chatPrompt, /icon-only up-arrow|paper-plane/i);
assert.match(chatPrompt, /accessible name Send/);

const listed = await fetchOpenRouterModelRecord(VISUAL_JUDGE_MODEL, { apiKey: 'test-key', fetchImpl: preflightFetchOk });
assert.equal(listed.ok, true);
assert.ok(listed.inputModalities.includes('image'));

const blocked = await runVisualOpenRouterPreflight({
  apiKey: 'test-key',
  fetchImpl: async (url) => {
    if (String(url).includes('/models')) {
      return { ok: true, json: async () => ({ data: [{ id: VISUAL_JUDGE_MODEL, architecture: { input_modalities: ['text'] } }] }) };
    }
    return { ok: true, text: async () => '{}' };
  },
});
assert.equal(blocked.ok, false);
assert.equal(blocked.checkStatus, 'INFRA_BLOCKED');

const ok = await runVisualOpenRouterPreflight({ apiKey: 'test-key', fetchImpl: preflightFetchOk });
assert.equal(ok.ok, true);
assert.equal(ok.imageOk, true);

console.log('shepherd visual preflight wiring tests passed');
