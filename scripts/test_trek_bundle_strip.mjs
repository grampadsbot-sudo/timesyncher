import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

import { assertPatchedStyleTwo, renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import {
  CANNED_STRIP_RULES,
  FORBIDDEN_SERVED_STRINGS,
  stripCannedBundle,
} from './strip-served-trek-bundle.mjs';

const raw = await readFile(new URL('../public/assets/upstream/index-BKun7ofk.js', import.meta.url), 'utf8');
const stripped = stripCannedBundle(raw);

assert.equal(stripped.counts.length, CANNED_STRIP_RULES.length);
for (const rule of CANNED_STRIP_RULES) {
  const row = stripped.counts.find((item) => item.id === rule.id);
  assert.ok(row, rule.id);
  assert.equal(row.count, 1, `${rule.id} matched ${row.count} time(s); expected 1`);
  assert.equal(raw.split(rule.needle).length - 1, 1, `${rule.id} raw needle drifted`);
}

for (const forbidden of FORBIDDEN_SERVED_STRINGS) {
  assert.equal(stripped.source.includes(forbidden), false, `stripped output still contains ${forbidden}`);
}

const served = renderServedTrekBundle(raw);
for (const forbidden of FORBIDDEN_SERVED_STRINGS) {
  assert.equal(served.includes(forbidden), false, `served output still contains ${forbidden}`);
}
assertPatchedStyleTwo(served);

const checkedPath = '/tmp/served-trek-strip-check.js';
await writeFile(checkedPath, served);
const checked = spawnSync(process.execPath, ['--check', checkedPath], { encoding: 'utf8' });
assert.equal(checked.status, 0, checked.stderr || 'served bundle failed node --check');

console.log(stripped.counts.map((row) => `${row.id}=${row.count}`).join('\n'));
console.log('trek bundle strip tests passed');
