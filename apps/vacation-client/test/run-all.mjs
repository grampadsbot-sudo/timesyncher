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

function resolveLayoutChromeEnv() {
  if (process.env.VACATION_CLIENT_ALLOW_LAYOUT_SKIP === '1') return null;
  const explicit = process.env.CHROME_PATH
    || process.env.VACATION_CLIENT_RUN_LAYOUT
    || process.env.VACATION_CLIENT_SHELL_ARTIFACT_ROOT;
  if (explicit) return { ...process.env };
  if (Object.prototype.hasOwnProperty.call(process.env, 'CHROME_PATH') && process.env.CHROME_PATH === '') {
    return null;
  }
  if (spawnSync('test', ['-x', '/usr/local/bin/google-chrome']).status === 0) {
    return { ...process.env, CHROME_PATH: '/usr/local/bin/google-chrome' };
  }
  return null;
}

function runFile(name, env = process.env) {
  console.log(`> node test/${name}`);
  const result = spawnSync(process.execPath, [path.join(testDir, name)], {
    cwd: clientRoot,
    stdio: 'inherit',
    env,
  });
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

let layoutRan = false;

for (const name of all) {
  if (name.endsWith('.unit.mjs')) {
    if (name === 'run-all.unit.mjs' && process.env.VACATION_CLIENT_RUN_ALL_GATE_TEST === '1') {
      continue;
    }
    runFile(name);
    continue;
  }
  if (layoutModules.has(name)) {
    if (name !== 'shell-layout.mjs') continue;
    const layoutEnv = resolveLayoutChromeEnv();
    if (!layoutEnv) {
      process.stderr.write('layout acceptance unavailable: set CHROME_PATH or install google-chrome for shell-layout.mjs\n');
      process.exit(1);
    }
    runFile(name, layoutEnv);
    layoutRan = true;
  }
}

if (!layoutRan) {
  process.stderr.write('layout acceptance unavailable: shell-layout.mjs did not run\n');
  process.exit(1);
}

console.log('vacation-client tests finished');
