import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testFile = new URL('ops/dispatch/test_gateb_map680_harness.py', import.meta.url).pathname;
const map680 = new URL('ops/dispatch/map680/test_gateb_map680.py', import.meta.url).pathname;

for (const f of [testFile, map680]) {
  const r = spawnSync('python3', [f], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log('gateb_map680 harness tests passed');
