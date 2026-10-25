import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const dispatchDir = path.join(repo, 'scripts/ops/dispatch');
const stepPath = path.join(dispatchDir, 'gateb_coverage_step.py');
const uiPaths = path.join(repo, 'scripts/ops/gateb/ui_paths.py');
const installPath = path.join(dispatchDir, 'install_gateb_coverage_argv_fix_711.py');

assert.ok(fs.existsSync(stepPath), 'gateb_coverage_step.py must exist');
assert.ok(fs.existsSync(uiPaths), 'ui_paths.py must exist');
assert.ok(fs.existsSync(installPath), 'install_gateb_coverage_argv_fix_711.py must exist');

for (const moduleName of [
  'test_gateb_coverage_argv_harness',
  'test_gateb_coverage_argv_install_711',
]) {
  const unit = spawnSync('python3', ['-m', 'unittest', moduleName], {
    cwd: dispatchDir,
    encoding: 'utf8',
  });
  assert.equal(unit.status, 0, (unit.stderr || unit.stdout || moduleName).trim());
}

const compile = spawnSync(
  'python3',
  ['-m', 'py_compile', stepPath, uiPaths, installPath],
  { cwd: repo, encoding: 'utf8' },
);
assert.equal(compile.status, 0, compile.stderr || compile.stdout);

console.log('gateb coverage argv harness #711: ok');
