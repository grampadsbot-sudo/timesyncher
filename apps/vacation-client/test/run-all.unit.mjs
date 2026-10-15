import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(testDir, '..');

const skipped = spawnSync(process.execPath, [path.join(testDir, 'run-all.mjs')], {
  cwd: clientRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    VACATION_CLIENT_RUN_ALL_GATE_TEST: '1',
    CHROME_PATH: '',
  },
});
assert.notEqual(skipped.status, 0, 'run-all must fail when layout suites are unavailable');
assert.match(skipped.stderr || skipped.stdout, /layout acceptance unavailable/i);

console.log('run-all.unit.mjs: ok');
