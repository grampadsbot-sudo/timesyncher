import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const dispatchDir = path.join(repo, 'scripts/ops/dispatch');
const modulePath = path.join(dispatchDir, 'hold_after_guards.py');
const installPath = path.join(dispatchDir, 'install_dispatch_hold_after_fix_685.py');

assert.ok(fs.existsSync(modulePath), 'hold_after_guards.py must exist');
assert.ok(fs.existsSync(installPath), 'install_dispatch_hold_after_fix_685.py must exist');

for (const moduleName of ['test_hold_after_guards', 'test_hold_after_install_685']) {
  const unit = spawnSync('python3', ['-m', 'unittest', '-v', moduleName], {
    cwd: dispatchDir,
    encoding: 'utf8',
  });
  assert.equal(unit.status, 0, (unit.stderr || unit.stdout || `${moduleName} failed`).trim());
}

const compile = spawnSync(
  'python3',
  ['-m', 'py_compile', modulePath, installPath],
  { cwd: repo, encoding: 'utf8' },
);
assert.equal(compile.status, 0, compile.stderr || compile.stdout);

console.log('dispatch hold:after guards #685: unittest OK');
