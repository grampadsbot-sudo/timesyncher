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
import { buildSmokeBindThingMediaSeed } from './shepherd-staging-smoke-bind-thing-media-seed.mjs';
import { buildVisualJudgePrompt } from './shepherd-staging-smoke-visual-rubric.mjs';
import { evaluateCheckIOutbound, checkIResendSentRowPasses } from './shepherd-staging-smoke-env.mjs';
import { reconcileVisualJudgeComposerSend } from './shepherd-staging-smoke-composer-send-dom.mjs';
import { waitForSharedSlugApiReady } from './shepherd-staging-smoke-shared-ui-map.mjs';
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
const checkIText = readFileSync(new URL('./shepherd-staging-smoke-check-i.mjs', import.meta.url), 'utf8');
assert.match(checkIText, /evaluateCheckIOutbound/);
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

const seededUrl = buildSmokeBindThingMediaSeed({ base: 'https://vacation-staging.timesyncher.com' }).seededUrl;
assert.match(seededUrl, /bind-thing-media/);
const rubricSource = readFileSync(new URL('./shepherd-staging-smoke-visual-rubric.mjs', import.meta.url), 'utf8');
assert.match(rubricSource, /icon-only up-arrow|paper-plane/i);
assert.match(buildVisualJudgePrompt({ screenLabel: 'v1', pageKind: 'chat', stateId: 'v1', tabLabel: '', viewport: { width: 390, height: 844 }, screenSpecText: 'spec', specSource: 'test', layoutDomFacts: '' }), /paper-plane/i);
const liveRow = { status: 'sent', provider: 'resend', error_summary: null, provider_message_id: 'abc' };
assert.equal(checkIResendSentRowPasses(liveRow), true);
const live = evaluateCheckIOutbound({ row: liveRow, env: { TIMESYNCHER_HARNESS_STUB_OUTBOUND: '0' } });
assert.equal(live.pass, true);
assert.equal(live.infraBlocked, false);

const reconciled = reconcileVisualJudgeComposerSend(
  { pass: false, failures: [{ rubricItem: '2', reason: 'send control not visible' }] },
  { id: 'sendButton', ariaLabel: 'Send', role: 'button' },
);
assert.equal(reconciled.pass, true);

let apiStatuses = [404, 404, 200];
const apiReady = await waitForSharedSlugApiReady(
  { evaluate: async () => false },
  'https://vacation-staging.timesyncher.com/shared/intake-abc/',
  {
    timeoutMs: 5000,
    intervalMs: 10,
    fetchStatus: async () => apiStatuses.shift() ?? 200,
  },
);
assert.equal(apiReady.ok, true);
assert.equal(apiReady.status, 200);

apiStatuses = [404, 404];
const apiTimeout = await waitForSharedSlugApiReady(
  { evaluate: async () => false },
  'https://vacation-staging.timesyncher.com/shared/intake-abc/',
  {
    timeoutMs: 40,
    intervalMs: 15,
    fetchStatus: async () => 404,
  },
);
assert.equal(apiTimeout.ok, false);
assert.equal(apiTimeout.timedOut, true);

console.log('shepherd staging smoke eng rulings tests passed');
