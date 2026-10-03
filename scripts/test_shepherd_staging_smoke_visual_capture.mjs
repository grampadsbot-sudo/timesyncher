#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureVisualStateScreenshots } from './shepherd-staging-smoke-visual-capture.mjs';

assert.equal(typeof captureVisualStateScreenshots, 'function');
const src = readFileSync('scripts/shepherd-staging-smoke-visual-capture.mjs', 'utf8');
assert.match(src, /Day-by-Day/, 'shared visual capture must know Day-by-Day tab');
assert.match(src, /gotoAndHydrateSharedIntakePage/, 'shared hydrate path required for v1site shots');
assert.match(src, /runLayoutDomEval/, 'each shot must attach LAYOUT DOM facts for judge prompt');

console.log('visual capture module contract ok');
