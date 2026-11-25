#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isBakeoffModelId } from './vacation-app-reply-rules.mjs';
import { liveTurnRecord } from '../src/vacation/live-app-turn.mjs';

const approved = 'anthropic/claude-haiku-5.5';
assert.equal(isBakeoffModelId(approved), true);
const stored = liveTurnRecord({
  turnIndex: 3,
  role: 'app',
  modality: 'text',
  text: 'Who is coming with you?',
  at: '2026-11-19T02:51:00.000Z',
  latencyMs: 1200,
  sessionE2eMs: 4000,
  jev: { jevRan: true, jevBeforeModel: true, responseModel: approved, jevLatencyMs: 110 },
  model: {
    called: true,
    responseModel: approved,
    genLatencyMs: 800,
    quality: { judged: true, score: 4, judgeMs: 110 },
    log: { latencyMs: { draft: 800, jevDraft: 110 } },
  },
});
assert.equal(stored.modelId, approved);
assert.equal(stored.shippedModel, approved);
assert.equal(stored.draftModel, approved);
assert.equal(isBakeoffModelId(stored.shippedModel), true);

const outside = 'qwen/qwen3-max';
assert.equal(isBakeoffModelId(outside), false);
const unstamped = liveTurnRecord({
  turnIndex: 3,
  role: 'app',
  modality: 'text',
  text: 'Who is coming with you?',
  at: '2026-11-19T02:51:00.000Z',
  latencyMs: 1200,
  sessionE2eMs: 4000,
  jev: { jevRan: true, jevBeforeModel: true, responseModel: outside },
  model: {
    called: true,
    responseModel: outside,
    quality: { judged: true, score: 4 },
    log: { latencyMs: { draft: 1 } },
  },
});
assert.equal(isBakeoffModelId(unstamped.shippedModel || ''), false);
assert.equal(unstamped.draftModel, null);

const noLogFirstIntake = liveTurnRecord({
  turnIndex: 3,
  role: 'app',
  modality: 'text',
  text: 'Where will you be staying during the vacation?',
  at: '2026-11-25T00:55:02.614Z',
  latencyMs: 2619,
  sessionE2eMs: 23115,
  jev: { jevRan: true, jevBeforeModel: true, modelTier: 3, responseModel: approved, jevLatencyMs: 151 },
  model: {
    called: true,
    responseModel: approved,
    genLatencyMs: 1214,
    quality: { judged: true, score: 4, disposition: 'planning_draft_kept', comment: 'planning draft kept' },
  },
});
assert.equal(noLogFirstIntake.modelId, approved);
assert.equal(noLogFirstIntake.shippedModel, approved);
assert.equal(noLogFirstIntake.draftModel, approved);
assert.equal(noLogFirstIntake.jevScoreDraft, 4);
assert.equal(noLogFirstIntake.jevNoteReason, 'jev_no_free_text');

const renderer = fs.readFileSync(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url), 'utf8');
assert.match(renderer, /shipped model is not a bake-off tier/);
assert.match(renderer, /isBakeoffModelId\(shippedModel\)/);

console.log('test_acceptance_1043_shipped_tier: ok');
