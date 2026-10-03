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
import { evaluateComposerControlsOnly } from './shepherd-staging-smoke-layout-eval.mjs';

function mockComposerEl({ id = '', className = '', hidden = false } = {}) {
  const style = { display: hidden ? 'none' : 'block', visibility: 'visible', opacity: '1' };
  return {
    id,
    tagName: 'BUTTON',
    className,
    classList: { contains: (c) => String(className).split(/\s+/).includes(c) },
    getBoundingClientRect: () => ({ width: 40, height: 40, top: 0, left: 0, right: 40, bottom: 40 }),
    _style: style,
  };
}

function composerFailures({ send }) {
  const failures = [];
  const attach = mockComposerEl({ id: 'attachButton' });
  const voice = mockComposerEl({ id: 'voiceButton' });
  const textarea = mockComposerEl({ id: 'messageText' });
  const gridChildren = [textarea, attach, voice, send].filter(Boolean);
  const grid = { querySelectorAll: () => gridChildren };
  const nodes = {
    '.compose-grid, #composer': grid,
    '#attachButton': attach,
    '#voiceButton': voice,
    '.send-button, button[type="submit"][form], #composer button.send-button, button.send-button': send,
    '#messageText, textarea[name="message"], #composer textarea': textarea,
  };
  evaluateComposerControlsOnly({
    pageKind: 'chat',
    querySelector: (sel) => nodes[sel] || null,
    getComputedStyle: (el) => el._style,
    push: (_s, _r, detail) => failures.push(detail),
    applies: (rule) => rule === 'composer_controls_only',
    rectObj: () => null,
  });
  return failures;
}

assert.equal(composerFailures({ send: mockComposerEl({ className: 'send-button' }) }).some((d) => /send button/i.test(d)), false);
assert.equal(composerFailures({ send: null }).some((d) => /visible send button/i.test(d)), true);

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
