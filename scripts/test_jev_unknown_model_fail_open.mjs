#!/usr/bin/env node
import assert from 'node:assert/strict';
import { classifyTripIntake } from '../src/vacation/trip-intake-classify.mjs';
import { FOLLOWUP_SAMPLE, INTAKE_SAMPLE, withMockedTurnPipeline } from './fixtures/harness/turn-call-replay.mjs';
import { DEFAULT_JEV_DECISIONS_URL, openRouterChatVisibleText } from './vacation-app-reply-rules.mjs';

const JEV_400_BODY = { detail: { error_type: 'api_usage_error', message: 'Unknown model: jev-1.13.0' } };

function jev400Response() {
  return Response.json(JEV_400_BODY, { status: 400 });
}

await withMockedTurnPipeline(async ({ send, stored }) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const route = new URL(url).pathname;
    if (route === '/api/alpha/decisions') return jev400Response();
    return originalFetch(url, init);
  };
  try {
    const turn = await send(FOLLOWUP_SAMPLE);
    assert.equal(turn.ok, true, turn.error || 'ordinary turn should succeed');
    assert.equal(turn.status, 'replied');
    assert.ok(turn.reply?.includes('town walk') || turn.reply === FOLLOWUP_SAMPLE.reply);
    const jevRow = turn.openrouterCalls.find((row) => row.purpose === 'jev_turn');
    assert.ok(jevRow, 'jev_turn ledger row');
    assert.equal(jevRow.ok, false);
    assert.equal(jevRow.httpStatus, 400);
    const appTurn = stored.find((row) => row.speaker === 'app') || null;
    const live = appTurn?.payload?.liveTranscript;
    assert.equal(live?.jev?.judgeFailed, true);
    assert.equal(live?.quality?.judgeFailed, true);
    assert.equal(live?.quality?.judged, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await withMockedTurnPipeline(async ({ send }) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const route = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : {};
    if (route === '/api/alpha/decisions') return jev400Response();
    if (route === '/api/v1/chat/completions' && body.messages) {
      const system = openRouterChatVisibleText(body.messages.find((message) => message.role === 'system')?.content);
      const user = body.messages.find((message) => message.role === 'user')?.content || '';
      if (system.includes('one or two sentence holding line')) {
        return Response.json({ model: body.model, choices: [{ message: { content: 'Working on that rewrite now.' } }] });
      }
      if (user.includes('WHAT_I_CHANGED')) {
        return Response.json({ model: body.model, choices: [{ message: { content: 'Rewritten line for the walk.\nWHAT_I_CHANGED: Kept the walk.\nBEAT: walk' } }] });
      }
    }
    return originalFetch(url, init);
  };
  try {
    const turn = await send({
      ...FOLLOWUP_SAMPLE,
      text: 'Make Thursday only the neighborhood walk.',
      reply: 'Thursday stays open for the neighborhood afternoon.',
      rewrite: 'Thursday is only the neighborhood walk you asked for.\nWHAT_I_CHANGED: Named the walk.\nBEAT: walk',
    });
    assert.equal(turn.ok, true, turn.error || 'rewrite turn should fail open');
    assert.ok(turn.reply);
    const jevRow = turn.openrouterCalls.find((row) => row.purpose === 'jev_turn');
    assert.ok(jevRow);
    assert.equal(jevRow.ok, false);
    assert.equal(jevRow.httpStatus, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const env = { OPENROUTER_API_KEY: 'test-key', TIMESYNCHER_JEV_CLASSIFY_URL: DEFAULT_JEV_DECISIONS_URL };
const intakeFetch = async (url, init = {}) => {
  const href = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  if (href.includes('/api/alpha/decisions')) return jev400Response();
  if (href.includes('/chat/completions')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: body.model,
        choices: [{ message: { content: '{"turnKind":"trip_intake","things":[],"roster":[],"destination":"Bend","title":"Bend trip","hasDates":true,"startDate":"2027-03-04","endDate":"2027-03-08"}' } }],
      }),
    };
  }
  throw new Error(`unexpected ${href}`);
};
const classified = await classifyTripIntake({
  text: INTAKE_SAMPLE.text,
  env,
  fetchImpl: intakeFetch,
});
assert.equal(classified.ok, true, classified.error || 'intake classify should fail open');
assert.notEqual(classified.error, 'turn_classifier_failed');

console.log('test_jev_unknown_model_fail_open: ok');