#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkIOutboundPassesSmokeHarness } from './shepherd-staging-smoke-env.mjs';
import { normalizePngBufferInput, measureLogoComFromPngBuffer } from './shepherd-staging-smoke-logo-metrics.mjs';
import {
  HARNESS_SEEDED_BIND_THING_MEDIA,
  harnessSeededBindThingMediaUrl,
  runBindThingMediaCacheCheck,
} from './shepherd-staging-smoke-bind-thing-media-cache.mjs';
import { acquireShepherdStagingSmokeLock, isSmokeLockHeldError } from './shepherd-staging-smoke-single-instance.mjs';
import { sendWithResend } from '../src/vacation/email-harness-outbound.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const png = new PNG({ width: 4, height: 4 });
for (let y = 0; y < 4; y += 1) {
  for (let x = 0; x < 4; x += 1) {
    const i = (y * 4 + x) * 4;
    const dark = x === 1 && y === 1;
    png.data[i] = dark ? 0 : 250;
    png.data[i + 1] = dark ? 0 : 250;
    png.data[i + 2] = dark ? 0 : 250;
    png.data[i + 3] = 255;
  }
}
const buf = PNG.sync.write(png);
const fromBuf = await measureLogoComFromPngBuffer(buf);
const fromUint = await measureLogoComFromPngBuffer(new Uint8Array(buf));
assert.equal(fromBuf.error, undefined);
assert.equal(fromUint.error, undefined);
assert.throws(() => normalizePngBufferInput({}), /unsupported/);

const lockDir = mkdtempSync(join(tmpdir(), 'smoke-lock-'));
const lockPath = join(lockDir, 'shepherd-staging-smoke.lock');
writeFileSync(lockPath, '424242\n');
acquireShepherdStagingSmokeLock(lockPath).release();
const holder = spawn(process.execPath, [
  '-e',
  `import { acquireShepherdStagingSmokeLock } from ${JSON.stringify(fileURLToPath(new URL('./shepherd-staging-smoke-single-instance.mjs', import.meta.url)))};
   acquireShepherdStagingSmokeLock(${JSON.stringify(lockPath)});
   setInterval(() => {}, 60_000);`,
], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 300));
let held = null;
try { acquireShepherdStagingSmokeLock(lockPath); } catch (err) { held = err; }
assert.ok(isSmokeLockHeldError(held));
holder.kill('SIGTERM');

const envText = readFileSync(new URL('./shepherd-staging-smoke-env.mjs', import.meta.url), 'utf8');
assert.match(envText, /TIMESYNCHER_HARNESS_STUB_OUTBOUND = '1'/);
const mainText = readFileSync(new URL('./shepherd-staging-smoke-main.mjs', import.meta.url), 'utf8');
assert.match(mainText, /checkIOutboundPassesSmokeHarness/);
const stubEnv = { TIMESYNCHER_HARNESS_STUB_OUTBOUND: '1', RESEND_API_KEY: 're_test' };
const sent = await sendWithResend({
  to: 'collab-invite-deadbeef-1@resend.dev',
  subject: 'x',
  htmlBody: '<p>x</p>',
  textBody: 'x',
  env: stubEnv,
  fromEmailFn: () => 'from@example.com',
});
assert.equal(sent.stubbed, true);
assert.equal(checkIOutboundPassesSmokeHarness({ status: 'stubbed', provider: 'harness_stub' }, stubEnv), true);

const verifyLayout = readFileSync(
  new URL('../.cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs', import.meta.url),
  'utf8',
);
assert.match(verifyLayout, /configureShepherdSmokeHelpers/);

const base = 'https://vacation-staging.timesyncher.com';
const seededUrl = harnessSeededBindThingMediaUrl(base);
assert.match(seededUrl, new RegExp(HARNESS_SEEDED_BIND_THING_MEDIA.bindingId));
const missing = await runBindThingMediaCacheCheck({
  BASE: base,
  fetchImpl: async () => ({ status: 404, headers: { get: () => '' } }),
});
assert.equal(missing.check208.failReason, 'harness_seeded_bind_thing_media_not_found_http_404');

console.log('shepherd staging smoke eng rulings tests passed');
