#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHOR_SETS, ANCHOR_SET_VERSION } from './anchors.mjs';
import { SSR_CHECKPOINTS } from './checkpoints.mjs';
import {
  ALLOWED_STAGING_ORIGIN,
  assertCopyRules,
  assertNoOpenRouterInPath,
  assertSsrTargetSafe,
} from './safety.mjs';

const ssrDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(ssrDir, '../../..');

assert.equal(ALLOWED_STAGING_ORIGIN, 'https://vacation-staging.timesyncher.com');

assert.equal(
  assertSsrTargetSafe({
    origin: ALLOWED_STAGING_ORIGIN,
    destination: 'Hilo',
    name: 'Avery Hale',
    email: 'avery-throwaway@harness.invalid',
    shareToken: 'THROWAWAY123',
    tripId: '11111111-2222-4333-8444-555555555555',
  }),
  true,
);

assert.throws(() => assertSsrTargetSafe({ shareToken: '8CQX-nyc' }), /protected-share/);
assert.throws(() => assertSsrTargetSafe({ tripId: '99' }), /protected-trip/);
assert.throws(() => assertSsrTargetSafe({ tripId: 'd0463815-aaaa-4bbb-8ccc-111111111111' }), /protected-trip/);
assert.throws(() => assertSsrTargetSafe({ destination: 'Santa Barbara' }), /santa barbara/i);
assert.throws(() => assertSsrTargetSafe({ name: 'Kim' }), /protected account/i);
assert.throws(() => assertSsrTargetSafe({ email: 'kim@example.com' }), /protected account/i);
assert.throws(() => assertSsrTargetSafe({ name: 'Craig' }), /protected-account/);
assert.throws(() => assertSsrTargetSafe({ origin: 'https://timesyncher.com' }), /staging only/);
assert.throws(() => assertSsrTargetSafe({ origin: 'http://vacation-staging.timesyncher.com' }), /staging only/);
assert.throws(
  () => assertSsrTargetSafe({ shareToken: `${['sk', 'live', 'abcdef12345'].join('_')}` }),
  /Stripe live key/,
);

const ssrFiles = fs
  .readdirSync(ssrDir)
  .filter((name) => name.endsWith('.mjs') || name.endsWith('.py'))
  .map((name) => path.join(ssrDir, name));
const harnessFiles = fs
  .readdirSync(path.join(root, 'scripts/harness'))
  .filter((name) => name.endsWith('.mjs'))
  .map((name) => path.join(root, 'scripts/harness', name));
harnessFiles.push(path.join(root, 'scripts/vk-customer-harness.mjs'));

const scan = assertNoOpenRouterInPath([...ssrFiles, ...harnessFiles]);
assert.equal(scan.ok, true);
assert.ok(scan.scanned >= ssrFiles.length);

const allCopy = [
  ...SSR_CHECKPOINTS.map((item) => item.prompt),
  ...SSR_CHECKPOINTS.map((item) => item.label),
  ...Object.values(ANCHOR_SETS[ANCHOR_SET_VERSION]).flatMap((sets) => sets.flat()),
];
assert.equal(assertCopyRules(allCopy), true);

console.log('test_c10_safety: ok');
