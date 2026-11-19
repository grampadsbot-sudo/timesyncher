#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shareSlugEditGuardDecision } from '../src/vacation/chat-itinerary-edit-slug-guard.mjs';
import { liveTurnRecord } from '../src/vacation/live-app-turn.mjs';
import { formatLiveTimingLine, liveV7Pack } from './live-transcript-dialog-pdf.mjs';
import { stampRunReplyBackend } from './harness/drive-build.mjs';
import { renderDialog } from './harness/live-outputs.mjs';
import { confirmStoredTurns } from './harness/stored-turn.mjs';

const drive = 'c'.repeat(40);
const model = 'anthropic/claude-haiku-5.5';
const appTurn = (turnIndex, backend) => ({
  role: 'app',
  turnIndex,
  text: `Stored reply ${turnIndex}.`,
  jev: { jevRan: true, modelTier: 1 },
  model: { responseModel: model },
  modelId: model,
  genLatencyMs: 400,
  jevLatencyMs: 200,
  latencyMs: 900,
  maxTokens: 900,
  backend,
  buildSha: drive,
});
const raw = {
  targetPerson: 'Avery',
  turns: [
    { role: 'customer', turnIndex: 1, text: 'Add a quiet morning walk.', buildSha: drive },
    appTurn(3, ''),
    appTurn(5, ''),
  ],
  buildSha: drive,
  driveBuildEnd: drive,
};
const stamped = stampRunReplyBackend(raw, 'openrouter');
assert.equal(stamped.turns[0].backend, undefined);
assert.equal(stamped.turns[1].backend, 'openrouter');
assert.equal(stamped.turns[2].backend, 'openrouter');
assert.equal(stamped.turns[1].model.backend, 'openrouter');
assert.equal(stampRunReplyBackend(raw, 'guessed-from-via'), raw);

const shape = {
  trip: 'Hilo',
  pack_id: 'dialog-backend',
  summary: { turnCount: 3, customerTurns: 1, appTurns: 2, sessionE2eMs: 1200 },
  tiersUsed: [1],
  modelsUsed: [model],
};
const pack = liveV7Pack(stamped, shape);
const header = pack.cover_fit.find((line) => line.startsWith('models used:'));
assert.match(header, /backends: openrouter/);
for (const turn of stamped.turns) {
  if (turn.role !== 'app' || turn.jev?.jevRan !== true) continue;
  const backend = String(turn.backend || '').trim();
  assert.ok(backend, `app turn ${turn.turnIndex} lacks a backend`);
  const rendered = pack.turns.find((row) => row.label.startsWith(`T${turn.turnIndex} `));
  assert.match(rendered.timing, new RegExp(`backend=${backend}`));
  assert.match(header, new RegExp(backend));
  assert.match(formatLiveTimingLine({
    gen: turn.genLatencyMs,
    model,
    tier: turn.jev.modelTier,
    jevMs: turn.jevLatencyMs,
    maxTokens: turn.maxTokens,
    backend,
  }), new RegExp(`backend=${backend}`));
}
const bare = formatLiveTimingLine({ gen: 750, model, tier: 1, jevMs: 222, maxTokens: 900 });
assert.equal(bare, 'timing: jev=222ms gen=750ms model=anthropic/claude-haiku-5.5 tier=1 max_tokens=900');

const pdfMissing = pack.turns.map((row) => String(row.timing || '').replace(/ backend=\S+/g, '')).join('\n');
const missing = confirmStoredTurns(stamped, pdfMissing, 'openrouter');
assert.ok(missing.gaps.includes('dialog-pdf-backend-not-shown'));
const shown = confirmStoredTurns(stamped, pack.turns.map((row) => row.timing).join('\n') + header, 'openrouter');
assert.equal(shown.gaps.includes('dialog-pdf-backend-not-shown'), false);
assert.equal(shown.gaps.includes('stored-backend-missing'), false);

const check = fs.readFileSync(new URL('./harness/stored-turn.mjs', import.meta.url), 'utf8');
assert.match(check, /dialog-pdf-backend-not-shown/);
assert.match(check, /!pdf\.includes\(backend\)/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dialog-backend-'));
await renderDialog({
  token: 'fixture-session',
  outDir: dir,
  secrets: ['fixture-session'],
  buildSha: drive,
  replyBackend: 'vk_bot_mcp',
  loadTranscript: async () => raw,
  spawnImpl: () => ({ status: 0, stdout: '{"ok":false}', stderr: '' }),
});
const written = JSON.parse(fs.readFileSync(path.join(dir, 'dialog-transcript.json'), 'utf8'));
for (const turn of written.turns) {
  if (turn.role !== 'app') continue;
  if (turn.backend !== 'vk_bot_mcp') throw new Error(`app turn ${turn.turnIndex} lacks a rendered backend`);
}
fs.rmSync(dir, { recursive: true, force: true });

const recorded = liveTurnRecord({
  turnIndex: 3,
  role: 'app',
  modality: 'text',
  text: 'Tuesday morning stays open for the walk.',
  at: new Date().toISOString(),
  latencyMs: 500,
  sessionE2eMs: 700,
  jev: { jevRan: true, modelTier: 1, jevBeforeModel: true },
  backend: 'openrouter',
  model: {
    called: true,
    responseModel: model,
    modelTier: 1,
    genLatencyMs: 480,
    cost: { status: 'measured', dollars: 0.001, currency: 'USD', source: 'openrouter_usage_cost', promptTokens: 10, completionTokens: 4, totalTokens: 14 },
  },
});
assert.equal(recorded.backend, 'openrouter');
assert.equal(recorded.model.backend, 'openrouter');

assert.equal(shareSlugEditGuardDecision('fresh-harness-slug').ok, true);
assert.equal(shareSlugEditGuardDecision('fresh-harness-slug').reason, 'fresh_trip');
assert.equal(shareSlugEditGuardDecision('chat-edit-demo-locked-fixture').ok, false);
assert.equal(shareSlugEditGuardDecision('chat-edit-demo-locked-fixture').reason, 'demo_locked');
assert.equal(shareSlugEditGuardDecision('8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y').ok, true);

console.log('test_dialog_pdf_backend: ok');
