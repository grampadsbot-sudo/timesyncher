#!/usr/bin/env node
import assert from 'node:assert/strict';
import { layoutFactsForPrompt } from './shepherd-staging-smoke-layout-dom.mjs';
import {
  ensureLayoutArtifactDir,
  summarizeLayoutFailures,
} from './shepherd-staging-smoke-layout.mjs';
import {
  judgeScreenshotsParallel,
  VISUAL_JUDGE_MODEL,
} from './shepherd-staging-smoke-visual-judge.mjs';
import {
  VISUAL_RUBRIC_VERSION,
  loadVisualScreenSpec,
} from './shepherd-staging-smoke-visual-rubric.mjs';
import { mintVisualStateCustomers } from './shepherd-staging-smoke-visual-states.mjs';

assert.match(layoutFactsForPrompt({ pass: true }), /PASS/);
assert.match(
  layoutFactsForPrompt({ pass: false, failures: [{ rule: 'x', selector: 'y', detail: 'z' }] }),
  /FAIL/,
);
assert.equal(typeof summarizeLayoutFailures([]), 'string');
ensureLayoutArtifactDir('/tmp/ts-layout-artifact-smoke');
assert.equal(VISUAL_JUDGE_MODEL.includes('/'), true);
assert.match(VISUAL_RUBRIC_VERSION, /shepherd-visual-rubric/);
assert.equal(typeof loadVisualScreenSpec().text, 'string');
assert.equal(typeof mintVisualStateCustomers, 'function');
const judged = await judgeScreenshotsParallel([], { apiKey: '', concurrency: 1 });
assert.deepEqual(judged, []);

console.log(JSON.stringify({ ok: true }));
