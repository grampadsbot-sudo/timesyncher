#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const visualText = readFileSync(new URL('./shepherd-staging-smoke-visual.mjs', import.meta.url), 'utf8');
assert.match(visualText, /sendCropInk:\s*verdict\.sendCropInk/);
assert.match(visualText, /sendDomStructural:\s*verdict\.sendDomStructural/);

console.log('shepherd visual verdict persist tests passed');
