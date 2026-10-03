#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireShepherdStagingSmokeLock, isSmokeLockHeldError } from './shepherd-staging-smoke-single-instance.mjs';

const dir = mkdtempSync(join(tmpdir(), 'smoke-lock-'));
const lockPath = join(dir, 'shepherd-staging-smoke.lock');

writeFileSync(lockPath, '424242\n');
const afterStale = acquireShepherdStagingSmokeLock(lockPath);
afterStale.release();

const holder = spawn(process.execPath, [
  '-e',
  `import { acquireShepherdStagingSmokeLock } from ${JSON.stringify(fileURLToPath(new URL('./shepherd-staging-smoke-single-instance.mjs', import.meta.url)))};
   acquireShepherdStagingSmokeLock(${JSON.stringify(lockPath)});
   setInterval(() => {}, 60_000);`,
], { stdio: 'ignore' });

await new Promise((resolve) => setTimeout(resolve, 300));
let held = null;
try {
  acquireShepherdStagingSmokeLock(lockPath);
} catch (err) {
  held = err;
}
assert.ok(isSmokeLockHeldError(held));
holder.kill('SIGTERM');
await new Promise((resolve) => setTimeout(resolve, 100));

const first = acquireShepherdStagingSmokeLock(lockPath);
first.release();

console.log('shepherd staging smoke lock tests passed');
