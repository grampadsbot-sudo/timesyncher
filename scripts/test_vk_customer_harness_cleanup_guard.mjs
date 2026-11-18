#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assertCleanupAllowed } from './harness/cleanup.mjs';
import { harnessTag, protectedReason } from './harness/protected.mjs';

const tag = harnessTag('r1', 'dry-run');
const safe = { harnessTag: tag, tripId: '11111111-2222-4333-8444-555555555555', shareToken: 'intake-abc123', email: 'avery@harness.invalid', displayName: 'Avery Hale' };
assert.equal(protectedReason(safe), '');
assert.doesNotThrow(() => assertCleanupAllowed({ tag, rows: [safe] }));
assert.throws(() => assertCleanupAllowed({ tag: 'customer', rows: [] }), /cleanup tag is missing/);
assert.throws(() => assertCleanupAllowed({ tag, rows: [{ ...safe, harnessTag: '' }] }), /untagged/);
assert.equal(protectedReason({ tripId: '99' }), 'protected-trip');
assert.throws(() => assertCleanupAllowed({ tag, rows: [{ ...safe, tripId: '99' }] }), /protected-trip/);
assert.equal(protectedReason({ tripId: 'd0463815-0000-4000-8000-000000000001' }), 'protected-trip');
assert.throws(() => assertCleanupAllowed({ tag, rows: [{ ...safe, tripId: 'd0463815-0000-4000-8000-000000000001' }] }), /protected-trip/);
assert.equal(protectedReason({ shareToken: '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y' }), 'protected-share');
assert.throws(() => assertCleanupAllowed({ tag, rows: [{ ...safe, shareToken: '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y' }] }), /protected-share/);
assert.equal(protectedReason({ displayName: 'Craig' }), 'protected-account');
assert.equal(protectedReason({ email: 'craig@example.com' }), 'protected-account');
assert.throws(() => assertCleanupAllowed({ tag, rows: [{ ...safe, displayName: 'Craig' }] }), /protected-account/);
console.log('test_vk_customer_harness_cleanup_guard: ok');
