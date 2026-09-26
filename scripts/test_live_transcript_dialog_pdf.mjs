import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVacationAppReplyRules } from './vacation-app-reply-rules.mjs';
import { customerPullsAccess, destinationFromTexts, FIXED_OPENER_REASON, isFullUpsell, jevStamp, LIVE_OPENER_PRODUCER, ONBOARDING_OPENER_CHAT_ONLY, replyLeavesDestination, sessionHasFullUpsell, stripUpsell, upsellAudit, upsellModeForTurn } from '../src/vacation/live-app-turn.mjs';
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
assert.match(source, /QUALITY COMPARISON vs v6 gpt-5-mini|liveV7Pack/);
assert.match(source, /missing_app_open/);

assert.equal(destinationFromTexts(['We are going to the Big Island.']), 'Big Island, Hawaii');
assert.equal(replyLeavesDestination('Friday dinner in Tulum', 'Big Island, Hawaii'), true);
assert.equal(replyLeavesDestination('Friday dinner on the Big Island', 'Big Island, Hawaii'), false);
assert.equal(replyLeavesDestination('Cartagena breakfast', 'Big Island, Hawaii'), true);
assert.equal(customerPullsAccess('Walk me through Thursday with Kimberly.'), false);
assert.equal(customerPullsAccess('How much if they join as collaborators?'), true);
assert.equal(upsellModeForTurn('Friday dinner on the Big Island.', []), 'forbidden');
assert.equal(upsellModeForTurn('How much if Kimberly joins as a collaborator?', []), 'allow-once');
const dayWithCloser = 'Thursday is a town walk in Kailua-Kona. Welcome the whole family as collaborators with unlimited vacations for the whole year.';
assert.equal(stripUpsell(dayWithCloser), 'Thursday is a town walk in Kailua-Kona.');
assert.equal(isFullUpsell(dayWithCloser), true);
assert.equal(sessionHasFullUpsell([{ role: 'app', text: ONBOARDING_OPENER_CHAT_ONLY }]), false);
assert.equal(upsellModeForTurn('What is the price for collaborators?', [{ role: 'app', text: 'Welcome them as collaborators. The plan is unlimited vacations for the whole year.' }]), 'forbidden');
assert.deepEqual(upsellAudit([
  { turnIndex: 1, role: 'app', text: ONBOARDING_OPENER_CHAT_ONLY, replyProducer: LIVE_OPENER_PRODUCER },
  { turnIndex: 2, role: 'customer', text: 'How much if they join as collaborators?' },
  { turnIndex: 3, role: 'app', text: 'Welcome them onto this vacation as collaborators. The household plan is unlimited vacations for the whole year.' },
  { turnIndex: 4, role: 'customer', text: 'Read the week back on the Big Island.' },
  { turnIndex: 5, role: 'app', text: 'Monday starts in Kailua-Kona.' },
]).unsolicitedFull, []);

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
assert.match(text, /Dialog Pack — untitled v7 Tier 1–4|Dialog Pack . untitled v7 Tier/);
assert.match(text, /QUALITY COMPARISON vs v6 gpt-5-mini/);
assert.match(text, /Per-tier mean overall/);
assert.match(text, /TIMINGS vs v6 gpt-5-mini/);
assert.match(text, /Hard recipe/);
assert.match(text, /Roster/);
assert.match(text, /no_gpt5mini/);
assert.match(text, /qwen\/qwen3-235b-a22b-2507/);
assert.match(text, /deepseek\/deepseek-v3.2/);
assert.match(text, /qwen\/qwen3-max/);
assert.match(text, /google\/gemini-2.5-flash-lite/);
assert.doesNotMatch(text, /gpt-4\.1-mini/);
assert.match(text, /Full interleaved transcript/);
assert.match(text, /T2 APP/);
assert.match(text, /beat=harbor morning plan/);
assert.match(text, /T1 CRAIG/);
assert.match(text, /Harbor morning plan for Craig/);
assert.match(text, /T2 APP/);
assert.match(text, /Start with the harbor walk/);
assert.match(text, /timing: gen=2400ms model=qwen\/qwen3-235b-a22b-2507 tier=2 jev=400ms max_tokens=900/);
assert.match(text, /v7 Tier 1–4|v7 Tier 1.4/);
assert.match(text, /v7 overall/);
assert.match(text, /Owner: Craig \(Owner\)/);
const seated = liveDoc({
  customerName: 'Craig Davidson',
  party: {
    primary: { name: 'Craig Davidson', role: 'Owner' },
    collaborators: [
      { name: 'Kimberly Davidson', payer: 'owner' },
      { name: 'Tyler Davidson', payer: 'tyler' },
      { name: 'Lauren Davidson', payer: 'lauren' },
    ],
    preference_subjects: [
      { name: 'Torren', age: 8 },
      { name: 'Peyton', age: 6 },
      { name: 'Keegan', age: 4 },
      { name: 'Fallon', age: 2 },
    ],
    viewers: [{ name: 'Marcus Chen' }],
    editors: [{ name: 'Aunt Jean' }],
  },
  turns: [
    { ...liveDoc().turns[0], speakerName: 'Craig Davidson' },
    liveDoc().turns[1],
    { ...liveDoc().turns[0], turnIndex: 3, text: 'The garden morning in Kailua-Kona still works.', speakerName: 'Kimberly Davidson' },
    { ...liveDoc().turns[1], turnIndex: 4 },
  ],
});
const seatedText = extractPdfText(renderLiveTranscriptPdf(seated));
assert.match(seatedText, /Owner: Craig Davidson \(Owner\)/);
assert.match(seatedText, /Collaborators: Kimberly Davidson \(payer=owner\), Tyler Davidson \(payer=tyler\), Lauren Davidson \(payer=lauren\)/);
assert.match(seatedText, /Kids \(silent\): Torren 8, Peyton 6, Keegan 4, Fallon 2/);
assert.match(seatedText, /Viewer: Marcus Chen · Editor: Aunt Jean/);
assert.match(seatedText, /T3 KIMBERLY/);
assert.doesNotMatch(text, /tier 2 \| general \| 2800 ms/);
assert.doesNotMatch(text, /jev first:/);
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
assert.match(fixedText, /T1 APP/);
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
assert.match(openText, /T1 APP/);
assert.match(openText, /Welcome\. Tell me where you are going\./);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-pdf-'));
const transcriptPath = path.join(dir, 'transcript.json');
const outPath = path.join(dir, 'dialog.pdf');
fs.writeFileSync(transcriptPath, JSON.stringify(liveDoc()));
const missing = spawnSync(process.execPath, [script, '--out', outPath], { encoding: 'utf8' });
assert.notEqual(missing.status, 0);
assert.match(missing.stderr, /will not invent a transcript/);
const built = spawnSync(process.execPath, [script, '--transcript', transcriptPath, '--out', outPath], { encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr);
assert.match(extractPdfText(fs.readFileSync(outPath)), /T2 APP/);

console.log('live transcript dialog pdf passed');
