#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JUDGE_MODEL, judgeScreenshot } from '../.cursor/skills/verify-timesyncher-vacation/scripts/layout-judge.mjs';
import { VISUAL_JUDGE_MODEL } from './shepherd-staging-smoke-visual-rubric.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const png = new PNG({ width: 2, height: 2 });
for (let i = 0; i < png.data.length; i += 4) {
  png.data[i] = 200;
  png.data[i + 1] = 200;
  png.data[i + 2] = 200;
  png.data[i + 3] = 255;
}
const pngPath = join(mkdtempSync(join(tmpdir(), 'layout-judge-')), 'shot.png');
writeFileSync(pngPath, PNG.sync.write(png));

assert.equal(JUDGE_MODEL, VISUAL_JUDGE_MODEL);

let postedBody = null;
const verdict = await judgeScreenshot({
  pngPath,
  specText: 'Composer shows send button.',
  env: { OPENROUTER_API_KEY: 'test-key' },
  fetchImpl: async (_url, init) => {
    postedBody = JSON.parse(init.body);
    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [{ message: { content: '{"verdict":"yes","mismatches":[]}' } }],
        model: JUDGE_MODEL,
      }),
    };
  },
});

assert.equal(verdict.ok, true);
assert.equal(postedBody.model, VISUAL_JUDGE_MODEL);
assert.equal(postedBody.response_format?.type, 'json_object');
assert.equal(postedBody.messages[0].content.some((part) => part.type === 'image_url'), true);

const bad = await judgeScreenshot({
  pngPath,
  specText: 'x',
  env: { OPENROUTER_API_KEY: 'test-key' },
  fetchImpl: async () => ({
    ok: false,
    status: 400,
    text: async () => '{"error":"bad model"}',
  }),
});
assert.match(bad.error, /judge HTTP 400/);
assert.match(bad.body, /bad model/);

console.log('verify-layout judge openrouter test passed');
