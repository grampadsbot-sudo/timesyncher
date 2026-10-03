#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildVisualJudgePrompt } from './shepherd-staging-smoke-visual-rubric.mjs';

const visualText = readFileSync(new URL('./shepherd-staging-smoke-visual.mjs', import.meta.url), 'utf8');
assert.match(visualText, /preflight,\s*\n\s*judged/);
assert.match(visualText, /verdictDoc\.preflight = preflight/);

const spineText = readFileSync(new URL('./shepherd-staging-smoke-layout-visual-spine.mjs', import.meta.url), 'utf8');
assert.match(spineText, /preflight: visual\.preflight/);

const chatPrompt = buildVisualJudgePrompt({
  screenLabel: 'v1 chat 390',
  pageKind: 'chat',
  stateId: 'v1',
  tabLabel: '',
  viewport: { width: 390, height: 844 },
  screenSpecText: 'spec',
  specSource: 'test',
  layoutDomFacts: 'LAYOUT DOM ground truth: PASS',
});
assert.match(chatPrompt, /CHAT app/);
assert.match(chatPrompt, /accessible name is "Send"/);

const sharedPrompt = buildVisualJudgePrompt({
  screenLabel: 'v1site site/Day-by-Day 390',
  pageKind: 'shared',
  stateId: 'v1site',
  tabLabel: 'Day-by-Day',
  viewport: { width: 390, height: 844 },
  screenSpecText: 'spec',
  specSource: 'test',
  layoutDomFacts: '',
});
assert.match(sharedPrompt, /Do NOT fail rubric item 2/);

console.log('shepherd visual preflight wiring tests passed');
