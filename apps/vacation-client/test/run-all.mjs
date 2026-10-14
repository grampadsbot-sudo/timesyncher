import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(testDir, '..');

const all = readdirSync(testDir)
  .filter((name) => name.endsWith('.mjs') && name !== 'run-all.mjs')
  .sort();

const layoutModules = new Set(all.filter((name) => name.endsWith('-layout.mjs') || name === 'shell-layout.mjs'));

function runFile(name) {
  console.log(`> node test/${name}`);
  const result = spawnSync(process.execPath, [path.join(testDir, name)], {
    cwd: clientRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

for (const name of all) {
  if (name.endsWith('.unit.mjs')) {
    runFile(name);
    continue;
  }
  if (layoutModules.has(name)) {
    if (name !== 'shell-layout.mjs') continue;
    const chrome =
      process.env.CHROME_PATH ||
      process.env.VACATION_CLIENT_RUN_LAYOUT ||
      process.env.VACATION_CLIENT_SHELL_ARTIFACT_ROOT;
    if (!chrome) {
      console.log(
        'skip shell-layout.mjs (offline CI: set CHROME_PATH or VACATION_CLIENT_RUN_LAYOUT to run layout tests)',
      );
      continue;
    }
    runFile(name);
  }
}

console.log('vacation-client tests finished');
