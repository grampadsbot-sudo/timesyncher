import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const dispatchDir = path.join(repo, 'scripts/ops/dispatch');
const modulePath = path.join(dispatchDir, 'lane_autofill_noprogress_guards.py');
const testLanePath = path.join(dispatchDir, 'test_lane_autofill.py');
const installPath = path.join(dispatchDir, 'install_dispatch_noprogress_fix_668.py');

assert.ok(fs.existsSync(modulePath), 'lane_autofill_noprogress_guards.py must exist');
assert.ok(fs.existsSync(testLanePath), 'test_lane_autofill.py must exist');
assert.ok(fs.existsSync(installPath), 'install_dispatch_noprogress_fix_668.py must exist');

for (const moduleName of ['test_lane_autofill', 'test_lane_autofill_noprogress_install_668']) {
  const unit = spawnSync('python3', ['-m', 'unittest', '-v', moduleName], {
    cwd: dispatchDir,
    encoding: 'utf8',
  });
  assert.equal(unit.status, 0, (unit.stderr || unit.stdout || `${moduleName} failed`).trim());
}

const compile = spawnSync(
  'python3',
  ['-m', 'py_compile', modulePath, installPath, testLanePath],
  { cwd: repo, encoding: 'utf8' },
);
assert.equal(compile.status, 0, compile.stderr || compile.stdout);

console.log('dispatch noprogress guards #668: unittest OK');
