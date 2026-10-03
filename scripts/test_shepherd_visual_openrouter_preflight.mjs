#!/usr/bin/env node
import assert from 'node:assert/strict';
import { fetchOpenRouterModelRecord, runVisualOpenRouterPreflight } from './shepherd-staging-smoke-visual-preflight.mjs';
import { VISUAL_JUDGE_MODEL } from './shepherd-staging-smoke-visual-rubric.mjs';

const visionModel = {
  id: VISUAL_JUDGE_MODEL,
  architecture: { input_modalities: ['text', 'image'] },
};

const fetchImpl = async (url, init) => {
  if (String(url).includes('/models')) {
    return { ok: true, json: async () => ({ data: [visionModel] }) };
  }
  if (init?.method === 'POST') {
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }) };
  }
  throw new Error(`unexpected fetch ${url}`);
};

const listed = await fetchOpenRouterModelRecord(VISUAL_JUDGE_MODEL, { apiKey: 'test-key', fetchImpl });
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

const ok = await runVisualOpenRouterPreflight({ apiKey: 'test-key', fetchImpl });
assert.equal(ok.ok, true);
assert.equal(ok.model, VISUAL_JUDGE_MODEL);

console.log('visual openrouter preflight tests passed');
