#!/usr/bin/env node
import assert from 'node:assert/strict';
import { LIVE_REPLY_PRODUCER, LIVE_TRANSCRIPT_CAPTURE } from '../src/vacation/live-app-turn.mjs';
import { INTERIM_MODEL } from './vacation-app-reply-rules.mjs';
import { assertLiveTranscript, extractPdfText, renderLiveTranscriptPdf } from './live-transcript-dialog-pdf.mjs';

const MODEL = 'anthropic/claude-haiku-5.5';
const customer = {
  turnIndex: 20, role: 'customer', modality: 'text', text: 'Keep the harbor morning open.',
  at: '2026-09-25T21:00:00.000Z', latencyMs: 12, sessionE2eMs: 12,
  jev: { jevRan: true, modelTier: 2, routeType: 'general', via: 'openrouter-decisions' },
};
function appTurn(extra) {
  return {
    turnIndex: 21, role: 'app', modality: 'text',
    text: 'The harbor walk still opens the morning, and the afternoon stays open.',
    at: '2026-09-25T21:00:03.000Z', latencyMs: 2800, sessionE2eMs: 3000,
    jev: { jevRan: true, modelTier: 2, routeType: 'general', via: 'openrouter-decisions', responseModel: MODEL, jevLatencyMs: 400, jevBeforeModel: true },
    replyProducer: LIVE_REPLY_PRODUCER, invented: false, modelId: MODEL, jevLatencyMs: 400, genLatencyMs: 2400, jevBeforeModel: true,
    quality: { judged: true, score: 4, comment: 'Harbor morning stays open.', rewritten: true, model: 'typesafe/jev-1.13', judgeMs: 400, rewriteModel: MODEL, draft: 'Start with the harbor walk.' },
    shippedModel: MODEL, draftModel: MODEL, rewriteModel: MODEL,
    rewriteText: 'The harbor walk still opens the morning, and the afternoon stays open.',
    rewriteAttempts: [{ text: 'The harbor walk still opens the morning, and the afternoon stays open.', model: MODEL, score: 5, ms: 1200, error: null }],
    jevScoreDraft: 4, jevScoreRewrite: 5, jevNote: null, jevNoteReason: 'jev_no_free_text',
    rewriterChange: 'Kept the harbor morning.', flagged: false,
    modelLatency: { draft: 2400, rewrite: 1200, total: 3600 },
    interimReply: { text: null, model: null, ms: null, judge: null },
    ...extra,
  };
}
function doc(turn) {
  return {
    live: true, capture: LIVE_TRANSCRIPT_CAPTURE, targetPerson: 'Sofia',
    deployBanner: 'live 0123456789abcdef0123456789abcdef01234567 https://vacation-staging.timesyncher.com',
    turns: [customer, turn],
  };
}

const missing = doc(appTurn());
const flagged = assertLiveTranscript(missing);
assert.deepEqual(flagged.interimFlags, ['turn 21 rewrite has no real interim reply']);
const pdf = extractPdfText(renderLiveTranscriptPdf(missing));
assert.match(pdf, /FLAG\.\s+turn 21 rewrite has no real interim reply\.\s+Not invented/);
assert.match(pdf, /interimReply\.text:\s*none/);
assert.doesNotMatch(pdf, /Got it\. I saved that/);
assert.equal(INTERIM_MODEL, MODEL);

const real = doc(appTurn({
  interimReply: { text: 'The harbor morning can stay loose while I shape the walk.', model: INTERIM_MODEL, ms: 900, judge: { judged: true, template: false, canShip: true } },
}));
assert.deepEqual(assertLiveTranscript(real).interimFlags, []);

assert.throws(() => assertLiveTranscript(doc(appTurn({
  quality: { judged: true, score: 4, comment: 'Harbor morning stays open.', rewritten: false, model: 'typesafe/jev-1.13', judgeMs: 400, draft: 'Start with the harbor walk.' },
  rewriteModel: '', rewriteText: '', rewriteAttempts: [], jevScoreRewrite: null, flagged: false,
  interimReply: { text: 'Thursday stays a town walk.', model: INTERIM_MODEL, ms: 200, judge: { judged: true, template: false, canShip: true } },
}))), /non-rewrite turn has an interim reply/);

console.log('dialog interim flag: ok');
