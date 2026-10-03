#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  SMOKE_CHECK_ORDER,
  SMOKE_PARALLEL_INDEPENDENT_NAMES,
} from './shepherd-staging-smoke-run-check.mjs';
import {
  normalizeSharedTabLabel,
  sharedTabLabelIncludes,
} from './shepherd-staging-smoke-lib.mjs';

const scriptsDir = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const harnessFiles = readdirSync(scriptsDir)
  .filter((name) => name.startsWith('shepherd-staging-smoke') && name.endsWith('.mjs') && name !== 'shepherd-staging-smoke-run-check.mjs');

for (const file of harnessFiles) {
  const text = readFileSync(join(scriptsDir, file), 'utf8');
  assert.equal(/\bout\.checks\s*[.=[]/.test(text), false, `${file} must not assign out.checks (use runCheck)`);
}

const mainText = readFileSync(join(scriptsDir, 'shepherd-staging-smoke.mjs'), 'utf8');
const spineText = readFileSync(join(scriptsDir, 'shepherd-staging-smoke-main.mjs'), 'utf8');
const parallelText = readFileSync(join(scriptsDir, 'shepherd-staging-smoke-parallel.mjs'), 'utf8');
const tailText = readFileSync(join(scriptsDir, 'shepherd-staging-smoke-tail.mjs'), 'utf8');
const runCheckText = readFileSync(join(scriptsDir, 'shepherd-staging-smoke-run-check.mjs'), 'utf8');
const combined = `${mainText}\n${spineText}\n${parallelText}\n${tailText}`;

const runCheckRe = /runCheck\s*\(\s*['"]([^'"]+)['"]\s*,[\s\S]*?\{\s*timeoutMs\s*:\s*(\d+)/g;
const registered = new Set();
let m;
while ((m = runCheckRe.exec(combined)) !== null) {
  registered.add(m[1]);
}

for (const name of SMOKE_CHECK_ORDER) {
  const hasRunCheck = registered.has(name);
  const parallelEntry = SMOKE_PARALLEL_INDEPENDENT_NAMES.includes(name)
    && /name:\s*['"]/.test(combined)
    && new RegExp(`name:\\s*['"]${name}['"]`).test(combined);
  assert.ok(hasRunCheck || parallelEntry, `missing runCheck('${name}', ..., { timeoutMs }) or parallel entry name: '${name}'`);
}

assert.equal(/\bconst WHOLE_RUN_CAP_MS = 12 \* 60 \* 1000/.test(runCheckText), true, 'whole-run cap must be 12 minutes');
assert.match(runCheckText, /runChecksParallel/, 'run-check must export parallel runner');
assert.doesNotMatch(runCheckText, /\bexport const WHOLE_RUN_CAP_MS\b/, 'WHOLE_RUN_CAP_MS must not be a dead export');

assert.equal(sharedTabLabelIncludes('🗺️ Plan', 'plan'), true);
assert.equal(sharedTabLabelIncludes('💰 Budget', 'budget'), true);
assert.equal(normalizeSharedTabLabel('  🏨  Hotels '), 'hotels');

console.log(JSON.stringify({ ok: true, harnessFiles, registered: [...registered].sort() }));
