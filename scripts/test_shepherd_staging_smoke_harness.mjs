#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  SMOKE_CHECK_ORDER,
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
const tailText = readFileSync(join(scriptsDir, 'shepherd-staging-smoke-tail.mjs'), 'utf8');
const lateText = readFileSync(join(scriptsDir, 'shepherd-staging-smoke-late-checks.mjs'), 'utf8');
const combined = `${mainText}\n${lateText}\n${tailText}`;

const runCheckRe = /runCheck\s*\(\s*['"]([^'"]+)['"]\s*,[\s\S]*?\{\s*timeoutMs\s*:\s*(\d+)/g;
const registered = new Set();
let m;
while ((m = runCheckRe.exec(combined)) !== null) {
  registered.add(m[1]);
}

for (const name of SMOKE_CHECK_ORDER) {
  assert.ok(registered.has(name), `missing runCheck('${name}', ..., { timeoutMs })`);
}

assert.equal(sharedTabLabelIncludes('🗺️ Plan', 'plan'), true);
assert.equal(sharedTabLabelIncludes('💰 Budget', 'budget'), true);
assert.equal(normalizeSharedTabLabel('  🏨  Hotels '), 'hotels');

console.log(JSON.stringify({ ok: true, harnessFiles, registered: [...registered].sort() }));
