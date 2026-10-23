import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const modulePath = path.join(repo, 'scripts/ops/dispatch/dispatch_stall_guards.py');
const testPath = path.join(repo, 'scripts/ops/dispatch/test_dispatch_stall_guards.py');
const installPath = path.join(repo, 'scripts/ops/dispatch/install_dispatch_stall_fix_649.py');

assert.ok(fs.existsSync(modulePath), 'dispatch_stall_guards.py must exist');
assert.ok(fs.existsSync(installPath), 'install_dispatch_stall_fix_649.py must exist');

const unit = spawnSync('python3', ['-m', 'unittest', '-v', 'test_dispatch_stall_guards'], {
  cwd: path.dirname(testPath),
  encoding: 'utf8',
});
assert.equal(unit.status, 0, (unit.stderr || unit.stdout || 'unittest failed').trim());

const compile = spawnSync('python3', ['-m', 'py_compile', modulePath, installPath], {
  cwd: repo,
  encoding: 'utf8',
});
assert.equal(compile.status, 0, compile.stderr || compile.stdout);

console.log('dispatch stall guards #649: %s', (unit.stdout || '').trim().split('\n').slice(-3).join(' | '));
