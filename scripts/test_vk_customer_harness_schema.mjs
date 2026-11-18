#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assignReplyBackends } from './harness/backends.mjs';
import { hostEnvReady } from './harness/env.mjs';
import { loadStorySchema, validateStory, validateWave } from './harness/schema.mjs';
import { extractPdfText } from './live-transcript-dialog-pdf.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const schema = loadStorySchema();
const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
assert.deepEqual(schema.properties.reply_backend.enum, ['openrouter', 'vk_bot_mcp']);
assert.deepEqual(validateStory(story, schema), []);
assert.equal(hostEnvReady({}), false);
const badModality = structuredClone(story);
badModality.turns[0].modality = 'sms';
assert.ok(validateStory(badModality, schema).length > 0);
const silentVoice = structuredClone(story);
delete silentVoice.turns[1].voice_fixture;
assert.ok(validateStory(silentVoice, schema).some((error) => error.includes('voice_fixture')));
const badBackend = structuredClone(story);
badBackend.reply_backend = 'other';
assert.ok(validateStory(badBackend, schema).length > 0);
assert.ok(validateWave({}, schema).length > 0);

const blank = Array.from({ length: 11 }, (_, index) => ({ story_id: `s${index}` }));
const assigned = assignReplyBackends(blank);
assert.deepEqual(assigned.slice(0, 5).map((item) => item.reply_backend), Array(5).fill('openrouter'));
assert.deepEqual(assigned.slice(5, 10).map((item) => item.reply_backend), Array(5).fill('vk_bot_mcp'));
assert.equal(assigned[10].reply_backend, 'openrouter');
assert.equal(blank[0].reply_backend, undefined);
const mixed = assignReplyBackends([{ story_id: 'kept', reply_backend: 'vk_bot_mcp' }, ...Array.from({ length: 9 }, (_, index) => ({ story_id: `b${index}` }))]);
assert.equal(mixed[0].reply_backend, 'vk_bot_mcp');
assert.equal(mixed.filter((item) => item.reply_backend === 'openrouter').length, 5);
assert.equal(mixed.filter((item) => item.reply_backend === 'vk_bot_mcp').length, 5);
const overflow = assignReplyBackends([
  ...Array.from({ length: 6 }, (_, index) => ({ story_id: `o${index}`, reply_backend: 'openrouter' })),
  ...Array.from({ length: 4 }, (_, index) => ({ story_id: `u${index}` })),
]);
assert.equal(overflow.filter((item) => item.reply_backend === 'openrouter').length, 6);
assert.equal(overflow.filter((item) => item.reply_backend === 'vk_bot_mcp').length, 4);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dialog-'));
const pdf = path.join(dir, 'dialog.pdf');
const rendered = spawnSync(process.execPath, [
  'scripts/live-transcript-dialog-pdf.mjs',
  '--transcript', 'scripts/fixtures/harness/transcript-fixture.json',
  '--out', pdf,
  '--fixture',
], { cwd: root, encoding: 'utf8' });
assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout);
const text = extractPdfText(fs.readFileSync(pdf));
assert.match(text, /timing: jev=\d+ms gen=\d+ms model=\S+ tier=[1-4] max_tokens=\d+/);
assert.match(text, /TIMINGS/);
assert.match(text, /anthropic\/claude-haiku-5\.5/);
fs.rmSync(dir, { recursive: true, force: true });
console.log('test_vk_customer_harness_schema: ok');
