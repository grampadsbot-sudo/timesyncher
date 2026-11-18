#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostEnvReady } from './harness/env.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

if (!hostEnvReady(process.env)) {
  console.log('SKIP harness dry run: host env absent (DATABASE_URL and HARNESS_LIVE=1). Live one-customer dry run was not executed.');
  process.exit(0);
}

const runId = `dry1020${Date.now().toString(36)}`;
const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dry-run-'));
const result = spawnSync(process.execPath, [
  'scripts/vk-customer-harness.mjs',
  '--story', 'scripts/fixtures/harness/story-dry-run.json',
  '--run-id', runId,
  '--out-root', outRoot,
], { cwd: root, encoding: 'utf8' });
const dir = path.join(outRoot, runId, 'dry-run');
const required = ['dialog.pdf', 'keepsake.pdf', 'video-check.json', 'scorecard.json'];
for (const name of required) assert.ok(fs.statSync(path.join(dir, name)).size > 0, `missing ${name}`);
const screens = fs.readdirSync(path.join(dir, 'screens')).filter((name) => name.endsWith('.png'));
for (const engine of ['webkit', 'chromium']) {
  for (const width of [390, 430]) assert.ok(screens.some((name) => name.includes(engine) && name.includes(String(width))));
}
const card = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'));
assert.ok(card.verdict === 'PASS' || card.verdict === 'FAIL');
assert.equal(card.cleanup.remaining, 0);
assert.equal(card.turns.every((turn) => turn.reply_backend === 'openrouter'), true);
if (card.verdict === 'FAIL') assert.ok(card.reason);
assert.equal(JSON.stringify(card).includes('fixture-session'), false);
if (result.stdout) assert.equal(result.stdout.includes('DATABASE_URL'), false);
fs.rmSync(outRoot, { recursive: true, force: true });
console.log(`test_acceptance_1020_harness_dry_run: ${card.verdict} ${card.reason || 'ok'}`);
