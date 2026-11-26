#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  DEFAULT_JEV_DECISIONS_URL,
  JEV_QUALITY_MODEL,
  jevQualityRewrite,
} from './vacation-app-reply-rules.mjs';
import { classifyTripIntake } from '../src/vacation/trip-intake-classify.mjs';
import { jevRelevanceScore } from '../src/vacation/place-relevance-judge.mjs';
import { jevTurn } from '../src/vacation/jev-turn.mjs';
import { withOpenRouterLedger } from '../src/vacation/openrouter-call-ledger.mjs';

const DATED = 'typesafe/jev-1.13-20260917';
assert.equal(JEV_QUALITY_MODEL, DATED);

const decisionsBodies = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  if (href.includes('/api/alpha/decisions')) {
    const body = init.body ? JSON.parse(init.body) : {};
    decisionsBodies.push(body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        answers: body.questions?.trip_intake
          ? { trip_intake: { noul: 0.9 } }
          : body.questions?.relevance
            ? { relevance: { type: 'score', score: 3 } }
            : {
              route_type: { choice: 'general' },
              overall_quality: { score: 3 },
              disposition: { choice: 'keep' },
              fix_focus: { choice: 'keep' },
            },
      }),
    };
  }
  if (href.includes('/chat/completions')) {
    const body = init.body ? JSON.parse(init.body) : {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: body.model,
        choices: [{ message: { content: '{"turnKind":"other","things":[],"roster":[],"target":"","anchor":"","category":"","targetKind":"","question":"","destination":"Bend","title":"Bend","hasDates":false}' } }],
      }),
    };
  }
  throw new Error(`unexpected fetch ${href}`);
};

const env = {
  OPENROUTER_API_KEY: 'test-key',
  TIMESYNCHER_JEV_CLASSIFY_URL: DEFAULT_JEV_DECISIONS_URL,
};

try {
  await withOpenRouterLedger(async () => {
    await jevTurn({
      customerTurn: 'Thursday is a town walk.',
      draft: 'Thursday can stay open for a town walk.',
      env,
    });
    await jevQualityRewrite({
      customerTurn: 'Thursday is a town walk.',
      draft: 'Thursday can stay open for a town walk.',
      env,
      purpose: 'jev_quality',
    });
    await classifyTripIntake({
      text: 'We are planning Bend March 4-8 2027.',
      env,
      fetchImpl: globalThis.fetch,
    });
    await jevRelevanceScore(
      { id: 'poi-1', name: 'Trailhead', category: 'activity', target: 'hike', area: 'Bend' },
      { apiKey: 'test-key', env, fetchImpl: globalThis.fetch },
    );
  });

  assert.ok(decisionsBodies.length >= 4, 'expected decisions calls across jev sites');
  for (const body of decisionsBodies) {
    assert.equal(body.model, DATED, `Jev request model must be ${DATED}`);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('test_jev_request_model_id: ok');