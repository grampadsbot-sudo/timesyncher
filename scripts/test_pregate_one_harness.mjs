#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const testFiles = [
  new URL('ops/dispatch/test_pregate_one_harness.py', import.meta.url).pathname,
  new URL('ops/dispatch/test_gateb_exemption_harness.py', import.meta.url).pathname,
];

for (const testFile of testFiles) {
  const result = spawnSync('python3', [testFile], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}
console.log('pregate_one harness tests passed');
