import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readOfflineTestList } from './lib/offline-test-list.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = fileURLToPath(new URL('./offline-tests.d/', import.meta.url));

let tests;
try {
  tests = readOfflineTestList(dir);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

for (const name of tests) {
  console.log(name);
  const result = spawnSync(process.execPath, [name], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status === null ? 1 : result.status);
}
