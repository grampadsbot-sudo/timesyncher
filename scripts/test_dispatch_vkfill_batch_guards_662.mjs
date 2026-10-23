import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const modulePath = path.join(repo, 'scripts/ops/dispatch/vkfill_batch_guards.py');
const testPath = path.join(repo, 'scripts/ops/dispatch/test_vkfill_batch_guards.py');
const installPath = path.join(repo, 'scripts/ops/dispatch/install_dispatch_vkfill_batch_fix_662.py');
const stallPath = path.join(repo, 'scripts/ops/dispatch/dispatch_stall_guards.py');

assert.ok(fs.existsSync(modulePath), 'vkfill_batch_guards.py must exist');
assert.ok(fs.existsSync(stallPath), 'dispatch_stall_guards.py must exist');
assert.ok(fs.existsSync(installPath), 'install_dispatch_vkfill_batch_fix_662.py must exist');

const unit = spawnSync('python3', ['-m', 'unittest', '-v', 'test_vkfill_batch_guards'], {
  cwd: path.dirname(testPath),
  encoding: 'utf8',
});
assert.equal(unit.status, 0, (unit.stderr || unit.stdout || 'unittest failed').trim());

const compile = spawnSync(
  'python3',
  ['-m', 'py_compile', modulePath, installPath, stallPath],
  { cwd: repo, encoding: 'utf8' },
);
assert.equal(compile.status, 0, compile.stderr || compile.stdout);

console.log('vkfill batch guards #662: %s', (unit.stdout || '').trim().split('\n').slice(-3).join(' | '));
