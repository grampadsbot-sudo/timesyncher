#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cannedWelcomeLiveTurn } from '../src/vacation/onboarding-welcome.mjs';
import { FIXED_OPENER_REASON, LIVE_OPENER_PRODUCER, LIVE_REPLY_PRODUCER } from '../src/vacation/live-app-turn.mjs';
import { assertLiveTranscript } from './live-transcript-dialog-pdf.mjs';

const renderer = fs.readFileSync(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url), 'utf8');
assert.match(renderer, /app text did not come from \$\{LIVE_REPLY_PRODUCER\}/);

const welcome = cannedWelcomeLiveTurn({
  text: 'Welcome, Avery. Tell me about the trip.',
  at: '2026-09-25T21:00:00.000Z',
  latencyMs: 12,
  sessionE2eMs: 12,
});
assert.equal(welcome.replyProducer, LIVE_OPENER_PRODUCER);
assert.equal(welcome.fixedOpener, true);
assert.equal(welcome.latencyMs, null);
assert.equal(welcome.sessionE2eMs, null);
assert.equal(welcome.jevScoreDraft, null);
assert.equal(welcome.jev.jevRan, false);
assert.equal(welcome.jev.reason, FIXED_OPENER_REASON);

const customer = {
  turnIndex: 2,
  role: 'customer',
  modality: 'text',
  text: 'Harbor morning plan for Avery',
  at: '2026-09-25T21:00:01.000Z',
  latencyMs: 12,
  sessionE2eMs: 12,
  jev: { jevRan: true, modelTier: 2, routeType: 'general', extraContext: { routeType: 'general' } },
};
const app = {
  turnIndex: 3,
  role: 'app',
  modality: 'text',
  text: 'Start with the harbor walk, then keep the afternoon open.',
  at: '2026-09-25T21:00:03.000Z',
  latencyMs: 2800,
  sessionE2eMs: 3000,
  jev: {
    jevRan: true,
    modelTier: 2,
    routeType: 'general',
    extraContext: { routeType: 'general' },
    responseModel: 'anthropic/claude-haiku-5.5',
    jevLatencyMs: 400,
    jevBeforeModel: true,
  },
  replyProducer: LIVE_REPLY_PRODUCER,
  invented: false,
  modelId: 'anthropic/claude-haiku-5.5',
  beats: ['harbor morning plan'],
  jevLatencyMs: 400,
  genLatencyMs: 2400,
  jevBeforeModel: true,
  quality: {
    judged: true,
    score: 4,
    comment: 'Harbor morning is answered cleanly, a 4 carried by afternoon open.',
    rewritten: false,
    model: 'typesafe/jev-1.13',
    judgeMs: 400,
  },
  shippedModel: 'anthropic/claude-haiku-5.5',
  draftModel: 'anthropic/claude-haiku-5.5',
  jevScoreDraft: 4,
  jevNote: 'Harbor morning is answered cleanly, a 4 carried by afternoon open.',
  flagged: false,
  modelLatency: { draft: 2400, rewrite: null, total: 2400 },
};
const doc = {
  live: true,
  capture: 'live-vacation-app',
  targetPerson: 'Avery',
  turns: [welcome, customer, app],
};
assert.equal(assertLiveTranscript(doc).turns[0].replyProducer, LIVE_OPENER_PRODUCER);

const unstamped = {
  ...welcome,
  replyProducer: undefined,
  fixedOpener: undefined,
  latencyMs: 12,
  sessionE2eMs: 12,
};
assert.throws(
  () => assertLiveTranscript({ ...doc, turns: [unstamped, customer, app] }),
  /turn 1 app text did not come from vacation-app-reply-rules/,
);

console.log('test_onboarding_welcome_dialog_opener: ok');
