#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildVisualJudgePrompt } from './shepherd-staging-smoke-visual-rubric.mjs';

const rubricSource = readFileSync(new URL('./shepherd-staging-smoke-visual-rubric.mjs', import.meta.url), 'utf8');
assert.match(rubricSource, /icon-only up-arrow|paper-plane/i);
assert.match(rubricSource, /composer row/i);

const prompt = buildVisualJudgePrompt({
  screenLabel: 'v1 composer',
  pageKind: 'chat',
  stateId: 'v1',
  tabLabel: '',
  viewport: { width: 390, height: 844 },
  screenSpecText: 'spec',
  specSource: 'test',
  layoutDomFacts: '',
});
assert.match(prompt, /icon-only up-arrow|paper-plane/i);
assert.match(prompt, /DOM harness separately requires accessible name Send/i);

console.log('shepherd visual rubric icon send test passed');
