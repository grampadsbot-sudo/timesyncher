#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const testFile = new URL('../tests/test_tsv_guard.py', import.meta.url).pathname;

const result = spawnSync('python3', [testFile], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) {
  process.exit(result.status === null ? 1 : result.status);
}
console.log('tsv guard data-fault resolution tests passed');
