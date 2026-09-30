import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const text = await readFile(new URL('./offline-tests.txt', import.meta.url), 'utf8');
const tests = text
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));

if (!tests.length) {
  console.error('scripts/offline-tests.txt has no tests');
  process.exit(1);
}

for (const name of tests) {
  console.log(name);
  const result = spawnSync(process.execPath, [name], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status === null ? 1 : result.status);
}
