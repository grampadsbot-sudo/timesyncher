import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

import { assertPatchedStyleTwo } from '../src/vacation/trek-style2-bundle.mjs';
import {
  CANNED_STRIP_RULES,
  FORBIDDEN_SERVED_STRINGS,
  SO_ORIGIN_NEEDLE,
} from './strip-served-trek-bundle.mjs';

const served = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');

for (const rule of CANNED_STRIP_RULES) {
  assert.equal(served.includes(rule.needle), false, `committed served bundle still has ${rule.id}`);
}
for (const forbidden of FORBIDDEN_SERVED_STRINGS) {
  assert.equal(served.includes(forbidden), false, `committed served bundle still contains a forbidden string`);
}
assert.equal(served.includes(SO_ORIGIN_NEEDLE), false);
assert.equal(served.includes('https://travel.timesyncher.com'), false);
assert.equal(served.split('/timesyncher/i.test(').length - 1, 1);
assert.equal(served.includes('dn=!0'), false);
assertPatchedStyleTwo(served);
for (const inserted of [
  '/ts-thing-logos/bellagio.svg',
  'Bellagio — Alex & Kim Anniversary Stay',
  'CATCH Las Vegas',
  'las vegas strip',
  'Las Vegas',
  'las vegas',
  'Mon Ami Gabi',
  'shake shack',
]) {
  assert.equal(served.includes(inserted), false, `committed served bundle still inserts a place name`);
}

const checkedPath = '/tmp/served-trek-strip-check.js';
await writeFile(checkedPath, served);
const checked = spawnSync(process.execPath, ['--check', checkedPath], { encoding: 'utf8' });
assert.equal(checked.status, 0, checked.stderr || 'served bundle failed node --check');

console.log('trek bundle strip tests passed');
