#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const testFile = new URL('ops/dispatch/test_vk_live_row_check.py', import.meta.url).pathname;
const result = spawnSync('python3', [testFile], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) {
  process.exit(result.status === null ? 1 : result.status);
}
console.log('vk_live_row_check harness tests passed');
