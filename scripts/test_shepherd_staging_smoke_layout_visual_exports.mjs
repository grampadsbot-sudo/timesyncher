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
import { evaluateComposerControlsOnly } from './shepherd-staging-smoke-composer-send.mjs';

function mockComposerEl({ id = '', className = '', ariaLabel = '', hidden = false } = {}) {
  const style = { display: hidden ? 'none' : 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' };
  return {
    id,
    tagName: 'BUTTON',
    disabled: false,
    className,
    classList: { contains: (c) => String(className).split(/\s+/).includes(c) },
    getAttribute(name) {
      if (name === 'aria-label') return ariaLabel;
      return null;
    },
    getBoundingClientRect: () => ({ width: 40, height: 40, top: 700, left: 330, right: 370, bottom: 740 }),
    contains: () => false,
    _style: style,
  };
}

function composerFailures({ send }) {
  const failures = [];
  const attach = mockComposerEl({ id: 'attachButton' });
  const voice = mockComposerEl({ id: 'voiceButton' });
  const textarea = mockComposerEl({ id: 'messageText', tagName: 'TEXTAREA' });
  const gridChildren = [attach, textarea, voice, send].filter(Boolean);
  const grid = { querySelectorAll: (sel) => (String(sel) === 'button' ? gridChildren.filter((c) => c.tagName === 'BUTTON') : gridChildren) };
  const form = { querySelector: (sel) => (String(sel).includes('compose-grid') ? grid : null) };
  const nodes = {
    'form#composer, form.composer#composer, #composer': form,
    '#attachButton': attach,
    '#voiceButton': voice,
    '#messageText, textarea[name="message"], #composer textarea': textarea,
  };
  evaluateComposerControlsOnly({
    pageKind: 'chat',
    querySelector: (sel) => nodes[sel] || null,
    getComputedStyle: (el) => el._style,
    push: (_s, _r, detail) => failures.push(detail),
    applies: (rule) => rule === 'composer_controls_only',
    rectObj: () => null,
    elementFromPoint: () => send,
    innerWidth: 390,
    innerHeight: 844,
  });
  return failures;
}

assert.equal(composerFailures({ send: mockComposerEl({ id: 'sendButton', ariaLabel: 'Send' }) }).length, 0);
assert.equal(composerFailures({ send: null }).some((d) => /Send button/i.test(d)), true);

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
