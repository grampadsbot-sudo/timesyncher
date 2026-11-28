#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCustomer } from './harness/customer.mjs';
import { playWithAdminArtifacts } from './harness/runtime.mjs';
import { redactedLiveTranscript, transcriptForScorecard, writeRedactedLiveTranscript } from './harness/redacted-transcript.mjs';
import { readTipSha } from './void-stale-build.mjs';

const token = 'fixture-session-token-value-123';
const share = 'https://vacation-staging.timesyncher.com/shared/intake-throwaway-slug';
const transcript = {
  turns: [
    {
      turnIndex: 1,
      role: 'app',
      text: `Welcome. Open ${share}`,
      replyProducer: 'vacation-app-onboarding-opener',
      fixedOpener: true,
      modelId: '',
      latencyMs: 0,
      jev: { jevRan: false, reason: 'fixed_onboarding_opener' },
    },
    {
      turnIndex: 3,
      role: 'app',
      text: `See ${share} and ${token}`,
      replyProducer: 'vacation-app-reply-rules',
      fixedOpener: false,
      modelId: 'anthropic/claude-haiku-5.5',
      latencyMs: 1283,
      sessionE2eMs: 6400,
      genLatencyMs: 1283,
      jevLatencyMs: 165,
      quality: { judged: false, judgeMs: 0 },
      jev: { jevRan: true, responseModel: 'anthropic/claude-haiku-5.5' },
      model: { responseModel: 'anthropic/claude-haiku-5.5', backend: 'openrouter' },
    },
  ],
};

const redacted = redactedLiveTranscript(transcript, [token]);
assert.equal(redacted.turns.length, 2);
assert.equal(redacted.turns[1].n, 3);
assert.equal(redacted.turns[1].producer, 'vacation-app-reply-rules');
assert.equal(redacted.turns[1].model, 'anthropic/claude-haiku-5.5');
assert.equal(redacted.turns[1].judged, false);
assert.equal(redacted.turns[1].timings.latencyMs, 1283);
assert.equal(redacted.turns[1].timings.judgeMs, 0);
const packed = JSON.stringify(redacted);
assert.equal(packed.includes(token), false);
assert.equal(packed.includes(share), false);
assert.equal(packed.includes('/shared/'), false);
assert.equal(packed.includes('http'), false);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-redacted-'));
writeRedactedLiveTranscript(dir, transcript, [token]);
const saved = fs.readFileSync(path.join(dir, 'live-transcript-redacted.json'), 'utf8');
assert.equal(saved.includes(token), false);
assert.equal(saved.includes('/shared/'), false);
assert.equal(saved.includes('http'), false);

assert.equal(transcriptForScorecard(null, transcript), transcript);
assert.equal(transcriptForScorecard({ turns: [] }, transcript).turns.length, 0);

const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
story.reply_backend = 'openrouter';
const card = await runCustomer(story, {
  runId: 'r-redacted',
  outDir: dir,
  secrets: [token],
  cleanup: async () => ({ deleted: {}, remaining: 0 }),
  play: async () => ({
    reason: 'no-thing-after-chat',
    transcript: {
      turns: transcript.turns.map((turn, index) => index === 0 ? turn : {
        ...turn,
        cost: 'unmeasured',
        quality: { judged: true, score: 4, judgeMs: 20 },
      }),
    },
    pdfText: '',
    dialogOk: false,
    dialogRefused: true,
    dialogDetail: 'refused: quality_not_judged turn 3 quality is not judged',
    itineraryCount: 0,
    steps: [],
  }),
});
assert.equal(card.reason, 'no-thing-after-chat');
assert.notEqual(card.reason, 'dialog-renderer-refused');
assert.equal(card.turns.length, 2);
assert.equal(card.turns[1].n, 3);
assert.equal(card.turns[1].stored_model, 'anthropic/claude-haiku-5.5');

const flaggedText = 'There is no extra cost for how you’re splitting it up.';
const flaggedTranscript = {
  live: true,
  capture: 'live-vacation-app',
  targetPerson: 'Avery',
  turns: [
    { ...transcript.turns[0], latencyMs: null, modality: 'text' },
    { turnIndex: 6, role: 'customer', text: 'What about our seats?', modality: 'text', latencyMs: 10, sessionE2eMs: 10, jev: { jevRan: false, reason: 'customer_turn' } },
    {
      ...transcript.turns[1], turnIndex: 7, modality: 'text',
      text: `${flaggedText} See ${share} and ${token}`, storedText: `${flaggedText} See ${share} and ${token}`,
      draftModel: transcript.turns[1].modelId, shippedModel: transcript.turns[1].modelId,
      jev: { ...transcript.turns[1].jev, modelTier: 1 }, jevBeforeModel: true, jevScoreDraft: 4,
      jevNoteReason: 'jev_no_free_text', quality: { judged: true, score: 4, comment: 'Coverage is discussed.' },
      cost: 'unmeasured',
    },
  ],
};
const sha = readTipSha();
const adminWrites = [];
const { dialog, adminArtifacts } = await playWithAdminArtifacts({
  outDir: dir, secrets: [token], replyBackend: 'openrouter',
  play: async () => ({ liveShaStart: sha }),
  loadTranscript: async () => flaggedTranscript,
  put: async (_tripId, artifact, bytes) => { adminWrites.push({ artifact, bytes }); },
});
const [finding] = dialog.refusals || [];
assert.equal(dialog.ok, true, dialog.detail);
assert.equal(finding, 'turn 7 uses split-payment jargon');
assert.match(dialog.pdfText, /PARTIAL - Content check failed/);
assert.match(dialog.pdfText, /response_ready=False/i);
assert.match(dialog.pdfText, /What about our seats\?/);
assert.match(dialog.pdfText, /There is no extra cost for how you.re splitting it up\./);
assert.match(dialog.pdfText, /FLAG\. turn 7 uses split-payment jargon/);
assert.equal(dialog.pdfText.includes(token), false);
assert.equal(dialog.pdfText.includes(share), false);
assert.ok(dialog.transcript.turns[2].text.startsWith(flaggedText));
assert.equal(adminArtifacts.dialogPdf, true);
assert.deepEqual(adminArtifacts.errors, []);
assert.deepEqual(adminWrites, [{ artifact: 'dialog-pdf', bytes: fs.readFileSync(dialog.out) }]);
const qaInput = JSON.parse(fs.readFileSync(path.join(dir, 'qa-input.json'), 'utf8'));
assert.equal(qaInput.status, 'PARTIAL');
assert.deepEqual(qaInput.content_fails, [finding]);

const partialCard = await runCustomer(story, {
  runId: 'r-flagged', outDir: dir, secrets: [token],
  cleanup: async () => ({ deleted: {}, remaining: 0 }),
  play: async () => ({
    transcript: dialog.transcript, pdfText: dialog.pdfText,
    dialogOk: dialog.ok, dialogDetail: dialog.detail, dialogRefused: !dialog.ok, refusals: dialog.refusals,
    liveShaStart: sha, liveShaEnd: sha,
    keepsakeOk: true, screensOk: true, onboardingPdfOk: true, videoExists: true, videoPass: true, chromeOk: true,
  }),
});
assert.equal(partialCard.verdict, 'FAIL');
assert.equal(partialCard.reason, finding);
assert.equal(partialCard.checks.find((check) => check.id === 'dialog-pdf').pass, true);
assert.deepEqual(partialCard.checks.filter((check) => !check.pass), [
  { id: 'dialog-renderer-ok', pass: false, detail: finding, artifact: 'dialog.pdf' },
]);

const renderer = fs.readFileSync(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url), 'utf8');
assert.match(renderer, /quality\?\.judged !== true/);

console.log('test_acceptance_1035_redacted_transcript: ok');
