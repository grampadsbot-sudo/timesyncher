#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import { liveTurnRecord } from '../src/vacation/live-app-turn.mjs';
import handler from '../src/vacation/bind-thing-media-handler.mjs';
import { sniffMediaType } from '../src/vacation/thing-media-bind.mjs';
import { assertLiveTranscript, extractPdfText, renderLiveTranscriptPdf } from './live-transcript-dialog-pdf.mjs';
import { writeVideoCheck } from './harness/live-outputs.mjs';

const renderer = readFileSync(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url), 'utf8');
assert.match(renderer, /draftModel is outside the bake-off map/);
const model = 'anthropic/claude-haiku-5.5';
const app = liveTurnRecord({
  turnIndex: 3,
  role: 'app',
  modality: 'text',
  text: 'Start with the harbor walk, then keep the afternoon open.',
  at: '2026-09-25T21:00:03.000Z',
  latencyMs: 2800,
  sessionE2eMs: 3000,
  jev: { jevRan: true, modelTier: 2, routeType: 'general', extraContext: { routeType: 'general' }, via: 'openrouter-decisions', responseModel: model, jevLatencyMs: 400, jevBeforeModel: true },
  model: {
    responseModel: model,
    genLatencyMs: 2400,
    called: true,
    via: 'openrouter-decisions',
    modelTier: 2,
    quality: { judged: true, score: 4, comment: 'Harbor morning is answered cleanly, a 4 carried by afternoon open.', rewritten: false, model: 'typesafe/jev-1.13', judgeMs: 400 },
    log: { jevScoreDraft: 4, jevNoteReason: 'jev_no_free_text' },
  },
});
assert.equal(app.draftModel, model);
assert.equal(app.shippedModel, model);
assert.equal(app.rewriteModel, null);
const rewritten = liveTurnRecord({
  turnIndex: 3,
  role: 'app',
  modality: 'text',
  text: 'Start with the harbor walk, then keep the afternoon open.',
  at: '2026-09-25T21:00:03.000Z',
  latencyMs: 2800,
  sessionE2eMs: 3000,
  jev: { jevRan: true, modelTier: 2, responseModel: model, jevLatencyMs: 400, jevBeforeModel: true },
  model: {
    responseModel: model,
    genLatencyMs: 2400,
    quality: { judged: true, score: 4, rewritten: true, model: 'typesafe/jev-1.13', judgeMs: 400 },
    log: { rewriteModel: model, jevScoreDraft: 4 },
  },
});
assert.equal(rewritten.draftModel, null);
assert.equal(rewritten.shippedModel, model);
const doc = {
  live: true,
  capture: 'live-vacation-app',
  deployBanner: 'live 0123456789abcdef0123456789abcdef01234567 https://vacation-staging.timesyncher.com',
  targetPerson: 'Avery',
  turns: [
    {
      turnIndex: 2,
      role: 'customer',
      modality: 'text',
      text: 'Harbor morning plan for Avery',
      at: '2026-09-25T21:00:00.000Z',
      latencyMs: 12,
      sessionE2eMs: 12,
      jev: { jevRan: true, modelTier: 2, routeType: 'general', extraContext: { routeType: 'general' }, via: 'openrouter-decisions' },
    },
    app,
  ],
};
assertLiveTranscript(doc);
const pdf = renderLiveTranscriptPdf(doc);
assert.equal(Buffer.isBuffer(pdf), true);
assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
assert.match(extractPdfText(pdf), /harbor walk/);

const origin = 'https://vacation-staging.timesyncher.com';
const dir = mkdtempSync(path.join(tmpdir(), 'video-check-'));
const missing = await writeVideoCheck({
  origin,
  attachment: {
    ok: false,
    detail: '',
    bindings: [{ kind: 'video', status: 503, body: { ok: false, error: 'File bind needs DATABASE_URL or a working Blob store.' } }],
  },
  fetchImpl: () => { throw new Error('media fetch'); },
  outDir: dir,
});
assert.equal(missing.pass, false);
assert.equal(missing.status, 503);
assert.match(missing.detail, /http 503/);
assert.match(missing.detail, /File bind needs DATABASE_URL/);
assert.notEqual(missing.detail, 'video-missing');
const bare = await writeVideoCheck({
  origin,
  attachment: { ok: false, detail: '', bindings: [{ kind: 'video', status: 200, body: { ok: true, binding: { id: 'not-a-uuid' } } }] },
  fetchImpl: () => { throw new Error('media fetch'); },
  outDir: dir,
});
assert.match(bare.detail, /http 200/);
assert.match(bare.detail, /binding has no publicUrl/);
assert.notEqual(bare.detail, 'video-missing');
const played = await writeVideoCheck({
  origin,
  attachment: {
    ok: true,
    detail: '',
    bindings: [{ kind: 'video', status: 200, body: { ok: true, binding: { public_url: '/api/bind-thing-media?shareToken=sample-trip&id=clip&raw=1', thingName: 'Harbor walk' } } }],
  },
  fetchImpl: async () => ({ status: 200, headers: { get: () => 'video/mp4' } }),
  outDir: dir,
});
assert.equal(played.pass, true);
assert.equal(played.detail, 'playable');

const clip = readFileSync(new URL('./fixtures/harness/media/clip.mp4', import.meta.url));
assert.equal(clip.length, 32);
assert.equal(sniffMediaType(clip, 'clip.mp4', ''), 'video/mp4');
assert.equal(clip.length > 20971520, false);
const savedEnv = {};
for (const key of ['DATABASE_URL', 'NEON_DATABASE_URL', 'TIMESYNCHER_TRAVEL_BASE_URL', 'TIMESYNCHER_THING_MEDIA_INDEX', 'TIMESYNCHER_MEDIA_BIND_TOKEN', 'TIMESYNCHER_ADMIN_TOKEN', 'TIMESYNCHER_WORKER_TOKEN']) {
  savedEnv[key] = process.env[key];
}
process.env.DATABASE_URL = 'postgres://fixture@127.0.0.1/fixture';
delete process.env.NEON_DATABASE_URL;
process.env.TIMESYNCHER_TRAVEL_BASE_URL = origin;
process.env.TIMESYNCHER_THING_MEDIA_INDEX = path.join(dir, 'media-index.json');
delete process.env.TIMESYNCHER_MEDIA_BIND_TOKEN;
delete process.env.TIMESYNCHER_ADMIN_TOKEN;
delete process.env.TIMESYNCHER_WORKER_TOKEN;
const origFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ trip: { id: 41 }, places: [{ id: 14, name: 'Harbor walk', category_name: 'Activity' }] }) });
useVacationDatabase(async () => []);
try {
  const raw = Buffer.from(JSON.stringify({
    shareToken: 'sample-trip',
    thingName: 'Harbor walk',
    thingId: 14,
    fileName: 'clip.mp4',
    fileBase64: clip.toString('base64'),
    caption: 'video',
  }));
  const req = {
    method: 'POST',
    url: '/api/bind-thing-media',
    headers: { 'content-type': 'application/json', host: 'vacation-staging.timesyncher.com' },
    async *[Symbol.asyncIterator]() { yield raw; },
  };
  const res = { statusCode: 0, headers: {}, body: '', setHeader(name, value) { this.headers[name] = value; }, end(text) { this.body = String(text || ''); } };
  await handler(req, res);
  const parsed = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.binding.mimeType, 'video/mp4');
  assert.equal(parsed.binding.mediaKind, 'video');
  assert.equal(parsed.binding.fileSizeBytes, 32);
  assert.equal(typeof parsed.binding.publicUrl, 'string');
  assert.match(parsed.binding.publicUrl, /\/api\/bind-thing-media\?/);
  assert.match(parsed.binding.publicUrl, /raw=1/);
} finally {
  useVacationDatabase(null);
  globalThis.fetch = origFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(dir, { recursive: true, force: true });
}

console.log('test_acceptance_1041_dry_run_scorecard: ok');
