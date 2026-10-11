#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { playwrightEvaluateReturnScript } from './shepherd-staging-smoke-page-eval.mjs';

const script = playwrightEvaluateReturnScript('const x = 41;', 'x + 1');
assert.equal(new Function(`return ${script}`)(), 42);

assert.throws(() => {
  // Playwright evaluates string scripts at top level (like eval), not as Function bodies.
  eval('const x = 1; return x;');
}, SyntaxError);

const scriptsDir = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
for (const file of ['shepherd-staging-smoke-thing-card.mjs', 'shepherd-staging-smoke-layout-nyc.mjs']) {
  const text = readFileSync(join(scriptsDir, file), 'utf8');
  assert.doesNotMatch(text, /page\.evaluate\(`[^`]*\breturn\b/, `${file} must not use bare return in page.evaluate string`);
  assert.match(text, /playwrightEvaluateReturnScript/, `${file} must use playwrightEvaluateReturnScript`);
}

console.log('shepherd page-eval tests passed');
