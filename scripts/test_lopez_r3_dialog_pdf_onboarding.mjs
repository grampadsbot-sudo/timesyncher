#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { isBakeoffModelId } from './vacation-app-reply-rules.mjs';
import { assertLiveTranscript } from './live-transcript-dialog-pdf.mjs';
import {
  LIVE_OPENER_PRODUCER,
  LIVE_REPLY_PRODUCER,
  liveTranscriptFromRows,
  liveTurnRecord,
} from '../src/vacation/live-app-turn.mjs';
import { recoverOrdinaryPlanningReply } from '../src/vacation/chat-plan-persist.mjs';
import { buildCustomerPdf } from './harness/onboarding-pdf.mjs';
import { purchaseEmailSurface, walkOnboardingWidth } from './harness/onboarding-capture.mjs';
import { ONBOARDING_WIDTHS, assessOnboardingScreens, shotBlank } from './harness/onboarding-screens.mjs';
import { waitForCaptureSurface } from './harness/live-outputs.mjs';

const APPROVED = 'anthropic/claude-haiku-5.5';
const OUTSIDE = 'qwen/qwen3-max';
assert.equal(isBakeoffModelId(APPROVED), true);
assert.equal(isBakeoffModelId(OUTSIDE), false);

const recovered = recoverOrdinaryPlanningReply({
  reply: '',
  blockedDraft: 'We are building your Orlando theme parks vacation now. Where will you be staying?',
  reason: 'first_intake_reply_flagged',
  model: {
    called: true,
    via: 'openrouter-chat',
    backend: 'vk_bot_mcp',
    modelTier: 3,
    genLatencyMs: 1214,
    responseModel: APPROVED,
  },
}, 'We are putting together a five-day family itinerary for Orlando.', { backend: 'vk_bot_mcp' });
assert.equal(recovered.quality.judged, true);
assert.equal(recovered.quality.jevNoteReason, 'jev_no_free_text');

const openerRecord = liveTurnRecord({
  turnIndex: 1,
  role: 'app',
  modality: 'text',
  text: 'Welcome, Sofia! Tell me about your vacation.',
  at: '2026-11-25T00:54:39.491Z',
  latencyMs: null,
  sessionE2eMs: null,
  jev: { jevRan: false, reason: 'fixed_onboarding_opener' },
  replyProducer: LIVE_OPENER_PRODUCER,
  model: null,
  buildSha: '535d2b73b3bf098e71204b6244e9a2e29b06cb0a',
  backend: 'vk_bot_mcp',
});

const customerRecord = liveTurnRecord({
  turnIndex: 2,
  role: 'customer',
  modality: 'text',
  text: 'Hi! We are planning a five-day Orlando theme parks family vacation from April 5 to April 9, 2027.',
  at: '2026-11-25T00:54:59.989Z',
  latencyMs: 10,
  sessionE2eMs: 20500,
  jev: {
    via: 'openrouter-decisions',
    jevRan: true,
    modelTier: 3,
    routeType: 'itinerary_advice',
    jevLatencyMs: 151,
    responseModel: APPROVED,
    jevBeforeModel: true,
  },
  speakerName: 'Sofia Lopez',
  intake: true,
  buildSha: '535d2b73b3bf098e71204b6244e9a2e29b06cb0a',
});

const firstIntakeText = [
  'Hi Sofia Lopez, we are building your Orlando theme parks vacation from Monday, April 5, 2027 through Friday, April 9, 2027.',
  'Where will you be staying during the vacation?',
  'I am building the itinerary from what you told me. View access lets family and friends see the days. Edit access lets them add notes after you approve an email invite. Welcome them onto this vacation as collaborators. The household plan is unlimited vacations for the whole year.',
].join(' ');

const turn3NoLog = liveTurnRecord({
  turnIndex: 3,
  role: 'app',
  modality: 'text',
  text: firstIntakeText,
  at: '2026-11-25T00:55:02.614Z',
  latencyMs: 2619,
  sessionE2eMs: 23115,
  jev: {
    via: 'openrouter-decisions',
    jevRan: true,
    modelTier: 3,
    routeType: 'itinerary_advice',
    jevLatencyMs: 151,
    responseModel: APPROVED,
    jevBeforeModel: true,
  },
  replyProducer: LIVE_REPLY_PRODUCER,
  model: {
    called: true,
    via: 'openrouter-chat',
    backend: 'vk_bot_mcp',
    modelTier: 3,
    genLatencyMs: 1214,
    maxTokens: 900,
    responseModel: APPROVED,
    quality: {
      judged: true,
      score: 4,
      disposition: 'planning_draft_kept',
      comment: 'planning draft kept',
    },
  },
  rules: { ok: true, via: 'bundled-get_page', slug: 'bot-admin/skills/time-syncher/vacation-app-reply-rules' },
  buildSha: '535d2b73b3bf098e71204b6244e9a2e29b06cb0a',
  backend: 'vk_bot_mcp',
});

assert.equal(turn3NoLog.modelId, APPROVED);
assert.equal(turn3NoLog.shippedModel, APPROVED);
assert.equal(turn3NoLog.draftModel, APPROVED);
assert.equal(turn3NoLog.jevScoreDraft, 4);
assert.equal(turn3NoLog.jevNoteReason, 'jev_no_free_text');

const docFromRows = liveTranscriptFromRows({
  session: { token: 'session-lopez-r3', display_name: 'Sofia Lopez', first_name: 'Sofia', trip_id: 'trip-lopez-r3' },
  rows: [
    { body: openerRecord.text, payload: { liveTranscript: openerRecord } },
    { body: customerRecord.text, payload: { liveTranscript: customerRecord } },
    { body: turn3NoLog.text, payload: { liveTranscript: turn3NoLog } },
  ],
});
assert.equal(docFromRows.turns[0].shippedModel, null);
assert.equal(docFromRows.turns[0].draftModel, null);
assert.equal(docFromRows.turns[0].jevScoreDraft, null);
assert.equal(docFromRows.turns[1].shippedModel, null);
assert.equal(docFromRows.turns[1].draftModel, null);
assert.equal(docFromRows.turns[2].shippedModel, APPROVED);
assert.equal(docFromRows.turns[2].draftModel, APPROVED);
assert.equal(docFromRows.turns[2].jevScoreDraft, 4);
assert.equal(docFromRows.turns[2].jevNoteReason, 'jev_no_free_text');

const legacyUnstampedRow = {
  ...turn3NoLog,
  shippedModel: null,
  draftModel: null,
  jevScoreDraft: null,
  jevNoteReason: null,
  quality: {
    ...turn3NoLog.quality,
    jevNoteReason: null,
  },
};
const docFromLegacyRows = liveTranscriptFromRows({
  session: { token: 'session-lopez-r3-legacy', display_name: 'Sofia Lopez', first_name: 'Sofia', trip_id: 'trip-lopez-r3' },
  rows: [
    { body: openerRecord.text, payload: { liveTranscript: openerRecord } },
    { body: customerRecord.text, payload: { liveTranscript: customerRecord } },
    { body: legacyUnstampedRow.text, payload: { liveTranscript: legacyUnstampedRow } },
  ],
});
assert.equal(docFromLegacyRows.turns[2].shippedModel, APPROVED);
assert.equal(docFromLegacyRows.turns[2].draftModel, APPROVED);
assert.equal(docFromLegacyRows.turns[2].jevScoreDraft, 4);
assert.equal(docFromLegacyRows.turns[2].jevNoteReason, 'jev_no_free_text');

assert.doesNotThrow(() => assertLiveTranscript(docFromRows));
assert.doesNotThrow(() => assertLiveTranscript(docFromLegacyRows));

const tmpDialog = fs.mkdtempSync(path.join(os.tmpdir(), 'lopez-r3-dialog-'));
const transcriptFile = path.join(tmpDialog, 'dialog-transcript.json');
const pdfOut = path.join(tmpDialog, 'dialog.pdf');
const jsonlOut = path.join(tmpDialog, 'live-transcript.jsonl');
const timingOut = path.join(tmpDialog, 'timing.json');
const stateOut = path.join(tmpDialog, 'qa-input.json');
fs.writeFileSync(transcriptFile, JSON.stringify(docFromRows));
const rendered = spawnSync(process.execPath, [
  path.resolve('scripts/live-transcript-dialog-pdf.mjs'),
  '--transcript', transcriptFile,
  '--out', pdfOut,
  '--jsonlOut', jsonlOut,
  '--timing', timingOut,
  '--state', stateOut,
], { encoding: 'utf8' });
assert.equal(rendered.status, 0, `dialog pdf failed: ${rendered.stderr || rendered.stdout}`);
assert.equal(fs.existsSync(pdfOut), true);
assert.equal(fs.readFileSync(pdfOut).subarray(0, 5).toString(), '%PDF-');
fs.rmSync(tmpDialog, { recursive: true, force: true });

const badTurn3 = liveTurnRecord({
  turnIndex: 3,
  role: 'app',
  modality: 'text',
  text: firstIntakeText,
  at: '2026-11-25T00:55:02.614Z',
  latencyMs: 2619,
  sessionE2eMs: 23115,
  jev: {
    via: 'openrouter-decisions',
    jevRan: true,
    modelTier: 3,
    routeType: 'itinerary_advice',
    jevLatencyMs: 151,
    responseModel: OUTSIDE,
    jevBeforeModel: true,
  },
  replyProducer: LIVE_REPLY_PRODUCER,
  model: {
    called: true,
    via: 'openrouter-chat',
    backend: 'vk_bot_mcp',
    modelTier: 3,
    genLatencyMs: 1214,
    responseModel: OUTSIDE,
    quality: { judged: true, score: 4 },
  },
});
assert.equal(isBakeoffModelId(badTurn3.shippedModel || ''), false);
assert.equal(badTurn3.draftModel, null);
const badDoc = liveTranscriptFromRows({
  session: { token: 'session-bad', display_name: 'Sofia Lopez', first_name: 'Sofia', trip_id: 'trip-bad' },
  rows: [
    { body: openerRecord.text, payload: { liveTranscript: openerRecord } },
    { body: customerRecord.text, payload: { liveTranscript: customerRecord } },
    { body: badTurn3.text, payload: { liveTranscript: badTurn3 } },
  ],
});
assert.equal(badDoc.turns[2].shippedModel, null);
assert.throws(
  () => assertLiveTranscript({
    ...badDoc,
    turns: badDoc.turns.map((turn, idx) => (idx === 2 ? { ...turn, modelId: APPROVED } : turn)),
  }),
  /shipped model is not a bake-off tier/,
);

function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function encodePng(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = paint(x, y);
      const index = start + 1 + x * 3;
      raw[index] = red;
      raw[index + 1] = green;
      raw[index + 2] = blue;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const shellBlank = encodePng(16, 16, () => [246, 247, 249]);
const entryPainted = encodePng(16, 16, (x, y) => ((x + y) % 2 ? [21, 25, 31] : [246, 247, 249]));
const termsFilled = encodePng(16, 16, (x, y) => ((x * 3 + y) % 2 ? [180, 135, 45] : [255, 255, 255]));
assert.equal(shotBlank(shellBlank), true);
assert.equal(shotBlank(entryPainted), false);
assert.equal(shotBlank(termsFilled), false);

const origin = 'https://vacation-staging.timesyncher.com';
const email = purchaseEmailSurface({ firstName: 'Sofia', displayName: 'Sofia Lopez' }, 'throwaway-lopez', origin);
assert.equal(email.launchUrl, `${origin}/vacation-app.html?session=throwaway-lopez`);

function spaFakePage() {
  const events = [];
  let url = `${origin}/`;
  let onAppEntry = false;
  let eulaPainted = false;
  let nameFilled = false;
  const page = {
    async setViewportSize() {},
    async goto(next) {
      url = next;
      events.push(`goto:${next}`);
      onAppEntry = next.includes('/vacation-app.html');
      eulaPainted = false;
      nameFilled = false;
    },
    async waitForSelector(selector, opts = {}) {
      events.push(`wait:${selector}:${opts.state || ''}`);
      if (selector === '#eulaScreen') eulaPainted = true;
    },
    async waitForURL() {},
    async waitForFunction() {},
    async fill(selector) {
      events.push(`fill:${selector}`);
      if (selector === '#eulaName') nameFilled = true;
    },
    async click(selector) {
      events.push(`click:${selector}`);
    },
    async setContent() {
      onAppEntry = false;
      eulaPainted = false;
    },
    url() {
      return url;
    },
    async screenshot({ path: file }) {
      let bytes = entryPainted;
      if (onAppEntry && !eulaPainted) bytes = shellBlank;
      else if (onAppEntry && nameFilled) bytes = termsFilled;
      fs.writeFileSync(file, bytes);
      events.push(`shot:${path.basename(file)}`);
    },
    locator() {
      return {
        innerText: async () => (onAppEntry && !eulaPainted ? '' : 'Welcome. Review Terms & Privacy.'),
      };
    },
  };
  return { page, events };
}

const tmpOnboard = fs.mkdtempSync(path.join(os.tmpdir(), 'lopez-r3-onboard-'));
const allShots = [];
for (const width of ONBOARDING_WIDTHS) {
  const { page, events } = spaFakePage();
  const walked = await walkOnboardingWidth({
    page,
    origin,
    customer: { name: 'Sofia Lopez', email: `sofia-r3-${width}@harness.invalid` },
    width,
    outDir: tmpOnboard,
    showPayment: async (current) => { await current.click('#continueBtn'); },
    submitPayment: async (current) => {
      await current.goto(`${origin}/order-success.html?session=throwaway-lopez`);
    },
  });
  assert.equal(walked.termsClick, 'ui', `width ${width} termsClick`);
  const appEntryShot = walked.shots.find((shot) => shot.id === 'app-entry' && shot.width === width);
  const termsGateShot = walked.shots.find((shot) => shot.id === 'terms-gate' && shot.width === width);
  assert.ok(appEntryShot, `missing app-entry ${width}`);
  assert.equal(appEntryShot.blank, false, `blank app-entry ${width}`);
  assert.equal(appEntryShot.gap, '', `gap app-entry ${width}: ${appEntryShot.gap}`);
  assert.equal(shotBlank(fs.readFileSync(appEntryShot.file)), false, `shotBlank app-entry ${width}`);
  assert.ok(termsGateShot, `missing terms-gate ${width}`);
  assert.equal(termsGateShot.blank, false, `blank terms-gate ${width}`);
  assert.equal(Buffer.compare(fs.readFileSync(appEntryShot.file), fs.readFileSync(termsGateShot.file)) !== 0, true);
  const waitAt = events.findIndex((entry) => entry.startsWith('wait:#eulaScreen'));
  const entryShotAt = events.indexOf(`shot:app-entry-webkit-${width}.png`);
  const fillAt = events.indexOf('fill:#eulaName');
  const termsShotAt = events.indexOf(`shot:terms-gate-webkit-${width}.png`);
  assert.ok(waitAt >= 0 && waitAt < entryShotAt, `width ${width} must wait for #eulaScreen before app-entry shot`);
  assert.ok(entryShotAt < fillAt && fillAt < termsShotAt, `width ${width} must keep distinct terms-gate shot after fill`);
  assert.ok(events.includes(`goto:${origin}/vacation-app.html?session=throwaway-lopez`), `width ${width} launchUrl must stay on staging origin`);
  allShots.push(...walked.shots);
}
const built = buildCustomerPdf({ shots: allShots, laterFiles: [], outPath: path.join(tmpOnboard, 'customer.pdf') });
const assessed = assessOnboardingScreens({ shots: allShots, pdfText: built.pdfText, termsClick: 'ui' });
assert.equal(assessed.ok, true, assessed.detail);
fs.rmSync(tmpOnboard, { recursive: true, force: true });

const surfaceWaits = [];
await waitForCaptureSurface({
  async waitForSelector(selector, opts) {
    surfaceWaits.push({ selector, opts });
  },
}, 'app');
assert.equal(surfaceWaits.length, 1);
assert.match(surfaceWaits[0].selector, /#eulaScreen/);
assert.match(surfaceWaits[0].selector, /#messageText/);
assert.equal(surfaceWaits[0].opts?.state, 'visible');

console.log('test_lopez_r3_dialog_pdf_onboarding: ok');
