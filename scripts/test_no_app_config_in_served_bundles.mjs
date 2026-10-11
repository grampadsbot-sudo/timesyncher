import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const needles = ['/api/auth/app-config', '/auth/app-config', 'getAppConfig', 'Rt.get("/auth/app-config")'];

async function filesUnder(dir) {
  const out = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(dir);
  return out;
}

function build() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || '0123456789abcdef0123456789abcdef01234567',
    };
    const child = spawn('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', env });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`vite build exited ${code}`))));
  });
}

function scanFile(file, body) {
  if (!/\.(html|js|mjs|css)$/i.test(file)) return;
  for (const needle of needles) {
    assert.equal(body.includes(needle), false, `${file} must not reference ${needle}`);
  }
}

const htmlEntries = [
  'index.html',
  'order-test.html',
  'addons-checkout.html',
  'owner-media-checkout.html',
  'access-checkout.html',
  'vacation-app.html',
  'shared-app.html',
];

for (const name of htmlEntries) {
  const body = await readFile(path.join(root, name), 'utf8');
  scanFile(name, body);
}

for (const file of await filesUnder(path.join(root, 'public'))) {
  if (!/\.(js|mjs|html|css)$/i.test(file)) continue;
  const body = await readFile(file, 'utf8');
  scanFile(path.relative(root, file), body);
}

await build();
const dist = path.join(root, 'dist');
for (const file of await filesUnder(dist)) {
  if (!/\.(html|js|mjs|css)$/i.test(file)) continue;
  const body = await readFile(file, 'utf8');
  scanFile(path.relative(root, file), body);
}

console.log('no app-config in served bundles passed');
