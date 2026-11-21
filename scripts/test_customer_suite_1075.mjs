#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertSafeThrowaway,
  assertStagingUrl,
  registerSecret,
  scrub,
} from './customer_suite/config.mjs';
import { copyViolations, Scenario } from './customer_suite/harness.mjs';
import { assertThrowawayEmail, suiteHarnessTag } from './customer_suite/cleanup.mjs';
import { checkStagingDeploy } from './customer_suite/deploy-watch.mjs';
import { LABELS, marker, reportRun } from './customer_suite/report.mjs';

assert.equal(assertStagingUrl('https://vacation-staging.timesyncher.com/vacation-app.html'), 'https://vacation-staging.timesyncher.com');
assert.equal(assertStagingUrl('http://127.0.0.1:8787/test'), 'http://127.0.0.1:8787');
assert.throws(() => assertStagingUrl('https://www.timesyncher.com/'), /non-staging/);
assert.throws(() => assertStagingUrl('https://travel.timesyncher.com/'), /non-staging/);
assert.throws(() => assertStagingUrl('http://vacation-staging.timesyncher.com/'), /non-https/);

assert.throws(() => assertSafeThrowaway({ shareToken: '8CQX-test' }), /refused/);
assert.throws(() => assertSafeThrowaway({ tripId: '99' }), /refused/);
assert.throws(() => assertSafeThrowaway({ tripId: 'd0463815-1111-4000-8000-000000000001' }), /refused/);
assert.throws(() => assertSafeThrowaway({ destination: 'Santa Barbara, CA' }), /refused/);
assert.throws(() => assertSafeThrowaway({ displayName: 'Kim Davidson' }), /refused/);
assert.throws(() => assertSafeThrowaway({ email: 'craig@example.com' }), /refused/);
assert.doesNotThrow(() => assertSafeThrowaway({ displayName: 'Avery Hale', email: 'vksuite+run1+owner@example.test', destination: 'Monterey, CA' }));

assert.equal(assertThrowawayEmail('vksuite+run1+owner@example.test'), 'vksuite+run1+owner@example.test');
assert.throws(() => assertThrowawayEmail('user@gmail.com'), /non-throwaway/);
assert.match(suiteHarnessTag('20261121T180000Z'), /^harness:20261121t180000z:vksuite$/);

assert.deepEqual(copyViolations('Start your Vacay Keepsake AI vacation assistant', { requireVacation: true, requireAi: true }), []);
assert.ok(copyViolations('Plan your trip now', { requireVacation: false, forbidTrip: true }).some((h) => h.startsWith('banned-copy:')));
assert.ok(copyViolations('Vacay Keepsake stub chrome', { requireVacation: true }).some((h) => h.startsWith('stub-chrome:')));
assert.ok(copyViolations('Vacay Keepsake [object Object]', { requireVacation: true }).some((h) => h.startsWith('engineering-chrome:')));

registerSecret('super-secret-admin-token-999');
const scrubbed = scrub('url=postgres://user:pass@host/db token=super-secret-admin-token-999 Bearer vkm_abcdefghijklmno session=abcdefghijklmnop');
assert.equal(scrubbed.includes('super-secret-admin-token-999'), false);
assert.equal(scrubbed.includes('postgres://'), false);
assert.equal(scrubbed.includes('vkm_abcdefghijklmno'), false);
assert.equal(scrubbed.includes('abcdefghijklmnop'), false);

const firstDeploy = await checkStagingDeploy({
  base: 'https://vacation-staging.timesyncher.com',
  state: { lastFullRunSha: 'aaaa1111' },
  fetchImpl: async () => ({ json: async () => ({ ok: true, sha: 'bbbb2222' }) }),
});
assert.equal(firstDeploy.needsRun, true);
assert.equal(firstDeploy.sha, 'bbbb2222');

const sameDeploy = await checkStagingDeploy({
  base: 'https://vacation-staging.timesyncher.com',
  state: { lastFullRunSha: 'bbbb2222' },
  fetchImpl: async () => ({ json: async () => ({ ok: true, sha: 'bbbb2222' }) }),
});
assert.equal(sameDeploy.needsRun, false);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-suite-unit-'));
try {
  const dir = path.join(tmp, '20261121T120000Z');
  const shotsDir = path.join(dir, 'screenshots');
  fs.mkdirSync(shotsDir, { recursive: true });
  const shot390 = path.join(shotsDir, 'S1-01-step-390.png');
  fs.writeFileSync(shot390, Buffer.from('89504e470d0a1a0a', 'hex'));
  const sc = new Scenario({ id: '20261121T120000Z', dir, shotsDir }, 'S1', 'Sign up');
  sc.steps.push({ step: 'signed-in-app', screenshots: { 390: shot390 } });
  sc.check('signed-in-app', 'visible text "vacation"', false, 'missing');

  const issues = [];
  const comments = [];
  const rings = [];
  const api = {
    async request(p, { method = 'GET', body } = {}) {
      if (p.includes('/labels')) return LABELS;
      if (p.includes('/git/ref/heads/')) return { object: { sha: 'abc' } };
      if (p.includes('/contents/')) return {};
      if (p.includes('/issues?')) return issues.filter((i) => i.state === 'open');
      if (p.includes('/comments')) {
        comments.push(body.body);
        return {};
      }
      if (method === 'POST' && p.endsWith('/issues')) {
        const created = { number: issues.length + 1, state: 'open', html_url: 'https://github.com/test/1', ...body };
        issues.push(created);
        return created;
      }
      throw new Error(`unexpected ${method} ${p}`);
    },
  };

  const first = await reportRun({
    run: { id: '20261121T120000Z', dir, shotsDir },
    target: { base: 'https://vacation-staging.timesyncher.com', sha: '8ee99a37' },
    scenarios: [sc],
    api,
    ring: (msg) => {
      rings.push(msg);
      return 'rung';
    },
  });
  assert.equal(first[0].action, 'created');
  assert.equal(rings.length, 1);
  assert.ok(issues[0].body.includes(marker('S1')));

  const second = await reportRun({
    run: { id: '20261121T140000Z', dir, shotsDir },
    target: { base: 'https://vacation-staging.timesyncher.com', sha: '8ee99a37' },
    scenarios: [sc],
    api,
    ring: (msg) => {
      rings.push(msg);
      return 'rung';
    },
  });
  assert.equal(second[0].action, 'updated');
  assert.equal(rings.length, 1);
  assert.equal(comments.length, 1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('test_customer_suite_1075: ok');
