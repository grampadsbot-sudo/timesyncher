import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVacationAppReplyRules } from './vacation-app-reply-rules.mjs';
import { FIXED_OPENER_REASON, jevStamp, LIVE_OPENER_PRODUCER, ONBOARDING_OPENER_CHAT_ONLY } from '../src/vacation/live-app-turn.mjs';
import {
  assertLiveTranscript,
  assessPackShape,
  extractPdfText,
  renderLiveTranscriptPdf,
} from './live-transcript-dialog-pdf.mjs';

const script = fileURLToPath(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url));
const source = fs.readFileSync(script, 'utf8');
assert.doesNotMatch(source, /dialog_vacation_test_turn\s*\(/);
assert.doesNotMatch(source, /callTieredModel|jevPrecall|chat\/completions|openrouter\.ai/);
assert.match(source, /OpenRouter self-call or dialog_vacation_test_turn pack/);
assert.match(source, /APP to \$\{name\}:/);
assert.match(source, /tiers used:/);
assert.match(source, /models used:/);
assert.doesNotMatch(source, /T\$\{turn\.turnIndex\} APP to/);
assert.doesNotMatch(source, /jev first:/);
assert.match(source, /Dialog Pack -/);
assert.match(source, /missing_app_open/);

const rules = await loadVacationAppReplyRules({});
assert.equal(rules.ok, true);
assert.equal(rules.via, 'bundled-get_page');
assert.equal(rules.smoke_bar_phrase, 'shared-reply-smoke-phrase-beta');
assert.equal(rules.pipeline, 'jev_precall_then_tiered_model');

const skipped = jevStamp({ jevRan: false, error: 'classify_pending' });
assert.equal(skipped.jevRan, false);
assert.equal(skipped.reason, 'classify_pending');
assert.equal(skipped.modelTier, null);

function liveDoc(overrides = {}) {
  return {
    live: true,
    capture: 'live-vacation-app',
    sessionToken: 'session-token',
    targetPerson: 'Craig',
    turns: [
      {
        turnIndex: 1,
        role: 'customer',
        modality: 'text',
        text: 'Harbor morning plan for Craig',
        at: '2026-09-25T21:00:00.000Z',
        latencyMs: 12,
        sessionE2eMs: 12,
        jev: { jevRan: true, modelTier: 2, routeType: 'general', extraContext: { routeType: 'general' }, via: 'openrouter-decisions' },
      },
      {
        turnIndex: 2,
        role: 'app',
        modality: 'text',
        text: 'Start with the harbor walk, then keep the afternoon open.',
        at: '2026-09-25T21:00:03.000Z',
        latencyMs: 2800,
        sessionE2eMs: 3000,
        jev: { jevRan: true, modelTier: 2, routeType: 'general', extraContext: { routeType: 'general' }, via: 'openrouter-decisions', responseModel: 'qwen/qwen3-235b-a22b-2507', jevLatencyMs: 400, jevBeforeModel: true },
        replyProducer: 'vacation-app-reply-rules',
        invented: false,
        modelId: 'qwen/qwen3-235b-a22b-2507',
        beats: ['harbor morning plan'],
        jevLatencyMs: 400,
        genLatencyMs: 2400,
        jevBeforeModel: true,
      },
    ],
    ...overrides,
  };
}

function rejects(doc, pattern) {
  assert.throws(() => assertLiveTranscript(doc), pattern);
}

rejects(null, /live transcript/);
rejects({ live: true, capture: 'sim', turns: [{ role: 'customer' }] }, /live-vacation-app/);
rejects(liveDoc({ turns: [liveDoc().turns[0]] }), /no app reply/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? { ...turn, text: '' } : turn)),
}), /text is empty/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? { ...turn, invented: true } : turn)),
}), /invented/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? { ...turn, text: 'Got it. I saved that for Vegas and queued the update.' } : turn)),
}), /canned|invented|dialog pack/);
rejects(liveDoc({ generator: 'dialog_vacation_test_turn' }), /dialog_vacation_test_turn/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? { ...turn, modelId: 'openai/gpt-4.1-mini', jev: { ...turn.jev, responseModel: 'openai/gpt-4.1-mini' } } : turn)),
}), /bake-off map/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? { ...turn, modelId: 'google/gemini-2.5-flash', jev: { ...turn.jev, responseModel: 'google/gemini-2.5-flash' } } : turn)),
}), /bake-off map/);

const customerFirst = liveDoc();
const partial = assessPackShape(customerFirst);
assert.equal(partial.status, 'PARTIAL');
assert.equal(partial.missing_app_open, true);
assert.match(partial.missing_app_open_next, /Do not invent/);

const pdf = renderLiveTranscriptPdf(customerFirst);
const text = extractPdfText(pdf);
assert.match(text, /Dialog Pack - untitled v7 Tier 1-4/);
assert.match(text, /source=live-app \(not sim\)/);
assert.match(text, /no_gpt5mini: True/);
assert.match(text, /QUALITY COMPARISON/);
assert.match(text, /Per-tier models/);
assert.match(text, /Per-tier mean overall/);
assert.match(text, /TIMINGS/);
assert.match(text, /Roster \/ Collaborators/);
assert.match(text, /qwen\/qwen3-235b-a22b-2507/);
assert.match(text, /deepseek\/deepseek-v3.2/);
assert.match(text, /qwen\/qwen3-max/);
assert.match(text, /google\/gemini-2.5-flash-lite/);
assert.doesNotMatch(text, /gpt-4\.1-mini/);
assert.match(text, /tiers used: 2/);
assert.match(text, /models used: qwen\/qwen3-235b-a22b-2507/);
assert.match(text, /beat: harbor morning plan/);
assert.match(text, /^Craig:/m);
assert.match(text, /Harbor morning plan for Craig/);
assert.match(text, /APP to Craig:/);
assert.match(text, /Start with the harbor walk/);
assert.match(text, /timing: gen=2400ms · tier=2 · model=qwen\/qwen3-235b-a22b-2507/);
assert.doesNotMatch(text, /tier 2 \| general \| 2800 ms/);
assert.doesNotMatch(text, /jev first:/);
assert.match(text, /missing_app_open: true/);
assert.match(text, /Correction notes/);
assert.doesNotMatch(text, /role: customer/);
assert.doesNotMatch(text, /\bTURN \d/);
assert.doesNotMatch(text, /context: \{/);
assert.doesNotMatch(text, /TS-DIALOG-FINGERPRINT/);

const opener = liveDoc().turns[1];
const withOpen = liveDoc({
  turns: [
    { ...opener, turnIndex: 1, text: 'Welcome. Tell me where you are going.' },
    { ...liveDoc().turns[0], turnIndex: 2 },
    { ...opener, turnIndex: 3 },
  ],
});
const ready = assessPackShape(withOpen);
assert.equal(ready.status, 'DONE');
assert.equal(ready.missing_app_open, false);

const fixedOpen = liveDoc({
  turns: [
    {
      turnIndex: 1,
      role: 'app',
      modality: 'text',
      text: ONBOARDING_OPENER_CHAT_ONLY,
      at: '2026-09-25T21:00:00.000Z',
      latencyMs: 0,
      sessionE2eMs: 0,
      jev: { jevRan: false, reason: FIXED_OPENER_REASON, modelTier: null, routeType: null },
      replyProducer: LIVE_OPENER_PRODUCER,
      fixedOpener: true,
      invented: false,
    },
    { ...liveDoc().turns[0], turnIndex: 2 },
    { ...liveDoc().turns[1], turnIndex: 3 },
  ],
});
assert.equal(assessPackShape(fixedOpen).missing_app_open, false);
assert.equal(assessPackShape(fixedOpen).status, 'DONE');
const fixedText = extractPdfText(renderLiveTranscriptPdf(fixedOpen));
assert.match(fixedText, /APP to Craig:/);
assert.match(fixedText, /Tell me the trip basics/);
assert.match(fixedText, /collaborators/);
assert.doesNotMatch(fixedText, /timing: gen=0ms/);
rejects(liveDoc({
  turns: [
    liveDoc().turns[0],
    {
      ...fixedOpen.turns[0],
      turnIndex: 2,
    },
    liveDoc().turns[1],
  ],
}), /did not come from vacation-app-reply-rules|without a real Jev/);
const openText = extractPdfText(renderLiveTranscriptPdf(withOpen));
assert.match(openText, /APP to Craig:/);
assert.match(openText, /Welcome\. Tell me where you are going\./);
assert.match(openText, /missing_app_open: false/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-pdf-'));
const transcriptPath = path.join(dir, 'transcript.json');
const outPath = path.join(dir, 'dialog.pdf');
fs.writeFileSync(transcriptPath, JSON.stringify(liveDoc()));
const missing = spawnSync(process.execPath, [script, '--out', outPath], { encoding: 'utf8' });
assert.notEqual(missing.status, 0);
assert.match(missing.stderr, /will not invent a transcript/);
const built = spawnSync(process.execPath, [script, '--transcript', transcriptPath, '--out', outPath], { encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr);
assert.match(extractPdfText(fs.readFileSync(outPath)), /APP to Craig:/);

console.log('live transcript dialog pdf passed');
