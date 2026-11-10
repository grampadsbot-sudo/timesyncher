import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSha,
  buildStampCustomerHideHeadMarkup,
  BUILD_STAMP_CUSTOMER_HIDE_CSS,
  BUILD_STAMP_CUSTOMER_HIDE_JS,
} from '../routes/version.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');

const htmlEntries = [
  'index.html',
  'privacy.html',
  'terms.html',
  'support.html',
  'login.html',
  'order-test.html',
  'addons-checkout.html',
  'owner-media-checkout.html',
  'access-checkout.html',
  'order-success.html',
  'admin-onboardings.html',
  'openclaw-admin.html',
  'itinerary.html',
  'vacation-app.html',
  'shared-app.html',
  'onboarding-eula.html',
];

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || '0123456789abcdef0123456789abcdef01234567',
      },
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`vite build exited ${code}`))));
  });
}

function stampValue(body) {
  const meta = body.match(/<meta\b[^>]*\bname="timesyncher-build"[^>]*>/i);
  const content = meta && meta[0].match(/\bcontent="([^"]*)"/i);
  return (content && content[1]) || '';
}

const hideCss = await readFile(path.join(root, 'public', 'ts-build-stamp-customer-hide.css'), 'utf8');
assert.match(hideCss, /footer\[data-build-stamp="1"\]/);
assert.match(hideCss, /visibility:\s*hidden/);
assert.match(buildStampCustomerHideHeadMarkup(), new RegExp(BUILD_STAMP_CUSTOMER_HIDE_CSS.replace(/\//g, '\\/')));
assert.match(buildStampCustomerHideHeadMarkup(), new RegExp(BUILD_STAMP_CUSTOMER_HIDE_JS.replace(/\//g, '\\/')));

process.env.VERCEL_GIT_COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA || '0123456789abcdef0123456789abcdef01234567';
const expectedSha = buildSha();

await build();

for (const name of htmlEntries) {
  const built = await readFile(path.join(dist, name), 'utf8');
  assert.match(built, /ts-build-stamp-customer-hide\.css/, `${name} missing customer-hide css link`);
  assert.match(built, /ts-build-stamp-customer-hide\.js/, `${name} missing customer-hide js`);
  const metaSha = stampValue(built);
  assert.equal(metaSha, expectedSha, `${name} meta build sha`);
  assert.match(built, new RegExp(`<footer data-build-stamp="1">${expectedSha.slice(0, 7)}</footer>`), `${name} dom stamp footer`);
}

console.log('build stamp customer hidden markup passed');
