#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ok = spawnSync('node', ['scripts/check-harness-protected-offline.mjs'], { cwd: root, encoding: 'utf8' });
assert.equal(ok.status, 0, ok.stderr || ok.stdout);

const dir = mkdtempSync(join(tmpdir(), 'harness-protected-'));
try {
  writeFileSync(join(dir, 'harness-protected-offline.txt'), readFileSync(join(root, 'scripts/harness-protected-offline.txt'), 'utf8'));
  const offlineDir = join(dir, 'offline-tests.d');
  cpSync(join(root, 'scripts/offline-tests.d'), offlineDir, { recursive: true });
  const drop = readdirSync(offlineDir).find((name) => readFileSync(join(offlineDir, name), 'utf8').includes('scripts/test_passb_scorecard_harness_687.mjs'));
  assert.ok(drop, 'protected scorecard entry has a file');
  rmSync(join(offlineDir, drop));
  const fail = spawnSync('node', [join(root, 'scripts/check-harness-protected-offline.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      HARNESS_PROTECTED_SCRIPTS_DIR: dir,
      HARNESS_PROTECTED_REPO_ROOT: root,
    },
  });
  assert.notEqual(fail.status, 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('test_check_harness_protected_offline: ok');
